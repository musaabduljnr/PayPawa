-- ============================================================================
-- PAYPAWA: PHASE 10F DATABASE MIGRATION
-- Authoritative Immutable Audit Logging, Correlation Tracing & Activity Governance
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- 1. ENHANCE AUDIT LOGS TABLE
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_logs 
ADD COLUMN IF NOT EXISTS result VARCHAR(32) NOT NULL DEFAULT 'SUCCESS' CHECK (result IN ('SUCCESS', 'FAILED', 'PENDING', 'WARNING')),
ADD COLUMN IF NOT EXISTS correlation_id TEXT,
ADD COLUMN IF NOT EXISTS error_message TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'entity_name'
    ) THEN
        ALTER TABLE public.audit_logs ALTER COLUMN entity_name DROP NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'entity_id'
    ) THEN
        ALTER TABLE public.audit_logs ALTER COLUMN entity_id DROP NOT NULL;
    END IF;
END $$;

-- 2. CREATE IMMUTABILITY RULES (STRICT APPEND-ONLY BEHAVIOR)
-- ----------------------------------------------------------------------------
-- PostgreSQL rules to strictly prevent modification or deletion of audit logs
CREATE OR REPLACE RULE audit_logs_no_update AS 
    ON UPDATE TO public.audit_logs DO INSTEAD NOTHING;

CREATE OR REPLACE RULE audit_logs_no_delete AS 
    ON DELETE TO public.audit_logs DO INSTEAD NOTHING;

-- Indexes for high-frequency searching, correlation tracing, and filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON public.audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON public.audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type_id ON public.audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_result ON public.audit_logs(result);

-- 3. STORED PROCEDURES & RPCs FOR AUDIT TRAIL & SYSTEM ACTIVITY
-- ----------------------------------------------------------------------------

