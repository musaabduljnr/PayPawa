-- ============================================================================
-- SMART ELECTRICITY: PRODUCTION DATABASE SCHEMA & SECURITY MIGRATION
-- Framework: Supabase / PostgreSQL 15+
-- Version: 1.0.0
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

CREATE TYPE meter_type_enum AS ENUM ('prepaid', 'postpaid');

CREATE TYPE verification_status_enum AS ENUM (
    'pending',
    'verified',
    'failed',
    'expired'
);

CREATE TYPE electricity_tx_status_enum AS ENUM (
    'created',
    'processing',
    'successful',
    'failed',
    'pending',
    'timeout',
    'reversed',
    'unknown'
);

CREATE TYPE wallet_tx_type_enum AS ENUM (
    'funding',
    'purchase_debit',
    'refund_credit',
    'reversal_debit',
    'adjustment'
);

CREATE TYPE payment_method_enum AS ENUM (
    'card',
    'bank_transfer',
    'ussd',
    'wallet'
);

CREATE TYPE payment_status_enum AS ENUM (
    'initiated',
    'pending',
    'successful',
    'failed',
    'abandoned'
);

CREATE TYPE notification_type_enum AS ENUM (
    'purchase',
    'funding',
    'alert',
    'info',
    'billing'
);

-- ============================================================================
-- 2. HELPER FUNCTIONS & TIMESTAMP TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. CORE TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table 1: Profiles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone_number TEXT,
    avatar_url TEXT,
    is_onboarded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table 2: Wallet Accounts (Authoritative Server Ledger)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    balance_kobo BIGINT NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_wallet_balance_non_negative CHECK (balance_kobo >= 0)
);

CREATE TRIGGER trg_wallet_accounts_updated_at
BEFORE UPDATE ON public.wallet_accounts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table 3: Meters
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    meter_number VARCHAR(32) NOT NULL,
    disco_code VARCHAR(32) NOT NULL,
    disco_name TEXT NOT NULL,
    meter_type meter_type_enum NOT NULL DEFAULT 'prepaid',
    nickname TEXT NOT NULL,
    customer_name TEXT,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_meter_disco UNIQUE (user_id, meter_number, disco_code)
);

CREATE TRIGGER trg_meters_updated_at
BEFORE UPDATE ON public.meters
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table 4: Meter Verifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meter_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    meter_number VARCHAR(32) NOT NULL,
    disco_code VARCHAR(32) NOT NULL,
    customer_name TEXT,
    customer_address TEXT,
    tariff_code TEXT,
    status verification_status_enum NOT NULL DEFAULT 'pending',
    raw_provider_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Table 5: Payment Attempts (Inbound Wallet Funding)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE CASCADE,
    reference VARCHAR(64) NOT NULL UNIQUE,
    amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
    method payment_method_enum NOT NULL,
    status payment_status_enum NOT NULL DEFAULT 'initiated',
    provider TEXT NOT NULL, -- 'paystack' | 'flutterwave'
    provider_reference TEXT,
    idempotency_key VARCHAR(128) UNIQUE,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_payment_attempts_updated_at
BEFORE UPDATE ON public.payment_attempts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table 6: Wallet Transactions (Immutable Double-Entry Ledger)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE CASCADE,
    type wallet_tx_type_enum NOT NULL,
    amount_kobo BIGINT NOT NULL,
    balance_before_kobo BIGINT NOT NULL,
    balance_after_kobo BIGINT NOT NULL CHECK (balance_after_kobo >= 0),
    reference VARCHAR(64) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    idempotency_key VARCHAR(128) UNIQUE,
    related_electricity_tx_id UUID,
    related_payment_attempt_id UUID REFERENCES public.payment_attempts(id),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Table 7: Electricity Transactions (Lifecycle Vending Model)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.electricity_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE CASCADE,
    meter_id UUID REFERENCES public.meters(id) ON DELETE SET NULL,
    meter_number VARCHAR(32) NOT NULL,
    disco_code VARCHAR(32) NOT NULL,
    amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
    units_kwh NUMERIC(10, 2),
    tariff_per_kwh_kobo BIGINT,
    token VARCHAR(64),
    status electricity_tx_status_enum NOT NULL DEFAULT 'created',
    reference VARCHAR(64) NOT NULL UNIQUE,
    provider_name TEXT NOT NULL,
    provider_transaction_id TEXT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    last_polled_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_electricity_transactions_updated_at
