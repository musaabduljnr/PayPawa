-- ============================================================================
-- PAYPAWA: PHASE 10A DATABASE MIGRATION
-- Admin & Operations Portal Foundation, Authentication & RBAC Engine
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- 1. CREATE RBAC TABLES
-- ----------------------------------------------------------------------------

-- A. Roles Table
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(64) UNIQUE NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- B. Permissions Table
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(128) UNIQUE NOT NULL,
    module VARCHAR(64) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- C. Role Permissions Mapping Table
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

-- D. Staff Members Table
CREATE TABLE IF NOT EXISTS public.staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    role_id UUID NOT NULL REFERENCES public.roles(id),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DISABLED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- E. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL,
    target_type VARCHAR(64) NOT NULL,
    target_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist if audit_logs was pre-created in an earlier schema
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_type VARCHAR(64);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_id TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Drop legacy NOT NULL constraints from earlier schema versions if present
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

-- Indexes for high-frequency permission & audit lookups
CREATE INDEX IF NOT EXISTS idx_staff_members_user_status ON public.staff_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON public.audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs(target_type, target_id);

-- 2. SEED PERMISSIONS
-- ----------------------------------------------------------------------------
INSERT INTO public.permissions (key, module, description) VALUES
    -- Users / Customers
    ('users.view', 'users', 'View customer profiles and account summaries'),
    ('users.manage', 'users', 'Edit customer accounts and status'),
    -- Meters
    ('meters.view', 'meters', 'View customer meters and registration status'),
    ('meters.manage', 'meters', 'Manage meter records and verification overrides'),
    -- Transactions
    ('transactions.view', 'transactions', 'View electricity purchases and vending transactions'),
    ('transactions.reconcile', 'transactions', 'Reconcile in-flight or disputed vending transactions'),
    ('transactions.retry', 'transactions', 'Retry failed token dispatches with provider'),
    -- Payments
    ('payments.view', 'payments', 'View payment attempts and gateway transactions'),
    ('payments.reconcile', 'payments', 'Reconcile gateway payment attempts and webhook logs'),
    -- Wallets
    ('wallets.view', 'wallets', 'View customer wallet balances and ledger movements'),
    ('wallets.adjust', 'wallets', 'Perform manual administrative wallet credits/debits'),
    -- Support
    ('support.view', 'support', 'View customer support inquiries and issues'),
    ('support.manage', 'support', 'Respond to, assign, and resolve support tickets'),
    -- Reports
    ('reports.view', 'reports', 'View operational, financial, and consumption analytics reports'),
    ('reports.export', 'reports', 'Export financial records and transaction reports'),
    -- Staff Management
    ('staff.view', 'staff', 'View staff directory, roles, and status'),
    ('staff.manage', 'staff', 'Invite, modify, and suspend staff accounts and role assignments'),
    -- Audit Logs
    ('audit_logs.view', 'audit_logs', 'View immutable audit trail and staff action history'),
    -- Integrations & Providers
    ('integrations.view', 'integrations', 'View provider gateway status and configurations'),
    ('integrations.manage', 'integrations', 'Update provider credentials and failover routing'),
    -- System Settings
    ('settings.view', 'settings', 'View platform configuration parameters'),
    ('settings.manage', 'settings', 'Modify system parameters and feature flags'),
    -- AI Operations
    ('ai.view', 'ai', 'View AI energy intelligence queries, rates, and hallucination logs'),
    ('ai.manage', 'ai', 'Manage AI prompt configuration, model selection, and token quotas')
ON CONFLICT (key) DO UPDATE SET
    module = EXCLUDED.module,
    description = EXCLUDED.description;

