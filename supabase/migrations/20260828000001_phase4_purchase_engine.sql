-- ============================================================================
-- SMART ELECTRICITY: PHASE 4 DATABASE MIGRATION
-- Production Electricity Purchase, Vending Engine & Atomic Financial RPCs
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- 1. EXTEND ELECTRICITY TRANSACTIONS TABLE
-- ----------------------------------------------------------------------------
ALTER TABLE public.electricity_transactions
ADD COLUMN IF NOT EXISTS meter_type TEXT DEFAULT 'prepaid' CHECK (meter_type IN ('prepaid', 'postpaid')),
ADD COLUMN IF NOT EXISTS disco_name TEXT,
ADD COLUMN IF NOT EXISTS service_fee_kobo BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS customer_charge_kobo BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS token_serial_number TEXT,
ADD COLUMN IF NOT EXISTS failure_code TEXT,
ADD COLUMN IF NOT EXISTS failure_message TEXT,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill customer_charge_kobo where 0
UPDATE public.electricity_transactions
SET customer_charge_kobo = amount_kobo + service_fee_kobo
WHERE customer_charge_kobo = 0;

-- 2. ENSURE COMPREHENSIVE PERFORMANCE & IDEMPOTENCY INDEXES
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_electricity_tx_idempotency 
ON public.electricity_transactions (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_electricity_tx_reference 
ON public.electricity_transactions (reference);

CREATE INDEX IF NOT EXISTS idx_electricity_tx_user_status 
ON public.electricity_transactions (user_id, status, created_at DESC);

-- 3. STORED PROCEDURE: EXECUTE ELECTRICITY PURCHASE INIT (ATOMIC TWO-PHASE DEBIT)
-- ----------------------------------------------------------------------------
-- Atomically:
-- 1. Checks idempotency.
-- 2. Verifies user wallet & locks wallet row.
-- 3. Verifies meter ownership (if meter_id is supplied).
-- 4. Debits wallet balance for (amount_kobo + service_fee_kobo).
-- 5. Creates wallet ledger debit entry.
-- 6. Creates electricity transaction record in 'processing' status.
CREATE OR REPLACE FUNCTION public.execute_electricity_purchase_init(
    p_user_id UUID,
    p_meter_id UUID,
    p_meter_number VARCHAR(32),
    p_meter_type TEXT,
    p_disco_code VARCHAR(32),
    p_disco_name TEXT,
    p_amount_kobo BIGINT,
    p_service_fee_kobo BIGINT,
    p_reference VARCHAR(64),
    p_idempotency_key VARCHAR(128),
    p_provider_name TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_wallet public.wallet_accounts%ROWTYPE;
    v_meter public.meters%ROWTYPE;
    v_total_charge_kobo BIGINT;
    v_balance_before BIGINT;
    v_balance_after BIGINT;
    v_wallet_tx_id UUID;
    v_elec_tx_id UUID;
    v_existing_elec_tx public.electricity_transactions%ROWTYPE;
BEGIN
    -- 1. Check idempotency: if transaction already exists, return its current state
    SELECT * INTO v_existing_elec_tx
    FROM public.electricity_transactions
    WHERE idempotency_key = p_idempotency_key OR reference = p_reference;

    IF v_existing_elec_tx.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'status', v_existing_elec_tx.status,
            'transaction_id', v_existing_elec_tx.id,
            'reference', v_existing_elec_tx.reference,
            'token', v_existing_elec_tx.token,
            'units_kwh', v_existing_elec_tx.units_kwh
        );
    END IF;

    -- 2. Validate Amount Range (min ₦500 = 50,000 kobo, max ₦500,000 = 50,000,000 kobo)
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

    -- If wallet doesn't exist yet, automatically initialize it
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
        service_fee_kobo,
        customer_charge_kobo,
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
        p_disco_name,
        p_amount_kobo,
        p_service_fee_kobo,
        v_total_charge_kobo,
        'processing',
        p_reference,
        p_provider_name,
        p_idempotency_key
    ) RETURNING id INTO v_elec_tx_id;

    -- 8. Insert wallet transaction ledger record
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
        -v_total_charge_kobo,
        v_balance_before,
        v_balance_after,
        'WTX-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
        'Electricity Purchase: ' || p_disco_code || ' (' || p_meter_number || ')',
        p_idempotency_key,
        v_elec_tx_id
    ) RETURNING id INTO v_wallet_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'processing',
        'transaction_id', v_elec_tx_id,
        'wallet_id', v_wallet.id,
        'wallet_tx_id', v_wallet_tx_id,
        'reference', p_reference,
        'amount_kobo', p_amount_kobo,
        'total_charge_kobo', v_total_charge_kobo,
        'new_balance_kobo', v_balance_after
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. STORED PROCEDURE: FINALIZE ELECTRICITY PURCHASE SUCCESS
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

    -- If already successful, return existing
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
        'Electricity Token Vended!',
        'Token: ' || p_token || ' (' || COALESCE(p_units_kwh::text, '0') || ' kWh)',
        jsonb_build_object(
            'transaction_id', v_tx.id,
            'token', p_token,
            'units_kwh', p_units_kwh,
            'reference', v_tx.reference
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'successful',
        'token', p_token,
        'units_kwh', p_units_kwh,
        'reference', v_tx.reference
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. STORED PROCEDURE: FINALIZE ELECTRICITY PURCHASE FAILURE (AUTOMATIC REFUND)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_electricity_purchase_failure(
    p_transaction_id UUID,
    p_failure_code TEXT,
    p_failure_message TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_tx public.electricity_transactions%ROWTYPE;
    v_wallet public.wallet_accounts%ROWTYPE;
    v_balance_before BIGINT;
    v_balance_after BIGINT;
    v_refund_tx_id UUID;
BEGIN
    SELECT * INTO v_tx
    FROM public.electricity_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF v_tx.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'TRANSACTION_NOT_FOUND');
    END IF;

    -- Cannot fail already successful transaction
    IF v_tx.status = 'successful' THEN
        RETURN jsonb_build_object('success', false, 'error', 'CANNOT_FAIL_SUCCESSFUL_TRANSACTION');
    END IF;

    -- If already reversed or failed, idempotent return
    IF v_tx.status = 'reversed' OR v_tx.status = 'failed' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_refunded');
    END IF;

    -- Lock wallet row
    SELECT * INTO v_wallet
    FROM public.wallet_accounts
    WHERE id = v_tx.wallet_id AND user_id = v_tx.user_id
    FOR UPDATE;

    v_balance_before := v_wallet.balance_kobo;
    v_balance_after := v_balance_before + v_tx.customer_charge_kobo;

    -- Refund balance
    UPDATE public.wallet_accounts
    SET balance_kobo = v_balance_after,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- Update transaction state to failed / reversed
    UPDATE public.electricity_transactions
    SET status = 'reversed',
        failure_code = p_failure_code,
        failure_message = p_failure_message,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_transaction_id;

    -- Insert wallet refund ledger entry
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
        v_tx.user_id,
        v_wallet.id,
        'refund_credit',
        v_tx.customer_charge_kobo,
        v_balance_before,
        v_balance_after,
        'WTX-REF-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
        'Refund for failed electricity vending (' || COALESCE(p_failure_code, 'FAILED') || ')',
        'REFUND-' || v_tx.idempotency_key,
        v_tx.id
    ) RETURNING id INTO v_refund_tx_id;

    -- Add failure notification
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data
    ) VALUES (
        v_tx.user_id,
        'alert',
        'Electricity Purchase Refunded',
        'Your ₦' || (v_tx.customer_charge_kobo / 100)::text || ' purchase was refunded: ' || COALESCE(p_failure_message, 'Vending could not be completed'),
        jsonb_build_object(
            'transaction_id', v_tx.id,
            'refund_tx_id', v_refund_tx_id,
            'amount_kobo', v_tx.customer_charge_kobo
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'reversed',
        'refund_amount_kobo', v_tx.customer_charge_kobo,
        'new_balance_kobo', v_balance_after,
        'refund_tx_id', v_refund_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