-- A. admin_list_audit_logs: Paginated search across actor, action, target, result, correlation ID, date range
CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(
    p_search TEXT DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL,
    p_action TEXT DEFAULT NULL,
    p_target_type TEXT DEFAULT NULL,
    p_result TEXT DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_total_count INT := 0;
    v_logs JSONB;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'audit_logs.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks audit_logs.view permission.';
    END IF;

    SELECT COUNT(*) INTO v_total_count
    FROM public.audit_logs al
    LEFT JOIN public.profiles p ON p.id = al.actor_user_id
    LEFT JOIN public.staff_members sm ON sm.user_id = al.actor_user_id
    LEFT JOIN public.roles r ON r.id = sm.role_id
    WHERE (p_actor_id IS NULL OR al.actor_user_id = p_actor_id)
      AND (p_action IS NULL OR p_action = 'ALL' OR al.action = p_action)
      AND (p_target_type IS NULL OR p_target_type = 'ALL' OR al.target_type = p_target_type)
      AND (p_result IS NULL OR p_result = 'ALL' OR al.result = p_result)
      AND (p_correlation_id IS NULL OR p_correlation_id = '' OR al.correlation_id ILIKE '%' || p_correlation_id || '%')
      AND (p_start_date IS NULL OR al.created_at >= p_start_date)
      AND (p_end_date IS NULL OR al.created_at <= p_end_date)
      AND (
          p_search IS NULL OR p_search = '' OR
          al.action ILIKE '%' || p_search || '%' OR
          al.target_id ILIKE '%' || p_search || '%' OR
          al.correlation_id ILIKE '%' || p_search || '%' OR
          p.full_name ILIKE '%' || p_search || '%' OR
          p.email ILIKE '%' || p_search || '%'
      );

    SELECT COALESCE(jsonb_agg(log_row), '[]'::jsonb) INTO v_logs
    FROM (
        SELECT
            al.id,
            al.staff_id,
            al.actor_user_id,
            COALESCE(p.full_name, 'System Process') AS actor_name,
            COALESCE(p.email, 'system@paypawa.internal') AS actor_email,
            COALESCE(r.display_name, 'System') AS actor_role,
            al.action,
            al.target_type,
            al.target_id,
            al.result,
            al.correlation_id,
            al.error_message,
            al.metadata,
            al.ip_address,
            al.user_agent,
            al.created_at
        FROM public.audit_logs al
        LEFT JOIN public.profiles p ON p.id = al.actor_user_id
        LEFT JOIN public.staff_members sm ON sm.user_id = al.actor_user_id
        LEFT JOIN public.roles r ON r.id = sm.role_id
        WHERE (p_actor_id IS NULL OR al.actor_user_id = p_actor_id)
          AND (p_action IS NULL OR p_action = 'ALL' OR al.action = p_action)
          AND (p_target_type IS NULL OR p_target_type = 'ALL' OR al.target_type = p_target_type)
          AND (p_result IS NULL OR p_result = 'ALL' OR al.result = p_result)
          AND (p_correlation_id IS NULL OR p_correlation_id = '' OR al.correlation_id ILIKE '%' || p_correlation_id || '%')
          AND (p_start_date IS NULL OR al.created_at >= p_start_date)
          AND (p_end_date IS NULL OR al.created_at <= p_end_date)
          AND (
              p_search IS NULL OR p_search = '' OR
              al.action ILIKE '%' || p_search || '%' OR
              al.target_id ILIKE '%' || p_search || '%' OR
              al.correlation_id ILIKE '%' || p_search || '%' OR
              p.full_name ILIKE '%' || p_search || '%' OR
              p.email ILIKE '%' || p_search || '%'
          )
        ORDER BY al.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) log_row;

    RETURN jsonb_build_object(
        'total', v_total_count,
        'limit', p_limit,
        'offset', p_offset,
        'data', v_logs
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. admin_get_audit_log_details: Fetch full details & all correlated events
CREATE OR REPLACE FUNCTION public.admin_get_audit_log_details(p_audit_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_log RECORD;
    v_correlated_logs JSONB;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'audit_logs.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks audit_logs.view permission.';
    END IF;

    SELECT
        al.id,
        al.staff_id,
        al.actor_user_id,
        COALESCE(p.full_name, 'System Process') AS actor_name,
        COALESCE(p.email, 'system@paypawa.internal') AS actor_email,
        COALESCE(r.display_name, 'System') AS actor_role,
        al.action,
        al.target_type,
        al.target_id,
        al.result,
        al.correlation_id,
        al.error_message,
        al.metadata,
        al.ip_address,
        al.user_agent,
        al.created_at
    INTO v_log
    FROM public.audit_logs al
    LEFT JOIN public.profiles p ON p.id = al.actor_user_id
    LEFT JOIN public.staff_members sm ON sm.user_id = al.actor_user_id
    LEFT JOIN public.roles r ON r.id = sm.role_id
    WHERE al.id = p_audit_id;

    IF v_log.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'AUDIT_LOG_NOT_FOUND');
    END IF;

    -- Fetch Correlated Events sharing the same correlation_id (if available)
    IF v_log.correlation_id IS NOT NULL AND v_log.correlation_id <> '' THEN
        SELECT COALESCE(jsonb_agg(corr_row), '[]'::jsonb) INTO v_correlated_logs
        FROM (
            SELECT
                al.id,
                al.action,
                al.target_type,
                al.target_id,
                al.result,
                COALESCE(p.full_name, 'System Process') AS actor_name,
                al.created_at
            FROM public.audit_logs al
            LEFT JOIN public.profiles p ON p.id = al.actor_user_id
            WHERE al.correlation_id = v_log.correlation_id AND al.id <> p_audit_id
            ORDER BY al.created_at ASC
        ) corr_row;
    ELSE
        v_correlated_logs := '[]'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'log', row_to_json(v_log),
        'correlated_events', v_correlated_logs
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. admin_record_audit_log: Centralized logging with automatic sensitive payload scrubbing
CREATE OR REPLACE FUNCTION public.admin_record_audit_log(
    p_actor_user_id UUID,
    p_action TEXT,
    p_target_type TEXT,
    p_target_id TEXT,
    p_result TEXT DEFAULT 'SUCCESS',
    p_correlation_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_staff_id UUID;
    v_audit_id UUID;
    v_clean_metadata JSONB;
BEGIN
    SELECT id INTO v_staff_id
    FROM public.staff_members
    WHERE user_id = p_actor_user_id;

    -- Scrub sensitive keys from metadata
    v_clean_metadata := p_metadata - 'password' - 'secret' - 'api_key' - 'token' - 'pin' - 'card_number' - 'authorization';

    INSERT INTO public.audit_logs (
        staff_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        result,
        correlation_id,
        metadata,
        error_message,
        created_at
    ) VALUES (
        v_staff_id,
        p_actor_user_id,
        p_action,
        p_target_type,
        p_target_id,
        COALESCE(p_result, 'SUCCESS'),
        p_correlation_id,
        COALESCE(v_clean_metadata, '{}'::jsonb),
        p_error_message,
        NOW()
    ) RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. admin_get_system_activity_summary: Operational KPI counts for activity dashboard
CREATE OR REPLACE FUNCTION public.admin_get_system_activity_summary()
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_total_24h INT := 0;
    v_financial_mutations_24h INT := 0;
    v_security_changes_24h INT := 0;
    v_failed_events_24h INT := 0;
    v_active_actors_24h INT := 0;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'audit_logs.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks audit_logs.view permission.';
    END IF;

    SELECT COUNT(*) INTO v_total_24h
    FROM public.audit_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours';

    SELECT COUNT(*) INTO v_financial_mutations_24h
    FROM public.audit_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      AND action IN ('WALLET_ADJUSTMENT', 'PAYMENT_RECONCILED', 'TRANSACTION_RETRY', 'TRANSACTION_RECONCILED');

    SELECT COUNT(*) INTO v_security_changes_24h
    FROM public.audit_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      AND action IN ('STAFF_MEMBER_CREATED', 'STAFF_ROLE_UPDATED', 'ROLE_PERMISSIONS_UPDATED', 'GOVERNANCE_ACTION_APPROVED', 'STAFF_STATUS_UPDATED');

    SELECT COUNT(*) INTO v_failed_events_24h
    FROM public.audit_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      AND result IN ('FAILED', 'WARNING');

    SELECT COUNT(DISTINCT actor_user_id) INTO v_active_actors_24h
    FROM public.audit_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      AND actor_user_id IS NOT NULL;

    RETURN jsonb_build_object(
        'total_24h', v_total_24h,
        'financial_mutations_24h', v_financial_mutations_24h,
        'security_changes_24h', v_security_changes_24h,
        'failed_events_24h', v_failed_events_24h,
        'active_actors_24h', v_active_actors_24h
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
