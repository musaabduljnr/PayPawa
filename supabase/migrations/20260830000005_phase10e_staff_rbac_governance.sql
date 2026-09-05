-- ============================================================================
-- PAYPAWA: PHASE 10E DATABASE MIGRATION
-- Staff Management, RBAC Governance, Dual-Control & Self-Escalation Protection
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- 1. DUAL CONTROL APPROVALS TABLE (FOUR-EYES PRINCIPLE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pending_governance_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type VARCHAR(64) NOT NULL, -- e.g. 'ROLE_ESCALATION_SUPER_ADMIN', 'CRITICAL_SECURITY_CHANGE'
    target_type VARCHAR(64) NOT NULL,
    target_id TEXT NOT NULL,
    requested_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED')),
    approved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    decision_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_governance_approvals_status ON public.pending_governance_approvals(status);
CREATE INDEX IF NOT EXISTS idx_governance_approvals_req_user ON public.pending_governance_approvals(requested_by_user_id);

ALTER TABLE public.pending_governance_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff with staff.manage can view governance approvals" ON public.pending_governance_approvals;
CREATE POLICY "Staff with staff.manage can view governance approvals"
    ON public.pending_governance_approvals FOR SELECT
    TO authenticated
    USING (public.has_permission(auth.uid(), 'staff.manage'));

DROP POLICY IF EXISTS "Staff with staff.manage can insert governance approvals" ON public.pending_governance_approvals;
CREATE POLICY "Staff with staff.manage can insert governance approvals"
    ON public.pending_governance_approvals FOR INSERT
    TO authenticated
    WITH CHECK (public.has_permission(auth.uid(), 'staff.manage'));

-- 2. STORED PROCEDURES & RPCs FOR STAFF MANAGEMENT
-- ----------------------------------------------------------------------------

-- A. admin_list_staff: Directory with search, filters, pagination, role & permission aggregates
CREATE OR REPLACE FUNCTION public.admin_list_staff(
    p_search TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_total_count INT := 0;
    v_staff_list JSONB;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'staff.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks staff.view permission.';
    END IF;

    SELECT COUNT(*) INTO v_total_count
    FROM public.staff_members sm
    JOIN public.profiles p ON p.id = sm.user_id
    JOIN public.roles r ON r.id = sm.role_id
    WHERE (p_status IS NULL OR p_status = 'ALL' OR sm.status = p_status)
      AND (p_role IS NULL OR p_role = 'ALL' OR r.name = p_role)
      AND (
          p_search IS NULL OR p_search = '' OR
          p.full_name ILIKE '%' || p_search || '%' OR
          p.email ILIKE '%' || p_search || '%' OR
          r.display_name ILIKE '%' || p_search || '%'
      );

    SELECT COALESCE(jsonb_agg(s_row), '[]'::jsonb) INTO v_staff_list
    FROM (
        SELECT
            sm.id,
            sm.user_id,
            p.full_name,
            p.email,
            p.phone,
            r.id AS role_id,
            r.name AS role,
            r.display_name AS role_display_name,
            sm.status,
            sm.last_login_at,
            sm.created_at,
            sm.updated_at,
            (
                SELECT COALESCE(jsonb_agg(perm.key), '[]'::jsonb)
                FROM public.role_permissions rp
                JOIN public.permissions perm ON perm.id = rp.permission_id
                WHERE rp.role_id = r.id
            ) AS permissions,
            (SELECT COUNT(*) FROM public.audit_logs al WHERE al.actor_user_id = sm.user_id) AS total_actions_count
        FROM public.staff_members sm
        JOIN public.profiles p ON p.id = sm.user_id
        JOIN public.roles r ON r.id = sm.role_id
        WHERE (p_status IS NULL OR p_status = 'ALL' OR sm.status = p_status)
          AND (p_role IS NULL OR p_role = 'ALL' OR r.name = p_role)
          AND (
              p_search IS NULL OR p_search = '' OR
              p.full_name ILIKE '%' || p_search || '%' OR
              p.email ILIKE '%' || p_search || '%' OR
              r.display_name ILIKE '%' || p_search || '%'
          )
        ORDER BY
            CASE sm.status
                WHEN 'ACTIVE' THEN 1
                WHEN 'SUSPENDED' THEN 2
                ELSE 3
            END,
            sm.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) s_row;

    RETURN jsonb_build_object(
        'total', v_total_count,
        'limit', p_limit,
        'offset', p_offset,
        'data', v_staff_list
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. admin_create_staff: Super Admin creates/invites staff member
CREATE OR REPLACE FUNCTION public.admin_create_staff(
    p_name TEXT,
    p_email TEXT,
    p_role_id UUID,
    p_initial_status TEXT DEFAULT 'ACTIVE'
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_target_user_id UUID;
    v_staff_id UUID;
    v_role RECORD;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'staff.manage') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks staff.manage permission.';
    END IF;

    IF p_initial_status NOT IN ('ACTIVE', 'SUSPENDED', 'DISABLED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
    END IF;

    SELECT * INTO v_role FROM public.roles WHERE id = p_role_id;
    IF v_role.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROLE_NOT_FOUND');
    END IF;

    -- Look up profile or generate one if creating placeholder
    SELECT id INTO v_target_user_id FROM public.profiles WHERE email ILIKE p_email LIMIT 1;
    IF v_target_user_id IS NULL THEN
        -- Create linked profile record
        INSERT INTO public.profiles (
            id,
            email,
            full_name,
            account_type,
            is_onboarded,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            p_email,
            p_name,
            'STAFF',
            true,
            NOW(),
            NOW()
        ) RETURNING id INTO v_target_user_id;
    END IF;

    -- Check if already a staff member
    IF EXISTS (SELECT 1 FROM public.staff_members WHERE user_id = v_target_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'USER_ALREADY_STAFF');
    END IF;

    INSERT INTO public.staff_members (
        user_id,
        role_id,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_target_user_id,
        p_role_id,
        p_initial_status,
        NOW(),
        NOW()
    ) RETURNING id INTO v_staff_id;

    -- Audit trail
    PERFORM public.log_audit_event(
        v_caller_id,
        'STAFF_MEMBER_CREATED',
        'STAFF_MEMBER',
        v_staff_id::TEXT,
        jsonb_build_object(
            'email', p_email,
            'name', p_name,
            'role', v_role.name,
            'status', p_initial_status
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'staff_id', v_staff_id,
        'user_id', v_target_user_id,
        'role', v_role.name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. admin_update_staff_status: Update staff status with Self-Modification Protection
CREATE OR REPLACE FUNCTION public.admin_update_staff_status(
    p_staff_id UUID,
    p_status TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_target_staff RECORD;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'staff.manage') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks staff.manage permission.';
    END IF;

    IF p_status NOT IN ('ACTIVE', 'SUSPENDED', 'DISABLED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
    END IF;

    SELECT * INTO v_target_staff FROM public.staff_members WHERE id = p_staff_id;
    IF v_target_staff.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
    END IF;

    -- SELF-MODIFICATION PROTECTION: Cannot modify one's own status
    IF v_target_staff.user_id = v_caller_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'SELF_MODIFICATION_FORBIDDEN: You cannot modify your own staff status.'
        );
    END IF;

    UPDATE public.staff_members
    SET
        status = p_status,
        updated_at = NOW()
    WHERE id = p_staff_id;

    -- Audit trail
    PERFORM public.log_audit_event(
        v_caller_id,
        'STAFF_STATUS_UPDATED',
        'STAFF_MEMBER',
        p_staff_id::TEXT,
        jsonb_build_object(
            'from_status', v_target_staff.status,
            'to_status', p_status,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'staff_id', p_staff_id,
        'status', p_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. admin_update_staff_role: Role Assignment with Self-Escalation & Dual-Control Protection
CREATE OR REPLACE FUNCTION public.admin_update_staff_role(
    p_staff_id UUID,
    p_new_role_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_target_staff RECORD;
    v_new_role RECORD;
    v_super_admin_role_id UUID;
    v_approval_id UUID;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'staff.manage') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks staff.manage permission.';
    END IF;

    SELECT * INTO v_target_staff FROM public.staff_members WHERE id = p_staff_id;
    IF v_target_staff.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
    END IF;

    SELECT * INTO v_new_role FROM public.roles WHERE id = p_new_role_id;
    IF v_new_role.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROLE_NOT_FOUND');
    END IF;

    -- 1. SELF-ESCALATION PROTECTION: Strictly forbid modifying own role
    IF v_target_staff.user_id = v_caller_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'SELF_ESCALATION_FORBIDDEN: You cannot modify your own role or elevate your own privileges.'
        );
    END IF;

    -- 2. DUAL CONTROL FOR SUPER_ADMIN ELEVATION
    SELECT id INTO v_super_admin_role_id FROM public.roles WHERE name = 'SUPER_ADMIN';
    IF v_new_role.name = 'SUPER_ADMIN' THEN
        -- Check if this is already an approved governance action
        -- If not, create a dual-control governance approval request
        INSERT INTO public.pending_governance_approvals (
            request_type,
            target_type,
            target_id,
            requested_by_user_id,
            payload,
            status,
            created_at
        ) VALUES (
            'ROLE_ESCALATION_SUPER_ADMIN',
            'STAFF_MEMBER',
            p_staff_id::TEXT,
            v_caller_id,
            jsonb_build_object(
                'target_staff_id', p_staff_id,
                'target_user_id', v_target_staff.user_id,
                'current_role_id', v_target_staff.role_id,
                'new_role_id', p_new_role_id,
                'new_role_name', v_new_role.name,
                'reason', p_reason
            ),
            'PENDING',
            NOW()
        ) RETURNING id INTO v_approval_id;

        PERFORM public.log_audit_event(
            v_caller_id,
            'GOVERNANCE_APPROVAL_REQUESTED',
            'GOVERNANCE_REQUEST',
            v_approval_id::TEXT,
            jsonb_build_object(
                'request_type', 'ROLE_ESCALATION_SUPER_ADMIN',
                'target_staff_id', p_staff_id,
                'target_role', 'SUPER_ADMIN'
            )
        );

        RETURN jsonb_build_object(
            'success', true,
            'requires_dual_control', true,
            'approval_id', v_approval_id,
            'message', 'Super Admin elevation requires Dual-Control (Four-Eyes) approval from a second administrator.'
        );
    END IF;

    -- Direct execution for standard operational roles
    UPDATE public.staff_members
    SET
        role_id = p_new_role_id,
        updated_at = NOW()
    WHERE id = p_staff_id;

    -- Audit trail
    PERFORM public.log_audit_event(
        v_caller_id,
        'STAFF_ROLE_UPDATED',
        'STAFF_MEMBER',
        p_staff_id::TEXT,
        jsonb_build_object(
            'from_role_id', v_target_staff.role_id,
            'to_role_id', p_new_role_id,
            'to_role_name', v_new_role.name,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'requires_dual_control', false,
        'staff_id', p_staff_id,
        'new_role', v_new_role.name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- E. admin_decide_governance_action: Dual-Control approval/rejection (Four-Eyes Principle)
CREATE OR REPLACE FUNCTION public.admin_decide_governance_action(
    p_approval_id UUID,
    p_decision TEXT, -- 'APPROVE' or 'REJECT'
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_req RECORD;
    v_target_staff_id UUID;
    v_new_role_id UUID;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'staff.manage') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks staff.manage permission.';
    END IF;

    SELECT * INTO v_req FROM public.pending_governance_approvals WHERE id = p_approval_id;
    IF v_req.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'APPROVAL_REQUEST_NOT_FOUND');
    END IF;

    IF v_req.status <> 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'error', 'REQUEST_ALREADY_DECIDED');
    END IF;

    -- FOUR-EYES PRINCIPLE: Requester cannot approve their own governance request
    IF v_req.requested_by_user_id = v_caller_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'DUAL_CONTROL_VIOLATION: Requester cannot approve their own governance action. Second administrator required.'
        );
    END IF;

    IF p_decision = 'APPROVE' THEN
        -- Execute the requested action
        IF v_req.request_type = 'ROLE_ESCALATION_SUPER_ADMIN' THEN
            v_target_staff_id := (v_req.payload->>'target_staff_id')::UUID;
            v_new_role_id := (v_req.payload->>'new_role_id')::UUID;

            UPDATE public.staff_members
            SET role_id = v_new_role_id, updated_at = NOW()
            WHERE id = v_target_staff_id;
        END IF;

        UPDATE public.pending_governance_approvals
        SET
            status = 'APPROVED',
            approved_by_user_id = v_caller_id,
            decision_notes = p_notes,
            decided_at = NOW()
        WHERE id = p_approval_id;

        PERFORM public.log_audit_event(
            v_caller_id,
            'GOVERNANCE_ACTION_APPROVED',
            'GOVERNANCE_REQUEST',
            p_approval_id::TEXT,
            jsonb_build_object('request_type', v_req.request_type, 'notes', p_notes)
        );

        RETURN jsonb_build_object('success', true, 'decision', 'APPROVED', 'approval_id', p_approval_id);
    ELSE
        UPDATE public.pending_governance_approvals
        SET
            status = 'REJECTED',
            approved_by_user_id = v_caller_id,
            decision_notes = p_notes,
            decided_at = NOW()
        WHERE id = p_approval_id;

        PERFORM public.log_audit_event(
            v_caller_id,
            'GOVERNANCE_ACTION_REJECTED',
            'GOVERNANCE_REQUEST',
            p_approval_id::TEXT,
            jsonb_build_object('request_type', v_req.request_type, 'notes', p_notes)
        );

        RETURN jsonb_build_object('success', true, 'decision', 'REJECTED', 'approval_id', p_approval_id);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- F. admin_list_roles_and_permissions: Retrieve all roles with mapped permissions
CREATE OR REPLACE FUNCTION public.admin_list_roles_and_permissions()
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_roles JSONB;
    v_all_permissions JSONB;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'staff.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks staff.view permission.';
    END IF;

    -- All Available Permissions
    SELECT COALESCE(jsonb_agg(p_row), '[]'::jsonb) INTO v_all_permissions
    FROM (
        SELECT id, key, module, description
        FROM public.permissions
        ORDER BY module, key
    ) p_row;

    -- Roles with user counts and permission list
    SELECT COALESCE(jsonb_agg(r_row), '[]'::jsonb) INTO v_roles
    FROM (
        SELECT
            r.id,
            r.name,
            r.display_name,
            r.description,
            (SELECT COUNT(*) FROM public.staff_members sm WHERE sm.role_id = r.id) AS member_count,
            (
                SELECT COALESCE(jsonb_agg(p.key), '[]'::jsonb)
                FROM public.role_permissions rp
                JOIN public.permissions p ON p.id = rp.permission_id
                WHERE rp.role_id = r.id
            ) AS permission_keys
        FROM public.roles r
        ORDER BY
            CASE r.name
                WHEN 'SUPER_ADMIN' THEN 1
                WHEN 'OPERATIONS_MANAGER' THEN 2
                WHEN 'FINANCE_MANAGER' THEN 3
                WHEN 'CUSTOMER_SUPPORT' THEN 4
                ELSE 5
            END
    ) r_row;

    RETURN jsonb_build_object(
        'success', true,
        'roles', v_roles,
        'permissions', v_all_permissions
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- G. admin_update_role_permissions: Update permission mappings for a specific role
CREATE OR REPLACE FUNCTION public.admin_update_role_permissions(
    p_role_id UUID,
    p_permission_keys TEXT[]
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_role RECORD;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'staff.manage') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks staff.manage permission.';
    END IF;

    SELECT * INTO v_role FROM public.roles WHERE id = p_role_id;
    IF v_role.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROLE_NOT_FOUND');
    END IF;

    -- Cannot strip SUPER_ADMIN permissions arbitrarily
    IF v_role.name = 'SUPER_ADMIN' THEN
        RETURN jsonb_build_object('success', false, 'error', 'SUPER_ADMIN_PERMISSIONS_IMMUTABLE');
    END IF;

    -- Clear existing mappings
    DELETE FROM public.role_permissions WHERE role_id = p_role_id;

    -- Insert new mappings
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT p_role_id, id
    FROM public.permissions
    WHERE key = ANY(p_permission_keys);

    -- Audit trail
    PERFORM public.log_audit_event(
        v_caller_id,
        'ROLE_PERMISSIONS_UPDATED',
        'ROLE',
        p_role_id::TEXT,
        jsonb_build_object(
            'role_name', v_role.name,
            'permission_count', array_length(p_permission_keys, 1),
            'permission_keys', p_permission_keys
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'role_id', p_role_id,
        'role_name', v_role.name,
        'updated_permission_keys', p_permission_keys
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- H. admin_get_staff_activity: Retrieve sanitized activity log for staff
CREATE OR REPLACE FUNCTION public.admin_get_staff_activity(
    p_staff_id UUID,
    p_limit INT DEFAULT 20
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_target_staff RECORD;
    v_activity JSONB;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'audit_logs.view') AND NOT public.has_permission(v_caller_id, 'staff.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks staff.view / audit_logs.view permission.';
    END IF;

    SELECT * INTO v_target_staff FROM public.staff_members WHERE id = p_staff_id;
    IF v_target_staff.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
    END IF;

    SELECT COALESCE(jsonb_agg(act_row), '[]'::jsonb) INTO v_activity
    FROM (
        SELECT
            al.id,
            al.action,
            al.target_type,
            al.target_id,
            al.metadata,
            al.created_at
        FROM public.audit_logs al
        WHERE al.actor_user_id = v_target_staff.user_id
        ORDER BY al.created_at DESC
        LIMIT p_limit
    ) act_row;

    RETURN jsonb_build_object(
        'success', true,
        'staff_id', p_staff_id,
        'activity', v_activity
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
