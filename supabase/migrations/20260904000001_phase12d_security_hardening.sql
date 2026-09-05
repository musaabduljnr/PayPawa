-- ============================================================================
-- PAYPAWA: PHASE 12D DATABASE MIGRATION
-- Security & Environment Hardening, Search Path Protection, Rate Limiting & RLS Lockdown
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SERVER-SIDE RATE LIMITING INFRASTRUCTURE
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(128) NOT NULL, -- IP address, user_id, or meter_number
    action VARCHAR(64) NOT NULL,     -- 'login', 'fund_wallet', 'vend_token', 'lookup_meter', 'ai_prompt'
    window_start TIMESTAMPTZ NOT NULL,
    count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_rate_limit UNIQUE (identifier, action, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON public.rate_limits (identifier, action, window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits (window_start);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Rate limits table is server-managed only
DROP POLICY IF EXISTS "Staff with audit.view can read rate limits" ON public.rate_limits;
CREATE POLICY "Staff with audit.view can read rate limits"
    ON public.rate_limits FOR SELECT
    TO authenticated
    USING (public.has_permission(auth.uid(), 'audit.view'));

-- Atomic rate limit verification stored procedure
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_identifier TEXT,
    p_action TEXT,
    p_max_requests INT,
    p_window_seconds INT DEFAULT 60
)
RETURNS JSONB AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_current_count INT;
    v_allowed BOOLEAN;
BEGIN
    -- Calculate fixed time window slot
    v_window_start := to_timestamp(floor(extract(epoch from NOW()) / p_window_seconds) * p_window_seconds);

    -- Upsert atomic counter for this window
    INSERT INTO public.rate_limits (identifier, action, window_start, count)
    VALUES (p_identifier, p_action, v_window_start, 1)
    ON CONFLICT (identifier, action, window_start)
    DO UPDATE SET count = public.rate_limits.count + 1
    RETURNING count INTO v_current_count;

    IF v_current_count <= p_max_requests THEN
        v_allowed := TRUE;
    ELSE
        v_allowed := FALSE;
    END IF;

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'action', p_action,
        'current_count', v_current_count,
        'max_requests', p_max_requests,
        'window_seconds', p_window_seconds,
        'retry_after_seconds', GREATEST(0, ceil(extract(epoch from (v_window_start + (p_window_seconds || ' seconds')::interval - NOW())))::INT)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 2. HARDEN STORED PROCEDURE: CREDIT WALLET FROM PAYMENT
-- Critical Security Fix: Restrict to service_role or superuser to prevent client fraud.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_wallet_from_payment(
    p_user_id UUID,
    p_payment_attempt_id UUID,
    p_idempotency_key VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    v_payment public.payment_attempts%ROWTYPE;
    v_wallet public.wallet_accounts%ROWTYPE;
    v_balance_before BIGINT;
    v_balance_after BIGINT;
    v_wallet_tx_id UUID;
    v_caller_role TEXT := current_setting('role', true);
BEGIN
    -- 0. Caller Authorization Check
    -- Only backend service_role, superuser, or trusted server process can credit wallet
    IF v_caller_role <> 'service_role' AND v_caller_role <> 'superuser' THEN
        -- Allow authenticated user ONLY if the payment attempt has already been verified and signed by provider
        -- but reject if the payment is still unconfirmed / initiated
        SELECT * INTO v_payment
        FROM public.payment_attempts
        WHERE id = p_payment_attempt_id AND user_id = p_user_id;

        IF v_payment.id IS NULL THEN
            RAISE EXCEPTION 'Payment attempt not found or unauthorized.';
        END IF;

        IF v_payment.status <> 'successful' AND v_caller_role <> 'service_role' AND v_caller_role <> 'superuser' THEN
            RAISE EXCEPTION 'Unauthorized: direct client execution of credit_wallet_from_payment is prohibited. Payment must be confirmed by server webhook.';
        END IF;
    END IF;

    -- 1. Idempotency check: if transaction already processed with this key, return it
    SELECT id INTO v_wallet_tx_id
    FROM public.wallet_transactions
    WHERE idempotency_key = p_idempotency_key;

    IF v_wallet_tx_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_processed',
            'transaction_id', v_wallet_tx_id
        );
    END IF;

    -- 2. Fetch and lock payment attempt
    SELECT * INTO v_payment
    FROM public.payment_attempts
    WHERE id = p_payment_attempt_id AND user_id = p_user_id
    FOR UPDATE;

    IF v_payment.id IS NULL THEN
        RAISE EXCEPTION 'Payment attempt not found for user.';
    END IF;

    IF v_payment.status = 'successful' THEN
        -- Check if wallet tx already exists for this payment attempt
        SELECT id INTO v_wallet_tx_id
        FROM public.wallet_transactions
        WHERE related_payment_attempt_id = v_payment.id;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_completed',
            'transaction_id', v_wallet_tx_id
        );
    END IF;

    -- 3. Lock wallet row exclusively
    SELECT * INTO v_wallet
    FROM public.wallet_accounts
    WHERE id = v_payment.wallet_id AND user_id = p_user_id
    FOR UPDATE;

    IF v_wallet.id IS NULL THEN
        RAISE EXCEPTION 'Wallet account not found for user.';
    END IF;

    IF v_wallet.is_locked THEN
        RAISE EXCEPTION 'Wallet account is locked. Please contact customer support.';
    END IF;

    v_balance_before := v_wallet.balance_kobo;
    v_balance_after := v_balance_before + v_payment.amount_kobo;

    -- 4. Update wallet balance
    UPDATE public.wallet_accounts
    SET balance_kobo = v_balance_after,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- 5. Mark payment attempt as successful
    UPDATE public.payment_attempts
    SET status = 'successful',
        updated_at = NOW()
    WHERE id = v_payment.id;

    -- 6. Insert immutable audit ledger entry
    INSERT INTO public.wallet_transactions (
        user_id,
        wallet_id,
        type,
        amount_kobo,
        balance_before_kobo,
        balance_after_kobo,
        reference,
        description,
        idempotency_key,
        related_payment_attempt_id
    ) VALUES (
        p_user_id,
        v_wallet.id,
        'funding',
        v_payment.amount_kobo,
        v_balance_before,
        v_balance_after,
        'WTX-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
        'Wallet top-up via ' || v_payment.method::text,
        p_idempotency_key,
        v_payment.id
    ) RETURNING id INTO v_wallet_tx_id;

    -- 7. Trigger notification for successful funding
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data
    ) VALUES (
        p_user_id,
        'payment_success',
        'Wallet Funded Successfully! 💳',
        'Your wallet has been credited with ₦' || trim(to_char(v_payment.amount_kobo / 100.0, '999,999,990.00')) || '. Current balance: ₦' || trim(to_char(v_balance_after / 100.0, '999,999,990.00')),
        jsonb_build_object(
            'wallet_id', v_wallet.id,
            'transaction_id', v_wallet_tx_id,
            'amount_kobo', v_payment.amount_kobo,
            'balance_kobo', v_balance_after
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'credited',
        'balance_kobo', v_balance_after,
        'transaction_id', v_wallet_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 3. HARDEN STORED PROCEDURE: EXECUTE ELECTRICITY PURCHASE INIT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_electricity_purchase_init(
    p_user_id UUID,
    p_meter_id UUID,
    p_meter_number VARCHAR(32),
    p_meter_type VARCHAR(16),
    p_disco_code VARCHAR(32),
    p_disco_name TEXT,
    p_amount_kobo BIGINT,
    p_service_fee_kobo BIGINT,
    p_reference VARCHAR(64),
    p_idempotency_key VARCHAR(128),
    p_provider_name TEXT DEFAULT 'squad'
)
RETURNS JSONB AS $$
DECLARE
    v_existing_elec_tx public.electricity_transactions%ROWTYPE;
    v_wallet public.wallet_accounts%ROWTYPE;
    v_meter public.meters%ROWTYPE;
    v_balance_before BIGINT;
    v_balance_after BIGINT;
    v_total_charge_kobo BIGINT;
    v_elec_tx_id UUID;
    v_wallet_tx_id UUID;
BEGIN
    -- Security Caller Authorization check
    IF auth.uid() IS NULL AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthenticated: Valid session required.';
    ELSIF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot initiate purchase for another user.';
    END IF;

    -- 1. Idempotency check on electricity transactions
    SELECT * INTO v_existing_elec_tx
    FROM public.electricity_transactions
    WHERE idempotency_key = p_idempotency_key OR reference = p_reference;

    IF v_existing_elec_tx.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_initialized',
            'transaction_id', v_existing_elec_tx.id,
            'reference', v_existing_elec_tx.reference,
            'current_status', v_existing_elec_tx.status
        );
    END IF;

    -- 2. Validate financial limits
    IF p_amount_kobo < 50000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_AMOUNT',
            'error_message', 'Minimum purchase amount is ₦500.00'
        );
    END IF;

    IF p_amount_kobo > 50000000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'LIMIT_EXCEEDED',
            'error_message', 'Maximum single purchase limit is ₦500,000.00'
        );
    END IF;

    v_total_charge_kobo := p_amount_kobo + COALESCE(p_service_fee_kobo, 0);

    -- 3. Verify meter ownership if meter_id is supplied
    IF p_meter_id IS NOT NULL THEN
        SELECT * INTO v_meter
        FROM public.meters
        WHERE id = p_meter_id AND user_id = p_user_id;

        IF v_meter.id IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'UNAUTHORIZED_METER',
                'error_message', 'The specified meter is not registered under your account'
            );
        END IF;
    END IF;

    -- 4. Lock user wallet row exclusively
    SELECT * INTO v_wallet
    FROM public.wallet_accounts
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_wallet.id IS NULL THEN
        INSERT INTO public.wallet_accounts (user_id, balance_kobo, currency, is_locked)
        VALUES (p_user_id, 0, 'NGN', FALSE)
        RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.is_locked THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'WALLET_LOCKED',
            'error_message', 'Your wallet account is temporarily locked. Please contact support.'
        );
    END IF;

    -- 5. Verify sufficient wallet balance
    IF v_wallet.balance_kobo < v_total_charge_kobo THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INSUFFICIENT_FUNDS',
            'error_message', 'Insufficient wallet balance for this purchase',
            'available_kobo', v_wallet.balance_kobo,
            'required_kobo', v_total_charge_kobo
        );
    END IF;

    v_balance_before := v_wallet.balance_kobo;
    v_balance_after := v_balance_before - v_total_charge_kobo;

    -- 6. Debit wallet balance
    UPDATE public.wallet_accounts
    SET balance_kobo = v_balance_after,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- 7. Insert initial electricity transaction in 'processing' status
    INSERT INTO public.electricity_transactions (
        user_id,
        wallet_id,
        meter_id,
        meter_number,
        meter_type,
        disco_code,
        disco_name,
        amount_kobo,
        status,
        reference,
        provider_name,
        idempotency_key
    ) VALUES (
        p_user_id,
        v_wallet.id,
        p_meter_id,
        p_meter_number,
        COALESCE(p_meter_type, 'prepaid'),
        p_disco_code,
        COALESCE(p_disco_name, p_disco_code),
        p_amount_kobo,
        'processing',
        p_reference,
        COALESCE(p_provider_name, 'squad'),
        p_idempotency_key
    ) RETURNING id INTO v_elec_tx_id;

    -- 8. Record atomic ledger entry for wallet debit
    INSERT INTO public.wallet_transactions (
        user_id,
        wallet_id,
        type,
        amount_kobo,
        balance_before_kobo,
        balance_after_kobo,
        reference,
        description,
        idempotency_key,
        related_electricity_tx_id
    ) VALUES (
        p_user_id,
        v_wallet.id,
        'purchase_debit',
        v_total_charge_kobo,
        v_balance_before,
        v_balance_after,
        'WTX-DEC-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
        'Electricity Purchase: ' || p_meter_number || ' (' || COALESCE(p_disco_name, p_disco_code) || ')',
        'DEC-' || p_idempotency_key,
        v_elec_tx_id
    ) RETURNING id INTO v_wallet_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'debited',
        'transaction_id', v_elec_tx_id,
        'wallet_tx_id', v_wallet_tx_id,
        'reference', p_reference,
        'balance_kobo', v_balance_after,
        'charged_kobo', v_total_charge_kobo
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 4. HARDEN STORED PROCEDURE: FINALIZE ELECTRICITY PURCHASE SUCCESS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_electricity_purchase_success(
    p_transaction_id UUID,
    p_provider_tx_id TEXT,
    p_token VARCHAR(64),
    p_units_kwh NUMERIC(10, 2),
    p_tariff_per_kwh_kobo BIGINT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_tx public.electricity_transactions%ROWTYPE;
BEGIN
    SELECT * INTO v_tx
    FROM public.electricity_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF v_tx.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'TRANSACTION_NOT_FOUND');
    END IF;

    -- Security Caller Authorization check
    IF auth.uid() IS NULL AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthenticated: Valid session required.';
    ELSIF auth.uid() IS NOT NULL AND auth.uid() <> v_tx.user_id AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot modify transaction belonging to another user.';
    END IF;

    -- If already successful, return existing idempotent result
    IF v_tx.status = 'successful' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_successful', 'token', v_tx.token);
    END IF;

    -- Update transaction state to successful
    UPDATE public.electricity_transactions
    SET status = 'successful',
        provider_transaction_id = COALESCE(p_provider_tx_id, provider_transaction_id),
        token = p_token,
        units_kwh = p_units_kwh,
        tariff_per_kwh_kobo = p_tariff_per_kwh_kobo,
        metadata = COALESCE(p_metadata, metadata),
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_transaction_id;

    -- Log Consumption Record for meter analytics if meter_id is present and units > 0
    IF v_tx.meter_id IS NOT NULL AND p_units_kwh IS NOT NULL AND p_units_kwh > 0 THEN
        INSERT INTO public.consumption_records (
            user_id,
            meter_id,
            date,
            units_consumed_kwh,
            estimated_cost_kobo
        ) VALUES (
            v_tx.user_id,
            v_tx.meter_id,
            CURRENT_DATE,
            p_units_kwh,
            v_tx.amount_kobo
        )
        ON CONFLICT (meter_id, date) DO UPDATE
        SET units_consumed_kwh = public.consumption_records.units_consumed_kwh + EXCLUDED.units_consumed_kwh,
            estimated_cost_kobo = public.consumption_records.estimated_cost_kobo + EXCLUDED.estimated_cost_kobo;
    END IF;

    -- Send push notification entry
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data
    ) VALUES (
        v_tx.user_id,
        'purchase',
        'Electricity Token Vended! ⚡',
        'Token: ' || p_token || ' (' || COALESCE(p_units_kwh::text, '0') || ' kWh)',
        jsonb_build_object(
            'transaction_id', v_tx.id,
            'meter_number', v_tx.meter_number,
            'token', p_token,
            'units_kwh', p_units_kwh,
            'amount_kobo', v_tx.amount_kobo
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'finalized',
        'token', p_token,
        'units_kwh', p_units_kwh
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 5. HARDEN STORED PROCEDURE: REFUND ELECTRICITY PURCHASE FAILED
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_electricity_purchase_failed(
    p_transaction_id UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_elec_tx public.electricity_transactions%ROWTYPE;
    v_wallet public.wallet_accounts%ROWTYPE;
    v_balance_before BIGINT;
    v_balance_after BIGINT;
    v_refund_tx_id UUID;
BEGIN
    SELECT * INTO v_elec_tx
    FROM public.electricity_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF v_elec_tx.id IS NULL THEN
        RAISE EXCEPTION 'Electricity transaction not found';
    END IF;

    -- Security Caller Authorization check
    IF auth.uid() IS NULL AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthenticated: Valid session required.';
    ELSIF auth.uid() IS NOT NULL AND auth.uid() <> v_elec_tx.user_id AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot refund transaction of another user.';
    END IF;

    -- If already reversed or refunded, return existing state
    IF v_elec_tx.status IN ('reversed', 'failed') THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_' || v_elec_tx.status::text,
            'transaction_id', v_elec_tx.id
        );
    END IF;

    -- Lock user wallet
    SELECT * INTO v_wallet
    FROM public.wallet_accounts
    WHERE id = v_elec_tx.wallet_id AND user_id = v_elec_tx.user_id
    FOR UPDATE;

    IF v_wallet.id IS NULL THEN
        RAISE EXCEPTION 'Wallet account not found';
    END IF;

    v_balance_before := v_wallet.balance_kobo;
    v_balance_after := v_balance_before + v_elec_tx.amount_kobo;

    -- 1. Credit wallet back
    UPDATE public.wallet_accounts
    SET balance_kobo = v_balance_after,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- 2. Update electricity transaction to reversed
    UPDATE public.electricity_transactions
    SET status = 'reversed',
        error_message = COALESCE(p_reason, 'Provider failed to vend token. Wallet refunded.'),
        updated_at = NOW()
    WHERE id = v_elec_tx.id;

    -- 3. Insert immutable ledger entry for refund
    INSERT INTO public.wallet_transactions (
        user_id,
        wallet_id,
        type,
        amount_kobo,
        balance_before_kobo,
        balance_after_kobo,
        reference,
        description,
        idempotency_key,
        related_electricity_tx_id
    ) VALUES (
        v_elec_tx.user_id,
        v_wallet.id,
        'refund_credit',
        v_elec_tx.amount_kobo,
        v_balance_before,
        v_balance_after,
        'WTX-REF-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
        'Refund: ' || p_reason,
        'REFUND-' || v_elec_tx.id::text,
        v_elec_tx.id
    ) RETURNING id INTO v_refund_tx_id;

    -- 4. Notify user of refund
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data
    ) VALUES (
        v_elec_tx.user_id,
        'warning',
        'Purchase Failed — Wallet Refunded ↩️',
        'Your electricity purchase of ₦' || trim(to_char(v_elec_tx.amount_kobo / 100.0, '999,999,990.00')) || ' could not be completed. Your funds have been fully refunded to your wallet.',
        jsonb_build_object(
            'transaction_id', v_elec_tx.id,
            'refund_tx_id', v_refund_tx_id,
            'amount_kobo', v_elec_tx.amount_kobo,
            'balance_kobo', v_balance_after
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'reversed',
        'balance_kobo', v_balance_after,
        'refund_tx_id', v_refund_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 6. RLS HARDENING: PREVENT DIRECT CLIENT UPDATES TO FINANCIAL TABLES
-- ----------------------------------------------------------------------------

-- A. wallet_accounts: Users can NEVER update or delete wallet balances directly
DROP POLICY IF EXISTS "Deny direct wallet update" ON public.wallet_accounts;
DROP POLICY IF EXISTS "Deny direct wallet delete" ON public.wallet_accounts;

-- B. wallet_transactions: Double-entry ledger is strictly APPEND-ONLY by trusted RPCs
DROP POLICY IF EXISTS "Deny direct wallet transaction updates" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Deny direct wallet transaction deletes" ON public.wallet_transactions;

-- C. payment_attempts: Status cannot be updated directly by authenticated clients
DROP POLICY IF EXISTS "Users can update own payment attempts" ON public.payment_attempts;

-- D. electricity_transactions: Users can NEVER update token or status directly
DROP POLICY IF EXISTS "Users can update own electricity transactions" ON public.electricity_transactions;
