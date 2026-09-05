-- ==============================================================================
-- SMART ELECTRICITY — PHASE 8: AI ENERGY INTELLIGENCE ENGINE
-- ==============================================================================
-- Schema for conversational AI energy assistant, grounded structured responses,
-- audit logging, token observability, user feedback, and forecast accuracy loops.
-- ==============================================================================

-- 1. AI CONVERSATIONS TABLE
-- ------------------------------------------------------------------------------
-- Tracks multi-turn conversational sessions scoped to a user and optional meter.
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    meter_id UUID REFERENCES public.meters(id) ON DELETE SET NULL,
    title VARCHAR(128) NOT NULL DEFAULT 'Energy Intelligence Session',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. AI MESSAGES TABLE
-- ------------------------------------------------------------------------------
-- Stores structured messages, evidence items, recommendations, and user feedback.
CREATE TABLE IF NOT EXISTS public.ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    meter_id UUID REFERENCES public.meters(id) ON DELETE SET NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    structured_response JSONB,
    insight_type VARCHAR(64),
    confidence VARCHAR(32) CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH', 'INSUFFICIENT_DATA')),
    evidence JSONB DEFAULT '[]'::jsonb,
    recommendations JSONB DEFAULT '[]'::jsonb,
    limitations JSONB DEFAULT '[]'::jsonb,
    is_helpful BOOLEAN,
    feedback_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. AI AUDIT LOGS TABLE
-- ------------------------------------------------------------------------------
-- Operational telemetry for cost, latency, token usage, and provider reliability.
CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    meter_id UUID REFERENCES public.meters(id) ON DELETE SET NULL,
    request_type VARCHAR(64) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(64) NOT NULL,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    estimated_cost_usd NUMERIC(10, 6) DEFAULT 0.000000,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. AI RATE LIMITS TABLE
-- ------------------------------------------------------------------------------
-- Sliding window rate-limiting tracker to prevent abuse and denial-of-service.
CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    minute_window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    minute_request_count INTEGER NOT NULL DEFAULT 0,
    daily_window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    daily_request_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. AI FORECAST ACCURACY LOGS TABLE
-- ------------------------------------------------------------------------------
-- Compares forecasted purchase windows against subsequent real transaction outcomes.
CREATE TABLE IF NOT EXISTS public.ai_forecast_accuracy_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    meter_id UUID NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
    predicted_window_min_days NUMERIC(6, 2) NOT NULL,
    predicted_window_max_days NUMERIC(6, 2) NOT NULL,
    prediction_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    actual_purchase_timestamp TIMESTAMPTZ,
    actual_purchase_id UUID REFERENCES public.electricity_transactions(id) ON DELETE SET NULL,
    actual_interval_days NUMERIC(6, 2),
    error_days NUMERIC(6, 2),
    confidence VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. INDEXES FOR HIGH-PERFORMANCE QUERYING & MULTI-METER ISOLATION
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_meter 
ON public.ai_conversations (user_id, meter_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv_created 
ON public.ai_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_user_meter 
ON public.ai_messages (user_id, meter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_audit_user_created 
ON public.ai_audit_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_forecast_accuracy_meter 
ON public.ai_forecast_accuracy_logs (meter_id, prediction_timestamp DESC);

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_forecast_accuracy_logs ENABLE ROW LEVEL SECURITY;

-- ai_conversations RLS
CREATE POLICY "Users can manage their own AI conversations"
ON public.ai_conversations
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ai_messages RLS
CREATE POLICY "Users can manage their own AI messages"
ON public.ai_messages
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ai_audit_logs RLS
CREATE POLICY "Users can view their own AI audit logs"
ON public.ai_audit_logs
FOR SELECT
USING (auth.uid() = user_id);

-- ai_rate_limits RLS
CREATE POLICY "Users can access their own rate limits"
ON public.ai_rate_limits
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ai_forecast_accuracy_logs RLS
CREATE POLICY "Users can view their own forecast accuracy"
ON public.ai_forecast_accuracy_logs
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
