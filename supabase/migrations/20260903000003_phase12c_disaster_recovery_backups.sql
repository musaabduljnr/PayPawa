-- ============================================================================
-- PAYPAWA: PHASE 12C DATABASE MIGRATION
-- Database Backups, Financial Ledger Integrity & Disaster Recovery
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- 1. BACKUP VERIFICATION LOGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_verification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_type VARCHAR(32) NOT NULL CHECK (backup_type IN ('FULL_LOGICAL', 'SCHEMA_ONLY', 'PITR_POINT', 'TEST_RESTORE')),
    backup_timestamp TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(32) NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'VERIFIED', 'CORRUPTED')),
    checksum_sha256 VARCHAR(64) NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    table_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    verified_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verification_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on backup_verification_logs
ALTER TABLE public.backup_verification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff and service role can view backup logs" ON public.backup_verification_logs;
CREATE POLICY "Staff and service role can view backup logs"
    ON public.backup_verification_logs FOR SELECT
    USING (
        current_setting('role', true) IN ('service_role', 'superuser')
        OR public.is_staff(auth.uid())
    );

DROP POLICY IF EXISTS "Service role can insert backup logs" ON public.backup_verification_logs;
CREATE POLICY "Service role can insert backup logs"
    ON public.backup_verification_logs FOR INSERT
    WITH CHECK (
        current_setting('role', true) IN ('service_role', 'superuser')
        OR public.has_permission(auth.uid(), 'reports.view')
    );


