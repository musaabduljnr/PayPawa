-- ============================================================================
-- PAYPAWA: PHASE 11 DATABASE MIGRATION
-- Notifications & Smart Alerts System: Data Model, Security & Preferences
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- 1. ENHANCE PUBLIC.NOTIFICATIONS TABLE
-- ----------------------------------------------------------------------------
-- Safely add missing columns to public.notifications if they don't already exist
DO $$
BEGIN
    -- Add meter_id for meter-specific alert isolation
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'meter_id'
    ) THEN
        ALTER TABLE public.notifications 
        ADD COLUMN meter_id UUID REFERENCES public.meters(id) ON DELETE CASCADE;
    END IF;

    -- Add severity ('info', 'warning', 'critical', 'success')
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'severity'
    ) THEN
        ALTER TABLE public.notifications 
        ADD COLUMN severity VARCHAR(32) NOT NULL DEFAULT 'info' 
        CHECK (severity IN ('info', 'warning', 'critical', 'success'));
    END IF;

    -- Add read_at timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'read_at'
    ) THEN
        ALTER TABLE public.notifications 
        ADD COLUMN read_at TIMESTAMPTZ;
    END IF;

    -- Add expires_at timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE public.notifications 
        ADD COLUMN expires_at TIMESTAMPTZ;
    END IF;

    -- Add delivery_status ('pending', 'delivered', 'failed')
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'delivery_status'
    ) THEN
        ALTER TABLE public.notifications 
        ADD COLUMN delivery_status VARCHAR(32) NOT NULL DEFAULT 'delivered' 
        CHECK (delivery_status IN ('pending', 'delivered', 'failed'));
    END IF;

    -- Add delivery_channel ('in_app', 'push', 'email', 'sms')
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'delivery_channel'
    ) THEN
        ALTER TABLE public.notifications 
        ADD COLUMN delivery_channel VARCHAR(32) NOT NULL DEFAULT 'in_app' 
        CHECK (delivery_channel IN ('in_app', 'push', 'email', 'sms'));
    END IF;

    -- Add deduplication_key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'deduplication_key'
    ) THEN
        ALTER TABLE public.notifications 
        ADD COLUMN deduplication_key TEXT;
    END IF;

    -- Add related_transaction_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'related_transaction_id'
    ) THEN
        ALTER TABLE public.notifications 
        ADD COLUMN related_transaction_id UUID REFERENCES public.electricity_transactions(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Performance & Isolation Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_meter ON public.notifications(user_id, meter_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedup ON public.notifications(user_id, deduplication_key) 
WHERE deduplication_key IS NOT NULL;


-- 2. NOTIFICATION PREFERENCES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    low_balance_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    unusual_usage_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    recharge_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    purchase_updates_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    wallet_funding_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ai_insights_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    channel_in_app BOOLEAN NOT NULL DEFAULT TRUE,
    channel_push BOOLEAN NOT NULL DEFAULT FALSE,
    channel_email BOOLEAN NOT NULL DEFAULT FALSE,
    channel_sms BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on preferences
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Preferences RLS Policies
DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can view own notification preferences"
    ON public.notification_preferences FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert own notification preferences"
    ON public.notification_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can update own notification preferences"
    ON public.notification_preferences FOR UPDATE
    USING (auth.uid() = user_id);


-- 3. NOTIFICATIONS INSERT RLS POLICY
-- ----------------------------------------------------------------------------
-- Ensure authenticated users can insert client-side smart alerts or server procedures
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications"
    ON public.notifications FOR INSERT
    WITH CHECK (auth.uid() = user_id);


-- 4. IDEMPOTENT NOTIFICATION DISPATCH FUNCTION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_notification_if_not_exists(
    p_user_id UUID,
    p_meter_id UUID DEFAULT NULL,
    p_type TEXT DEFAULT 'info',
    p_title TEXT DEFAULT '',
    p_body TEXT DEFAULT '',
    p_severity TEXT DEFAULT 'info',
    p_deduplication_key TEXT DEFAULT NULL,
    p_data JSONB DEFAULT '{}'::jsonb,
    p_related_transaction_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prefs public.notification_preferences%ROWTYPE;
    v_new_id UUID;
    v_category_allowed BOOLEAN := TRUE;
    v_db_type notification_type_enum;
BEGIN
    -- Authorization check
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id 
       AND current_setting('role', true) <> 'service_role' 
       AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized notification dispatch';
    END IF;

    -- Fetch user preferences if available
    SELECT * INTO v_prefs FROM public.notification_preferences WHERE user_id = p_user_id;

    IF v_prefs.user_id IS NOT NULL THEN
        IF p_type IN ('low_balance') AND NOT v_prefs.low_balance_enabled THEN
            v_category_allowed := FALSE;
        ELSIF p_type IN ('unusual_usage') AND NOT v_prefs.unusual_usage_enabled THEN
            v_category_allowed := FALSE;
        ELSIF p_type IN ('estimated_recharge_due') AND NOT v_prefs.recharge_reminder_enabled THEN
            v_category_allowed := FALSE;
        ELSIF p_type IN ('purchase_success', 'purchase_pending', 'purchase_failed', 'token_delivered', 'purchase', 'token') AND NOT v_prefs.purchase_updates_enabled THEN
            v_category_allowed := FALSE;
        ELSIF p_type IN ('wallet_funded', 'wallet_funding_failed', 'funding', 'payment') AND NOT v_prefs.wallet_funding_enabled THEN
            v_category_allowed := FALSE;
        ELSIF p_type IN ('ai_energy_insight') AND NOT v_prefs.ai_insights_enabled THEN
            v_category_allowed := FALSE;
        END IF;
    END IF;

    IF NOT v_category_allowed THEN
        RETURN jsonb_build_object('success', false, 'reason', 'CATEGORY_DISABLED_BY_USER');
    END IF;

    -- Check deduplication key
    IF p_deduplication_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.notifications 
            WHERE user_id = p_user_id AND deduplication_key = p_deduplication_key
        ) THEN
            RETURN jsonb_build_object('success', true, 'status', 'DEDUPLICATED');
        END IF;
    END IF;

    -- Map p_type to legacy notification_type_enum for backwards compatibility
    IF p_type IN ('purchase_success', 'token_delivered', 'purchase') THEN
        v_db_type := 'purchase';
    ELSIF p_type IN ('wallet_funded', 'funding') THEN
        v_db_type := 'funding';
    ELSIF p_type IN ('low_balance', 'unusual_usage', 'alert') THEN
        v_db_type := 'alert';
    ELSIF p_type IN ('billing') THEN
        v_db_type := 'billing';
    ELSE
        v_db_type := 'info';
    END IF;

    -- Insert notification
    INSERT INTO public.notifications (
        user_id,
        meter_id,
        type,
        title,
        body,
        severity,
        deduplication_key,
        data,
        related_transaction_id,
        is_read,
        delivery_status,
        delivery_channel,
        created_at
    ) VALUES (
        p_user_id,
        p_meter_id,
        v_db_type,
        p_title,
        p_body,
        p_severity,
        p_deduplication_key,
        p_data,
        p_related_transaction_id,
        FALSE,
        'delivered',
        'in_app',
        NOW()
    ) RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_new_id,
        'status', 'CREATED'
    );
EXCEPTION
    WHEN unique_violation THEN
        -- Safely handle race condition on deduplication key
        RETURN jsonb_build_object('success', true, 'status', 'DEDUPLICATED');
END;
$$;