-- 3. SEED ROLES
-- ----------------------------------------------------------------------------
INSERT INTO public.roles (name, display_name, description) VALUES
    ('SUPER_ADMIN', 'Super Administrator', 'Full unrestricted platform access across all operational, financial, and security domains'),
    ('OPERATIONS_MANAGER', 'Operations Manager', 'Supervises customer accounts, meter routing, and transaction reconciliation with reporting'),
    ('OPERATIONS_AGENT', 'Operations Agent', 'Handles day-to-day transaction troubleshooting, meter lookups, and basic reconciliation'),
    ('FINANCE_MANAGER', 'Finance Manager', 'Full financial oversight, payment reconciliation, wallet adjustments, and reporting exports'),
    ('FINANCE_AGENT', 'Finance Agent', 'Monitors incoming payments, reviews ledger movements, and reconciles gateway charges'),
    ('CUSTOMER_SUPPORT', 'Customer Support', 'Assists customers with transaction status, meter details, and support ticket resolution'),
    ('ANALYST', 'Data & Business Analyst', 'Read-only access across platform data, analytics dashboards, and report exports')
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;

-- 4. MAP ROLE PERMISSIONS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_super_admin_id UUID;
    v_ops_mgr_id UUID;
    v_ops_agent_id UUID;
    v_fin_mgr_id UUID;
    v_fin_agent_id UUID;
    v_support_id UUID;
    v_analyst_id UUID;
BEGIN
    SELECT id INTO v_super_admin_id FROM public.roles WHERE name = 'SUPER_ADMIN';
    SELECT id INTO v_ops_mgr_id FROM public.roles WHERE name = 'OPERATIONS_MANAGER';
    SELECT id INTO v_ops_agent_id FROM public.roles WHERE name = 'OPERATIONS_AGENT';
    SELECT id INTO v_fin_mgr_id FROM public.roles WHERE name = 'FINANCE_MANAGER';
    SELECT id INTO v_fin_agent_id FROM public.roles WHERE name = 'FINANCE_AGENT';
    SELECT id INTO v_support_id FROM public.roles WHERE name = 'CUSTOMER_SUPPORT';
    SELECT id INTO v_analyst_id FROM public.roles WHERE name = 'ANALYST';

    -- Clear existing mappings for clean synchronization
    DELETE FROM public.role_permissions;

    -- A. SUPER_ADMIN: All Permissions
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_super_admin_id, id FROM public.permissions;

    -- B. OPERATIONS_MANAGER
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_ops_mgr_id, id FROM public.permissions
    WHERE key IN (
        'users.view',
        'meters.view',
        'meters.manage',
        'transactions.view',
        'transactions.reconcile',
        'transactions.retry',
        'reports.view'
    );

    -- C. OPERATIONS_AGENT
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_ops_agent_id, id FROM public.permissions
    WHERE key IN (
        'users.view',
        'meters.view',
        'transactions.view',
        'transactions.reconcile'
    );

    -- D. FINANCE_MANAGER
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_fin_mgr_id, id FROM public.permissions
    WHERE key IN (
        'users.view',
        'transactions.view',
        'payments.view',
        'payments.reconcile',
        'wallets.view',
        'wallets.adjust',
        'reports.view',
        'reports.export'
    );

    -- E. FINANCE_AGENT
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_fin_agent_id, id FROM public.permissions
    WHERE key IN (
        'users.view',
        'transactions.view',
        'payments.view',
        'payments.reconcile',
        'wallets.view'
    );

    -- F. CUSTOMER_SUPPORT
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_support_id, id FROM public.permissions
    WHERE key IN (
        'users.view',
        'meters.view',
        'transactions.view',
        'wallets.view',
        'support.view',
        'support.manage'
    );

    -- G. ANALYST
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_analyst_id, id FROM public.permissions
    WHERE key IN (
        'users.view',
        'meters.view',
        'transactions.view',
        'payments.view',
        'wallets.view',
        'reports.view',
        'reports.export'
    );
END $$;

-- 5. SERVER-SIDE STORED PROCEDURES & AUTH FUNCTIONS
-- ----------------------------------------------------------------------------