-- 2. FINANCIAL RECOVERY: WALLET LEDGER INTEGRITY VERIFICATION
-- ----------------------------------------------------------------------------
-- Compares stored wallet_accounts.balance_kobo against the sum of immutable ledger entries.
-- Identifies any drift, negative anomalies, or unrecorded movements.
CREATE OR REPLACE FUNCTION public.verify_wallet_ledger_integrity(
    p_wallet_id UUID DEFAULT NULL
)
RETURNS TABLE (
    wallet_id UUID,
    user_id UUID,
    stored_balance_kobo BIGINT,
    ledger_sum_kobo BIGINT,
    drift_kobo BIGINT,
    is_consistent BOOLEAN,
    last_tx_timestamp TIMESTAMPTZ,
    total_ledger_entries BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    WITH ledger_summary AS (
        SELECT 
            wt.wallet_id,
            COALESCE(SUM(wt.amount_kobo), 0) AS calculated_sum,
            MAX(wt.created_at) AS latest_tx,
            COUNT(*) AS entry_count
        FROM public.wallet_transactions wt
        WHERE (p_wallet_id IS NULL OR wt.wallet_id = p_wallet_id)
        GROUP BY wt.wallet_id
    )
    SELECT
        w.id AS wallet_id,
        w.user_id,
        w.balance_kobo AS stored_balance_kobo,
        COALESCE(ls.calculated_sum, 0) AS ledger_sum_kobo,
        (w.balance_kobo - COALESCE(ls.calculated_sum, 0)) AS drift_kobo,
        (w.balance_kobo = COALESCE(ls.calculated_sum, 0)) AS is_consistent,
        ls.latest_tx AS last_tx_timestamp,
        COALESCE(ls.entry_count, 0) AS total_ledger_entries
    FROM public.wallet_accounts w
    LEFT JOIN ledger_summary ls ON ls.wallet_id = w.id
    WHERE (p_wallet_id IS NULL OR w.id = p_wallet_id)
    ORDER BY is_consistent ASC, ABS(w.balance_kobo - COALESCE(ls.calculated_sum, 0)) DESC;
$$;


-- 3. FINANCIAL RECOVERY: RECONCILE WALLET BALANCE FROM AUTHORITATIVE LEDGER
-- ----------------------------------------------------------------------------
-- Reconciles stored balance to match the authoritative immutable ledger.
-- Creates an auditable adjustment record and logs to audit_logs.
CREATE OR REPLACE FUNCTION public.reconcile_wallet_balance_from_ledger(
    p_wallet_id UUID,
    p_reason TEXT,
    p_incident_ref TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_wallet public.wallet_accounts%ROWTYPE;
    v_ledger_sum BIGINT := 0;
    v_drift_kobo BIGINT := 0;
    v_audit_id UUID;
    v_adj_tx_id UUID;
BEGIN
    -- Only authorized staff with 'wallets.adjust' or service_role can execute ledger reconciliation
    IF current_setting('role', true) NOT IN ('service_role', 'superuser') THEN
        IF NOT public.has_permission(v_caller_id, 'wallets.adjust') THEN
            RAISE EXCEPTION 'Unauthorized: Caller lacks wallets.adjust permission for financial reconciliation.';
        END IF;
    END IF;

    -- Lock wallet row FOR UPDATE
    SELECT * INTO v_wallet
    FROM public.wallet_accounts
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF v_wallet.id IS NULL THEN
        RAISE EXCEPTION 'Target wallet % not found', p_wallet_id;
    END IF;

    -- Calculate true ledger sum
    SELECT COALESCE(SUM(amount_kobo), 0) INTO v_ledger_sum
    FROM public.wallet_transactions
    WHERE wallet_id = p_wallet_id;

    v_drift_kobo := v_ledger_sum - v_wallet.balance_kobo;

    -- If no drift exists, return clean status
    IF v_drift_kobo = 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Wallet balance is already fully consistent with ledger.',
            'wallet_id', p_wallet_id,
            'balance_kobo', v_wallet.balance_kobo,
            'drift_kobo', 0
        );
    END IF;

    -- Update wallet balance to authoritative ledger sum
    UPDATE public.wallet_accounts
    SET balance_kobo = v_ledger_sum,
        updated_at = NOW()
    WHERE id = p_wallet_id;

    -- Record compensating ledger adjustment transaction
    INSERT INTO public.wallet_transactions (
        user_id,
        wallet_id,
        type,
        amount_kobo,
        balance_before_kobo,
        balance_after_kobo,
        reference,
        description,
        idempotency_key
    ) VALUES (
        v_wallet.user_id,
        v_wallet.id,
        CASE WHEN v_drift_kobo > 0 THEN 'reversal_credit' ELSE 'purchase_debit' END,
        v_drift_kobo,
        v_wallet.balance_kobo,
        v_ledger_sum,
        'WTX-RECON-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10),
        'Disaster Recovery Ledger Reconciliation: ' || p_reason,
        'RECON-' || p_wallet_id::text || '-' || EXTRACT(EPOCH FROM NOW())::TEXT
    ) RETURNING id INTO v_adj_tx_id;

    -- Record immutable audit log
    SELECT public.log_audit_event(
        v_caller_id,
        'WALLET_LEDGER_DISASTER_RECOVERY',
        'WALLET_ACCOUNT',
        p_wallet_id::TEXT,
        jsonb_build_object(
            'previous_balance_kobo', v_wallet.balance_kobo,
            'reconciled_balance_kobo', v_ledger_sum,
            'drift_kobo', v_drift_kobo,
            'reason', p_reason,
            'incident_ref', p_incident_ref,
            'adjustment_tx_id', v_adj_tx_id
        )
    ) INTO v_audit_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Wallet successfully reconciled from authoritative ledger.',
        'wallet_id', p_wallet_id,
        'previous_balance_kobo', v_wallet.balance_kobo,
        'reconciled_balance_kobo', v_ledger_sum,
        'drift_kobo', v_drift_kobo,
        'adjustment_tx_id', v_adj_tx_id,
        'audit_id', v_audit_id
    );
END;
$$;


-- 4. SQUADCO TRANSACTION RECOVERY: GET UNRECONCILED TRANSACTIONS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unreconciled_squad_transactions(
    p_older_than_minutes INT DEFAULT 5,
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    transaction_id UUID,
    reference VARCHAR(64),
    provider_transaction_id TEXT,
    user_id UUID,
    meter_number VARCHAR(32),
    disco_code VARCHAR(32),
    amount_kobo BIGINT,
    status electricity_tx_status_enum,
    idempotency_key VARCHAR(128),
    created_at TIMESTAMPTZ,
    elapsed_minutes INT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        et.id AS transaction_id,
        et.reference,
        et.provider_transaction_id,
        et.user_id,
        et.meter_number,
        et.disco_code,
        et.amount_kobo,
        et.status,
        et.idempotency_key,
        et.created_at,
        EXTRACT(EPOCH FROM (NOW() - et.created_at))::INT / 60 AS elapsed_minutes
    FROM public.electricity_transactions et
    WHERE et.status IN ('processing', 'pending', 'unknown')
      AND et.created_at < (NOW() - (p_older_than_minutes || ' minutes')::INTERVAL)
    ORDER BY et.created_at ASC
    LIMIT p_limit;
$$;
