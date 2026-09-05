-- ============================================================================
-- PAYPAWA: PHASE 10C DATABASE MIGRATION
-- Finance, Wallet Ledger, Payment Inbounds & Controlled Adjustment RPCs
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- 1. RLS POLICIES FOR FINANCE OPERATIONS
-- ----------------------------------------------------------------------------

-- A. Payment Attempts: Staff with 'payments.view' can view all payment attempts
DROP POLICY IF EXISTS "Staff can view payment attempts" ON public.payment_attempts;
CREATE POLICY "Staff can view payment attempts"
    ON public.payment_attempts FOR SELECT
    TO authenticated
    USING (public.has_permission(auth.uid(), 'payments.view') OR auth.uid() = user_id);

-- 2. OPERATIONAL STORED PROCEDURES (RPCs)
-- ----------------------------------------------------------------------------

-- A. admin_list_wallets: Lists wallets with authoritative balances and customer metadata
CREATE OR REPLACE FUNCTION public.admin_list_wallets(
    p_search TEXT DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_total_count INT := 0;
    v_wallets JSONB;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'wallets.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks wallets.view permission.';
    END IF;

    SELECT COUNT(*) INTO v_total_count
    FROM public.wallet_accounts w
    LEFT JOIN public.profiles p ON p.id = w.user_id
    WHERE (
        p_search IS NULL OR p_search = '' OR
        w.id::TEXT ILIKE '%' || p_search || '%' OR
        p.full_name ILIKE '%' || p_search || '%' OR
        p.email ILIKE '%' || p_search || '%' OR
        p.phone ILIKE '%' || p_search || '%'
    );

    SELECT COALESCE(jsonb_agg(wallet_row), '[]'::jsonb) INTO v_wallets
    FROM (
        SELECT
            w.id,
            w.user_id,
            w.balance_kobo,
            w.currency,
            w.is_locked,
            w.created_at,
            w.updated_at,
            p.full_name AS customer_name,
            p.email AS customer_email,
            p.phone AS customer_phone,
            (SELECT COUNT(*) FROM public.electricity_transactions et WHERE et.user_id = w.user_id) AS total_purchases_count,
            (SELECT COUNT(*) FROM public.payment_attempts pa WHERE pa.user_id = w.user_id AND pa.status = 'successful') AS total_fundings_count
        FROM public.wallet_accounts w
        LEFT JOIN public.profiles p ON p.id = w.user_id
        WHERE (
            p_search IS NULL OR p_search = '' OR
            w.id::TEXT ILIKE '%' || p_search || '%' OR
            p.full_name ILIKE '%' || p_search || '%' OR
            p.email ILIKE '%' || p_search || '%' OR
            p.phone ILIKE '%' || p_search || '%'
        )
        ORDER BY w.updated_at DESC
        LIMIT p_limit OFFSET p_offset
    ) wallet_row;

    RETURN jsonb_build_object(
        'total', v_total_count,
        'limit', p_limit,
        'offset', p_offset,
        'data', v_wallets
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. admin_list_payments: Lists inbound payment attempts
CREATE OR REPLACE FUNCTION public.admin_list_payments(
    p_search TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_provider TEXT DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_total_count INT := 0;
    v_payments JSONB;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'payments.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks payments.view permission.';
    END IF;

    SELECT COUNT(*) INTO v_total_count
    FROM public.payment_attempts pa
    LEFT JOIN public.profiles p ON p.id = pa.user_id
    WHERE (p_status IS NULL OR p_status = 'ALL' OR pa.status = p_status)
      AND (p_provider IS NULL OR p_provider = 'ALL' OR pa.provider ILIKE p_provider)
      AND (
          p_search IS NULL OR p_search = '' OR
          pa.reference ILIKE '%' || p_search || '%' OR
          p.full_name ILIKE '%' || p_search || '%' OR
          p.email ILIKE '%' || p_search || '%'
      );

    SELECT COALESCE(jsonb_agg(payment_row), '[]'::jsonb) INTO v_payments
    FROM (
        SELECT
            pa.id,
            pa.user_id,
            pa.amount_kobo,
            pa.currency,
            pa.provider,
            pa.status,
            pa.reference,
            pa.idempotency_key,
            pa.created_at,
            pa.verified_at,
            p.full_name AS customer_name,
            p.email AS customer_email
        FROM public.payment_attempts pa
        LEFT JOIN public.profiles p ON p.id = pa.user_id
        WHERE (p_status IS NULL OR p_status = 'ALL' OR pa.status = p_status)
          AND (p_provider IS NULL OR p_provider = 'ALL' OR pa.provider ILIKE p_provider)
          AND (
              p_search IS NULL OR p_search = '' OR
              pa.reference ILIKE '%' || p_search || '%' OR
              p.full_name ILIKE '%' || p_search || '%' OR
              p.email ILIKE '%' || p_search || '%'
          )
        ORDER BY pa.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) payment_row;

    RETURN jsonb_build_object(
        'total', v_total_count,
        'limit', p_limit,
        'offset', p_offset,
        'data', v_payments
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. admin_adjust_wallet_balance: Controlled administrative wallet balance adjustment
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet_balance(
    p_wallet_id UUID,
    p_adjustment_type TEXT, -- 'CREDIT' or 'DEBIT'
    p_amount_kobo BIGINT,
    p_reason TEXT,
    p_reference TEXT,
    p_supporting_note TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_wallet public.wallet_accounts%ROWTYPE;
    v_previous_balance BIGINT;
    v_new_balance BIGINT;
    v_audit_id UUID;
BEGIN
    -- 1. Authorization check: requires 'wallets.adjust'
    IF NOT public.has_permission(v_caller_id, 'wallets.adjust') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks wallets.adjust permission.';
    END IF;

    -- 2. Input validation
    IF p_adjustment_type NOT IN ('CREDIT', 'DEBIT') THEN
        RAISE EXCEPTION 'Invalid adjustment type: must be CREDIT or DEBIT.';
    END IF;

    IF p_amount_kobo <= 0 OR p_amount_kobo > 100000000 THEN -- Max ₦1,000,000 per adjustment
        RAISE EXCEPTION 'Adjustment amount out of bounds: must be between ₦1.00 and ₦1,000,000.00.';
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
        RAISE EXCEPTION 'A valid operational reason (minimum 5 characters) is required.';
    END IF;

    IF p_reference IS NULL OR TRIM(p_reference) = '' THEN
        RAISE EXCEPTION 'An external audit reference is required for all adjustments.';
    END IF;

    -- 3. Row-level Lock (FOR UPDATE)
    SELECT * INTO v_wallet
    FROM public.wallet_accounts
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF v_wallet.id IS NULL THEN
        RAISE EXCEPTION 'Target wallet account not found.';
    END IF;

    IF v_wallet.is_locked THEN
        RAISE EXCEPTION 'Target wallet is currently locked from financial movements.';
    END IF;

    v_previous_balance := v_wallet.balance_kobo;

    -- 4. Calculate new balance
    IF p_adjustment_type = 'CREDIT' THEN
        v_new_balance := v_previous_balance + p_amount_kobo;
    ELSE
        IF v_previous_balance < p_amount_kobo THEN
            RAISE EXCEPTION 'Insufficient balance: Wallet balance (₦%) cannot cover debit adjustment of ₦%.',
                (v_previous_balance / 100)::TEXT,
                (p_amount_kobo / 100)::TEXT;
        END IF;
        v_new_balance := v_previous_balance - p_amount_kobo;
    END IF;

    -- 5. Mutate balance
    UPDATE public.wallet_accounts
    SET balance_kobo = v_new_balance,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- 6. Log immutable audit trail
    SELECT public.log_audit_event(
        v_caller_id,
        'WALLET_ADMIN_ADJUSTMENT',
        'WALLET_ACCOUNT',
        v_wallet.id::TEXT,
        jsonb_build_object(
            'user_id', v_wallet.user_id,
            'adjustment_type', p_adjustment_type,
            'amount_kobo', p_amount_kobo,
            'previous_balance_kobo', v_previous_balance,
            'new_balance_kobo', v_new_balance,
            'reason', p_reason,
            'reference', p_reference,
            'supporting_note', p_supporting_note,
            'idempotency_key', p_idempotency_key
        )
    ) INTO v_audit_id;

    RETURN jsonb_build_object(
        'success', true,
        'wallet_id', v_wallet.id,
        'user_id', v_wallet.user_id,
        'previous_balance_kobo', v_previous_balance,
        'new_balance_kobo', v_new_balance,
        'adjustment_type', p_adjustment_type,
        'amount_kobo', p_amount_kobo,
        'reference', p_reference,
        'audit_id', v_audit_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. admin_get_finance_summary: Computes platform financial overview from authoritative tables
CREATE OR REPLACE FUNCTION public.admin_get_finance_summary()
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_total_funding_kobo BIGINT := 0;
    v_total_vending_kobo BIGINT := 0;
    v_successful_payments_count INT := 0;
    v_pending_payments_count INT := 0;
    v_failed_payments_count INT := 0;
    v_pending_vending_count INT := 0;
    v_total_wallet_liability_kobo BIGINT := 0;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'reports.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks reports.view permission.';
    END IF;

    -- 1. Payment Gateway Aggregates
    SELECT
        COALESCE(SUM(CASE WHEN status = 'successful' THEN amount_kobo ELSE 0 END), 0),
        COUNT(CASE WHEN status = 'successful' THEN 1 END),
        COUNT(CASE WHEN status = 'pending' THEN 1 END),
        COUNT(CASE WHEN status = 'failed' THEN 1 END)
    INTO
        v_total_funding_kobo,
        v_successful_payments_count,
        v_pending_payments_count,
        v_failed_payments_count
    FROM public.payment_attempts;

    -- 2. Electricity Vending Aggregates
    SELECT
        COALESCE(SUM(CASE WHEN status = 'successful' THEN amount_kobo ELSE 0 END), 0),
        COUNT(CASE WHEN status = 'processing' OR status = 'unknown' THEN 1 END)
    INTO
        v_total_vending_kobo,
        v_pending_vending_count
    FROM public.electricity_transactions;

    -- 3. Wallet Liability (Total user funds held)
    SELECT COALESCE(SUM(balance_kobo), 0)
    INTO v_total_wallet_liability_kobo
    FROM public.wallet_accounts;

    RETURN jsonb_build_object(
        'total_funding_naira', (v_total_funding_kobo / 100)::NUMERIC,
        'total_vending_naira', (v_total_vending_kobo / 100)::NUMERIC,
        'wallet_liability_naira', (v_total_wallet_liability_kobo / 100)::NUMERIC,
        'successful_payments', v_successful_payments_count,
        'pending_payments', v_pending_payments_count,
        'failed_payments', v_failed_payments_count,
        'pending_vending_exceptions', v_pending_vending_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