BEFORE UPDATE ON public.electricity_transactions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add foreign key constraint to wallet_transactions
ALTER TABLE public.wallet_transactions
ADD CONSTRAINT fk_wallet_tx_electricity
FOREIGN KEY (related_electricity_tx_id) REFERENCES public.electricity_transactions(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- Table 8: Consumption Records (Analytics & Projections)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consumption_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    meter_id UUID NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    units_consumed_kwh NUMERIC(10, 2) NOT NULL CHECK (units_consumed_kwh >= 0),
    estimated_cost_kobo BIGINT NOT NULL DEFAULT 0,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_meter_consumption_date UNIQUE (meter_id, date)
);

-- ----------------------------------------------------------------------------
-- Table 9: Notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type notification_type_enum NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Table 10: Audit Logs (Security & Compliance)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user ON public.wallet_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_meters_user ON public.meters(user_id);
CREATE INDEX IF NOT EXISTS idx_meters_number ON public.meters(meter_number);
CREATE INDEX IF NOT EXISTS idx_meter_verifications_user ON public.meter_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_user ON public.payment_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_ref ON public.payment_attempts(reference);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_idemp ON public.payment_attempts(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON public.wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_electricity_tx_user ON public.electricity_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_electricity_tx_status ON public.electricity_transactions(status);
CREATE INDEX IF NOT EXISTS idx_electricity_tx_ref ON public.electricity_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_electricity_tx_idemp ON public.electricity_transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_consumption_meter_date ON public.consumption_records(meter_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs(user_id, created_at DESC);

-- ============================================================================
-- 5. ATOMIC FINANCIAL STORED PROCEDURES (IDEMPOTENT RPCS)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RPC 1: Credit Wallet From Successful Payment (Paystack / Flutterwave)
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
BEGIN
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
        RAISE EXCEPTION 'Payment attempt not found for user';
    END IF;

    IF v_payment.status = 'successful' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_completed'
        );
    END IF;

    -- 3. Lock wallet row exclusively
    SELECT * INTO v_wallet
    FROM public.wallet_accounts
    WHERE id = v_payment.wallet_id AND user_id = p_user_id
    FOR UPDATE;

    IF v_wallet.is_locked THEN
        RAISE EXCEPTION 'Wallet account is locked. Please contact support.';
    END IF;

    v_balance_before := v_wallet.balance_kobo;
    v_balance_after := v_balance_before + v_payment.amount_kobo;

    -- 4. Update wallet balance
    UPDATE public.wallet_accounts
    SET balance_kobo = v_balance_after
    WHERE id = v_wallet.id;

    -- 5. Mark payment attempt as successful
    UPDATE public.payment_attempts
    SET status = 'successful'
    WHERE id = v_payment.id;

    -- 6. Insert audit ledger entry
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

    -- 7. Add notification
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data
    ) VALUES (
        p_user_id,
        'funding',
        'Wallet Funded Successfully',
        '₦' || (v_payment.amount_kobo / 100)::text || ' has been credited to your wallet balance.',
        jsonb_build_object('amount_kobo', v_payment.amount_kobo, 'wallet_tx_id', v_wallet_tx_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'completed',
        'balance_kobo', v_balance_after,
        'transaction_id', v_wallet_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- RPC 2: Debit Wallet For Electricity Purchase
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_wallet_for_electricity(
    p_user_id UUID,
    p_amount_kobo BIGINT,
    p_electricity_tx_id UUID,
    p_idempotency_key VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    v_wallet public.wallet_accounts%ROWTYPE;
    v_balance_before BIGINT;
    v_balance_after BIGINT;
    v_wallet_tx_id UUID;
BEGIN
    -- 1. Check idempotency
    SELECT id INTO v_wallet_tx_id
    FROM public.wallet_transactions
    WHERE idempotency_key = p_idempotency_key;

    IF v_wallet_tx_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_processed',
            'wallet_tx_id', v_wallet_tx_id
        );
    END IF;

    -- 2. Lock wallet row exclusively
    SELECT * INTO v_wallet
    FROM public.wallet_accounts
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_wallet.id IS NULL THEN
        RAISE EXCEPTION 'Wallet account not found';
    END IF;

    IF v_wallet.is_locked THEN
        RAISE EXCEPTION 'Wallet account is locked';
    END IF;

    IF v_wallet.balance_kobo < p_amount_kobo THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INSUFFICIENT_BALANCE',
            'available_kobo', v_wallet.balance_kobo,
            'required_kobo', p_amount_kobo
        );
    END IF;

    v_balance_before := v_wallet.balance_kobo;
    v_balance_after := v_balance_before - p_amount_kobo;

    -- 3. Execute balance debit
    UPDATE public.wallet_accounts
    SET balance_kobo = v_balance_after
    WHERE id = v_wallet.id;

    -- 4. Record wallet debit transaction
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
        -p_amount_kobo,
        v_balance_before,
        v_balance_after,
        'WTX-DEB-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
        'Electricity token purchase',
        p_idempotency_key,
        p_electricity_tx_id
    ) RETURNING id INTO v_wallet_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'balance_kobo', v_balance_after,
        'wallet_tx_id', v_wallet_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- RPC 3: Refund Electricity Purchase (If Vending Failed / Timed Out)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_electricity_purchase(
    p_user_id UUID,
    p_electricity_tx_id UUID,
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
    WHERE id = p_electricity_tx_id AND user_id = p_user_id
    FOR UPDATE;

    IF v_elec_tx.id IS NULL THEN
        RAISE EXCEPTION 'Electricity transaction not found';
    END IF;

    IF v_elec_tx.status = 'reversed' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_refunded');
    END IF;

    -- Lock wallet
    SELECT * INTO v_wallet
    FROM public.wallet_accounts
    WHERE id = v_elec_tx.wallet_id AND user_id = p_user_id
    FOR UPDATE;

    v_balance_before := v_wallet.balance_kobo;
    v_balance_after := v_balance_before + v_elec_tx.amount_kobo;

    -- Credit back to wallet
    UPDATE public.wallet_accounts
    SET balance_kobo = v_balance_after
    WHERE id = v_wallet.id;

    -- Update electricity status to reversed
    UPDATE public.electricity_transactions
    SET status = 'reversed',
        error_message = p_reason
    WHERE id = v_elec_tx.id;

    -- Insert refund credit ledger item
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
        'refund_credit',
        v_elec_tx.amount_kobo,
        v_balance_before,
        v_balance_after,
        'WTX-REF-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
        'Refund: ' || p_reason,
        'REFUND-' || v_elec_tx.id::text,
        v_elec_tx.id
    ) RETURNING id INTO v_refund_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'reversed',
        'balance_kobo', v_balance_after,
        'refund_tx_id', v_refund_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electricity_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS: Profiles
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- RLS: Wallet Accounts
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own wallet"
    ON public.wallet_accounts FOR SELECT
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RLS: Meters
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own meters"
    ON public.meters FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meters"
    ON public.meters FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meters"
    ON public.meters FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own meters"
    ON public.meters FOR DELETE
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RLS: Meter Verifications
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own meter verifications"
    ON public.meter_verifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own meter verifications"
    ON public.meter_verifications FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RLS: Payment Attempts
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own payment attempts"
    ON public.payment_attempts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own payment attempts"
    ON public.payment_attempts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RLS: Wallet Transactions (Ledger is Read-Only for Users)
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own wallet transactions"
    ON public.wallet_transactions FOR SELECT
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RLS: Electricity Transactions
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own electricity transactions"
    ON public.electricity_transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own electricity transactions"
    ON public.electricity_transactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RLS: Consumption Records
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own consumption records"
    ON public.consumption_records FOR SELECT
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RLS: Notifications
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RLS: Audit Logs
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own audit logs"
    ON public.audit_logs FOR SELECT
    USING (auth.uid() = user_id);

-- ============================================================================
-- 7. AUTH TRIGGER: AUTO-PROVISION PROFILE & WALLET ON SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_provisioning()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Create User Profile
    INSERT INTO public.profiles (id, full_name, email, is_onboarded)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Customer'),
        NEW.email,
        FALSE
    );

    -- 2. Create Initial Wallet Account
    INSERT INTO public.wallet_accounts (user_id, balance_kobo, currency)
    VALUES (
        NEW.id,
        0,
        'NGN'
    );

    -- 3. Create Welcome Notification
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (
        NEW.id,
        'info',
        'Welcome to Smart Electricity! ⚡',
        'Your secure digital electricity wallet has been activated. Connect a meter to get started.'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_provisioning();