-- A. is_staff: Checks if user has an active staff record
CREATE OR REPLACE FUNCTION public.is_staff(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.staff_members
        WHERE user_id = p_user_id AND status = 'ACTIVE'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. has_permission: Authoritative permission evaluation
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_permission_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_has_perm BOOLEAN := FALSE;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if user is an ACTIVE staff member with the requested permission
    SELECT EXISTS (
        SELECT 1
        FROM public.staff_members sm
        JOIN public.role_permissions rp ON rp.role_id = sm.role_id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE sm.user_id = p_user_id
          AND sm.status = 'ACTIVE'
          AND p.key = p_permission_key
    ) INTO v_has_perm;

    RETURN v_has_perm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. get_staff_context: Retrieves role and permission set for authenticated staff
CREATE OR REPLACE FUNCTION public.get_staff_context(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_staff public.staff_members%ROWTYPE;
    v_role public.roles%ROWTYPE;
    v_permissions TEXT[];
    v_user_email TEXT;
    v_user_name TEXT;
BEGIN
    -- Check caller security: only self or service_role can query staff context
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized. You cannot query staff context for another user.';
    END IF;

    SELECT * INTO v_staff
    FROM public.staff_members
    WHERE user_id = p_user_id;

    IF v_staff.id IS NULL THEN
        RETURN jsonb_build_object(
            'is_staff', false,
            'error', 'USER_NOT_STAFF'
        );
    END IF;

    IF v_staff.status <> 'ACTIVE' THEN
        RETURN jsonb_build_object(
            'is_staff', true,
            'status', v_staff.status,
            'error', 'STAFF_ACCOUNT_SUSPENDED'
        );
    END IF;

    SELECT * INTO v_role
    FROM public.roles
    WHERE id = v_staff.role_id;

    SELECT COALESCE(array_agg(p.key), '{}') INTO v_permissions
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = v_staff.role_id;

    -- Fetch profile metadata
    SELECT email, full_name INTO v_user_email, v_user_name
    FROM public.profiles
    WHERE id = p_user_id;

    -- Update last login
    UPDATE public.staff_members
    SET last_login_at = NOW()
    WHERE id = v_staff.id;

    RETURN jsonb_build_object(
        'is_staff', true,
        'staff_id', v_staff.id,
        'user_id', v_staff.user_id,
        'email', v_user_email,
        'full_name', v_user_name,
        'role', v_role.name,
        'role_display_name', v_role.display_name,
        'status', v_staff.status,
        'permissions', v_permissions,
        'last_login_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. log_audit_event: Server-side audit logging function
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_actor_user_id UUID,
    p_action TEXT,
    p_target_type TEXT,
    p_target_id TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_staff_id UUID;
    v_audit_id UUID;
BEGIN
    SELECT id INTO v_staff_id
    FROM public.staff_members
    WHERE user_id = p_actor_user_id;

    INSERT INTO public.audit_logs (
        staff_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        metadata
    ) VALUES (
        v_staff_id,
        p_actor_user_id,
        p_action,
        p_target_type,
        p_target_id,
        COALESCE(p_metadata, '{}'::jsonb)
    ) RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Staff can view roles" ON public.roles;
DROP POLICY IF EXISTS "Staff can view permissions" ON public.permissions;
DROP POLICY IF EXISTS "Staff can view role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Staff can view staff members" ON public.staff_members;
DROP POLICY IF EXISTS "Staff with audit_logs.view can view audit logs" ON public.audit_logs;

-- Read policies for active staff
CREATE POLICY "Staff can view roles"
    ON public.roles FOR SELECT
    TO authenticated
    USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can view permissions"
    ON public.permissions FOR SELECT
    TO authenticated
    USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can view role permissions"
    ON public.role_permissions FOR SELECT
    TO authenticated
    USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can view staff members"
    ON public.staff_members FOR SELECT
    TO authenticated
    USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff with audit_logs.view can view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (public.has_permission(auth.uid(), 'audit_logs.view'));
