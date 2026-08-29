-- ============================================================================
-- SMART ELECTRICITY: PHASE 2 DATABASE MIGRATION
-- Authentication, Extended User Profiles, Energy Profiles & User Appliances
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- 0. ENSURE TIMESTAMP HELPER FUNCTION EXISTS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. EXTEND PROFILES TABLE
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'household' CHECK (account_type IN ('household', 'business')),
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure is_onboarded stays synchronized for backward compatibility if present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_onboarded'
    ) THEN
        UPDATE public.profiles SET onboarding_completed = is_onboarded WHERE onboarding_completed = FALSE;
    END IF;
END $$;

-- 2. CREATE ENERGY PROFILES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.energy_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    account_type TEXT NOT NULL DEFAULT 'household' CHECK (account_type IN ('household', 'business')),
    occupants_count INT NOT NULL DEFAULT 1 CHECK (occupants_count > 0),
    building_type TEXT DEFAULT 'flat',
    primary_cooking_source TEXT DEFAULT 'gas_electric',
    has_solar BOOLEAN NOT NULL DEFAULT FALSE,
    has_generator BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_energy_profiles_updated_at ON public.energy_profiles;
CREATE TRIGGER trg_energy_profiles_updated_at
BEFORE UPDATE ON public.energy_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. CREATE USER APPLIANCES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_appliances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    appliance_type TEXT NOT NULL,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    usage_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (usage_frequency IN ('rarely', 'occasionally', 'daily', 'multiple_daily')),
    weekly_hours NUMERIC DEFAULT 0,
    estimated_daily_kwh NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_appliances_user_id ON public.user_appliances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_appliances_type ON public.user_appliances(user_id, appliance_type);

DROP TRIGGER IF EXISTS trg_user_appliances_updated_at ON public.user_appliances;
CREATE TRIGGER trg_user_appliances_updated_at
BEFORE UPDATE ON public.user_appliances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. UPDATE AUTH TRIGGER: AUTO-PROVISION PROFILE & WALLET ON SIGNUP
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_provisioning()
RETURNS TRIGGER AS $$
DECLARE
    v_full_name TEXT;
    v_phone TEXT;
    v_account_type TEXT;
BEGIN
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'Customer');
    v_phone := NEW.raw_user_meta_data->>'phone';
    v_account_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'household');

    -- 1. Create User Profile
    INSERT INTO public.profiles (
        id, 
        full_name, 
        email, 
        phone, 
        account_type, 
        onboarding_completed, 
        is_onboarded
    )
    VALUES (
        NEW.id,
        v_full_name,
        NEW.email,
        v_phone,
        v_account_type,
        FALSE,
        FALSE
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        account_type = COALESCE(EXCLUDED.account_type, public.profiles.account_type);

    -- 2. Create Initial Wallet Account (if not existing)
    INSERT INTO public.wallet_accounts (user_id, balance_kobo, currency)
    VALUES (NEW.id, 0, 'NGN')
    ON CONFLICT (user_id) DO NOTHING;

    -- 3. Create Welcome Notification
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (
        NEW.id,
        'info',
        'Welcome to Smart Electricity! ⚡',
        'Your energy account is ready. Complete your energy profile to optimize your usage estimates.'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users if not already active
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_provisioning();

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_appliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meters ENABLE ROW LEVEL SECURITY;

-- Profiles RLS
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Energy Profiles RLS
DROP POLICY IF EXISTS "Users can view own energy profile" ON public.energy_profiles;
CREATE POLICY "Users can view own energy profile"
    ON public.energy_profiles FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own energy profile" ON public.energy_profiles;
CREATE POLICY "Users can insert own energy profile"
    ON public.energy_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own energy profile" ON public.energy_profiles;
CREATE POLICY "Users can update own energy profile"
    ON public.energy_profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own energy profile" ON public.energy_profiles;
CREATE POLICY "Users can delete own energy profile"
    ON public.energy_profiles FOR DELETE
    USING (auth.uid() = user_id);

-- User Appliances RLS
DROP POLICY IF EXISTS "Users can view own appliances" ON public.user_appliances;
CREATE POLICY "Users can view own appliances"
    ON public.user_appliances FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own appliances" ON public.user_appliances;
CREATE POLICY "Users can insert own appliances"
    ON public.user_appliances FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own appliances" ON public.user_appliances;
CREATE POLICY "Users can update own appliances"
    ON public.user_appliances FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own appliances" ON public.user_appliances;
CREATE POLICY "Users can delete own appliances"
    ON public.user_appliances FOR DELETE
    USING (auth.uid() = user_id);
