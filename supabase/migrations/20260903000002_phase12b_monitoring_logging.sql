-- ============================================================================
-- PAYPAWA: PHASE 12B DATABASE MIGRATION
-- Production Observability, Alert Events & SquadCo Health Telemetry
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- 1. UPDATE PROVIDER HEALTH TELEMETRY FOR SQUADCO
-- ----------------------------------------------------------------------------
-- Ensure 'squad' exists in provider_health_telemetry
INSERT INTO public.provider_health_telemetry (
    provider_name,
    service_type,
    status,
    last_successful_at,
    latency_ms,
    error_rate_pct,
    metadata
)
VALUES (
    'squad',
    'VENDING',
    'ONLINE',
    NOW(),
    150,
    0.10,
    '{"environment": "sandbox", "gateway": "Squad VAS Utilities", "supported_discos": ["IE", "EKEDC", "AEDC", "YEDC", "BEDC", "IBEDC", "KEDCO", "KAEDC", "PHED", "EEDC", "JED"]}'::jsonb
)
ON CONFLICT (provider_name) DO UPDATE 
SET service_type = 'VENDING',
    status = 'ONLINE',
    updated_at = NOW();

-- Update default provider setting in system_settings if table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'system_settings'
    ) THEN
        UPDATE public.system_settings
        SET value = '"squad"'::jsonb,
            updated_at = NOW()
        WHERE key = 'DEFAULT_VENDING_PROVIDER';
    END IF;
END $$;


-- 2. SYSTEM ALERT EVENTS TABLE (FOR HIGH-SEVERITY ALERTS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    severity VARCHAR(32) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category VARCHAR(64) NOT NULL, -- 'FINANCIAL', 'PROVIDER', 'SECURITY', 'INFRASTRUCTURE', 'DATABASE'
    event_type VARCHAR(128) NOT NULL,
    message TEXT NOT NULL,
    correlation_id VARCHAR(64),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    meter_id UUID REFERENCES public.meters(id) ON DELETE SET NULL,
    transaction_id UUID REFERENCES public.electricity_transactions(id) ON DELETE SET NULL,
    payment_attempt_id UUID REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on system_alert_events
ALTER TABLE public.system_alert_events ENABLE ROW LEVEL SECURITY;

-- Only service_role or admin staff can read and manage alert events
DROP POLICY IF EXISTS "Staff and service role can manage system alerts" ON public.system_alert_events;
CREATE POLICY "Staff and service role can manage system alerts"
    ON public.system_alert_events
    USING (
        current_setting('role', true) IN ('service_role', 'superuser')
        OR EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.user_id = auth.uid() AND sm.status = 'ACTIVE'
        )
    );

-- Indexes for Alert Queries
CREATE INDEX IF NOT EXISTS idx_alert_events_severity ON public.system_alert_events(severity, is_resolved);
CREATE INDEX IF NOT EXISTS idx_alert_events_created ON public.system_alert_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_correlation ON public.system_alert_events(correlation_id) WHERE correlation_id IS NOT NULL;


-- 3. OPERATIONAL HELPER: GET STUCK TRANSACTIONS FOR REVIEW
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_stuck_transactions_for_review(
    p_older_than_minutes INT DEFAULT 5,
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    reference VARCHAR(64),
    user_id UUID,
    meter_number VARCHAR(32),
    disco_code VARCHAR(32),
    amount_kobo BIGINT,
    status electricity_tx_status_enum,
    provider_name TEXT,
    created_at TIMESTAMPTZ,
    elapsed_minutes INT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        t.id,
        t.reference,
        t.user_id,
        t.meter_number,
        t.disco_code,
        t.amount_kobo,
        t.status,
        t.provider_name,
        t.created_at,
        EXTRACT(EPOCH FROM (NOW() - t.created_at))::INT / 60 AS elapsed_minutes
    FROM public.electricity_transactions t
    WHERE t.status IN ('processing', 'pending')
      AND t.created_at < (NOW() - (p_older_than_minutes || ' minutes')::INTERVAL)
    ORDER BY t.created_at ASC
    LIMIT p_limit;
$$;
