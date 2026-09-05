-- ============================================================================
-- PAYPAWA PHASE 12E: PERFORMANCE, SCALABILITY & RELIABILITY HARDENING
-- Migration: 20260904000002_phase12e_performance_optimization.sql
-- Description: Composite performance indexes, query optimization, and transaction
--              reconciliation queue performance enhancements.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ELECTRICITY TRANSACTIONS: HIGH-FREQUENCY COMPOSITE INDEXES
-- ----------------------------------------------------------------------------

-- Speeds up meter-isolated transaction history & consumption queries
CREATE INDEX IF NOT EXISTS idx_elec_tx_meter_created 
ON public.electricity_transactions (meter_id, created_at DESC)
WHERE meter_id IS NOT NULL;

-- Speeds up user activity ledger queries with order by created_at DESC
CREATE INDEX IF NOT EXISTS idx_elec_tx_user_created 
ON public.electricity_transactions (user_id, created_at DESC);

-- Speeds up provider transaction ID lookup during SquadCo webhooks & requery
CREATE INDEX IF NOT EXISTS idx_elec_tx_provider_ref 
ON public.electricity_transactions (provider_transaction_id) 
WHERE provider_transaction_id IS NOT NULL;

-- Speeds up background worker reconciliation queue for unresolved transactions
CREATE INDEX IF NOT EXISTS idx_elec_tx_reconcile_queue 
ON public.electricity_transactions (status, created_at DESC) 
WHERE status IN ('processing', 'unknown');

-- ----------------------------------------------------------------------------
-- 2. WALLET TRANSACTIONS: ATOMIC LEDGER COMPOSITE INDEXES
-- ----------------------------------------------------------------------------

-- Speeds up user ledger pagination without multi-index bitmap scans
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_created 
ON public.wallet_transactions (user_id, created_at DESC);

-- Speeds up payment webhook deduplication & idempotency verification
CREATE INDEX IF NOT EXISTS idx_wallet_tx_payment_attempt 
ON public.wallet_transactions (related_payment_attempt_id) 
WHERE related_payment_attempt_id IS NOT NULL;

-- Speeds up refund checks and purchase verification
CREATE INDEX IF NOT EXISTS idx_wallet_tx_elec_tx 
ON public.wallet_transactions (related_electricity_tx_id) 
WHERE related_electricity_tx_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. NOTIFICATIONS: METER-ISOLATED UNREAD & RECENT INDEXES
-- ----------------------------------------------------------------------------

-- Speeds up meter-scoped unread notifications count and list retrieval
CREATE INDEX IF NOT EXISTS idx_notifications_user_meter_read 
ON public.notifications (user_id, meter_id, is_read, created_at DESC);

-- Speeds up global user notification list ordering
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created 
ON public.notifications (user_id, is_read, created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. METER READINGS & VERIFICATIONS INDEXES
-- ----------------------------------------------------------------------------

-- Speeds up meter readings history per meter
CREATE INDEX IF NOT EXISTS idx_meter_readings_user_meter_date 
ON public.meter_readings (user_id, meter_id, recorded_at DESC);

-- Speeds up payment attempts lookup by user and status
CREATE INDEX IF NOT EXISTS idx_payment_attempts_user_status_created 
ON public.payment_attempts (user_id, status, created_at DESC);

-- Speeds up payment attempts lookup by provider reference
CREATE INDEX IF NOT EXISTS idx_payment_attempts_provider_ref 
ON public.payment_attempts (provider_reference) 
WHERE provider_reference IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. ANALYTICS SNAPSHOTS FRESHNESS LOOKUP
-- ----------------------------------------------------------------------------

-- Speeds up retrieval of newest pre-computed consumption snapshot
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_freshness 
ON public.consumption_analytics_snapshots (user_id, meter_id, period, calculated_at DESC);

-- ----------------------------------------------------------------------------
-- 6. RECORD MIGRATION COMPLETION
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'Phase 12E Performance & Index Optimization Migration Applied Successfully';
END $$;
