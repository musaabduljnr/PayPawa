-- ============================================================================
-- PAYPAWA: PHASE 10D DATABASE MIGRATION
-- Customer Support & Case Management Portal Foundation, Stored Procedures & RLS
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- 1. CREATE SUPPORT TABLES
-- ----------------------------------------------------------------------------

-- A. Support Cases Table
CREATE TABLE IF NOT EXISTS public.support_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number VARCHAR(32) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category VARCHAR(64) NOT NULL CHECK (
        category IN (
            'WALLET',
            'PAYMENT',
            'ELECTRICITY_PURCHASE',
            'METER',
            'ACCOUNT',
            'TECHNICAL',
            'OTHER'
        )
    ),
    priority VARCHAR(32) NOT NULL DEFAULT 'MEDIUM' CHECK (
        priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')
    ),
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (
        status IN ('OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED')
    ),
    assigned_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    escalated_to_department VARCHAR(64) CHECK (
        escalated_to_department IN ('OPERATIONS', 'FINANCE', 'MANAGER', 'NONE')
    ),
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- B. Support Case Notes Table
CREATE TABLE IF NOT EXISTS public.support_case_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.support_cases(id) ON DELETE CASCADE,
    author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_internal BOOLEAN NOT NULL DEFAULT TRUE, -- TRUE = Internal Staff Note, FALSE = Customer-Visible Note
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- C. Indexes for fast filtering & search
CREATE INDEX IF NOT EXISTS idx_support_cases_customer ON public.support_cases(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_status ON public.support_cases(status);
CREATE INDEX IF NOT EXISTS idx_support_cases_priority ON public.support_cases(priority);
CREATE INDEX IF NOT EXISTS idx_support_cases_category ON public.support_cases(category);
CREATE INDEX IF NOT EXISTS idx_support_cases_assigned_staff ON public.support_cases(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_escalated ON public.support_cases(escalated_to_department);
CREATE INDEX IF NOT EXISTS idx_support_cases_created_at ON public.support_cases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_case_notes_case_created ON public.support_case_notes(case_id, created_at ASC);

-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_case_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view support cases" ON public.support_cases;
DROP POLICY IF EXISTS "Customers can view their own support cases" ON public.support_cases;
DROP POLICY IF EXISTS "Staff can manage support cases" ON public.support_cases;
DROP POLICY IF EXISTS "Staff can view case notes" ON public.support_case_notes;
DROP POLICY IF EXISTS "Customers can view customer-visible case notes" ON public.support_case_notes;
DROP POLICY IF EXISTS "Staff can create case notes" ON public.support_case_notes;

-- Cases RLS
CREATE POLICY "Staff can view support cases"
    ON public.support_cases FOR SELECT
    TO authenticated
    USING (public.has_permission(auth.uid(), 'support.view'));

CREATE POLICY "Customers can view their own support cases"
    ON public.support_cases FOR SELECT
    TO authenticated
    USING (auth.uid() = customer_id);

CREATE POLICY "Staff can manage support cases"
    ON public.support_cases FOR ALL
    TO authenticated
    USING (public.has_permission(auth.uid(), 'support.manage'));

-- Notes RLS
CREATE POLICY "Staff can view case notes"
    ON public.support_case_notes FOR SELECT
    TO authenticated
    USING (public.has_permission(auth.uid(), 'support.view'));

CREATE POLICY "Customers can view customer-visible case notes"
    ON public.support_case_notes FOR SELECT
    TO authenticated
    USING (
        is_internal = FALSE AND EXISTS (
            SELECT 1 FROM public.support_cases sc
            WHERE sc.id = case_id AND sc.customer_id = auth.uid()
        )
    );

CREATE POLICY "Staff can create case notes"
    ON public.support_case_notes FOR INSERT
    TO authenticated
    WITH CHECK (public.has_permission(auth.uid(), 'support.manage'));

-- 3. STORED PROCEDURES & RPCs
-- ----------------------------------------------------------------------------

-- A. admin_list_support_cases: Paginated case query with search and filters
CREATE OR REPLACE FUNCTION public.admin_list_support_cases(
    p_search TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_priority TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_assigned_to UUID DEFAULT NULL,
    p_escalated_dept TEXT DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_total_count INT := 0;
    v_cases JSONB;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'support.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks support.view permission.';
    END IF;

    SELECT COUNT(*) INTO v_total_count
    FROM public.support_cases sc
    LEFT JOIN public.profiles p ON p.id = sc.customer_id
    WHERE (p_status IS NULL OR p_status = 'ALL' OR sc.status = p_status)
      AND (p_priority IS NULL OR p_priority = 'ALL' OR sc.priority = p_priority)
      AND (p_category IS NULL OR p_category = 'ALL' OR sc.category = p_category)
      AND (p_assigned_to IS NULL OR sc.assigned_staff_id = p_assigned_to)
      AND (p_escalated_dept IS NULL OR p_escalated_dept = 'ALL' OR sc.escalated_to_department = p_escalated_dept)
      AND (
          p_search IS NULL OR p_search = '' OR
          sc.case_number ILIKE '%' || p_search || '%' OR
          sc.subject ILIKE '%' || p_search || '%' OR
          sc.description ILIKE '%' || p_search || '%' OR
          p.full_name ILIKE '%' || p_search || '%' OR
          p.email ILIKE '%' || p_search || '%' OR
          p.phone ILIKE '%' || p_search || '%'
      );

    SELECT COALESCE(jsonb_agg(case_row), '[]'::jsonb) INTO v_cases
    FROM (
        SELECT
            sc.id,
            sc.case_number,
            sc.customer_id,
            p.full_name AS customer_name,
            p.email AS customer_email,
            p.phone AS customer_phone,
            sc.category,
            sc.priority,
            sc.status,
            sc.assigned_staff_id,
            sm_prof.full_name AS assigned_staff_name,
            sm_prof.email AS assigned_staff_email,
            r.display_name AS assigned_staff_role,
            sc.escalated_to_department,
            sc.subject,
            sc.description,
            sc.resolution_notes,
            sc.resolved_at,
            sc.closed_at,
            sc.created_at,
            sc.updated_at,
            (SELECT COUNT(*) FROM public.support_case_notes scn WHERE scn.case_id = sc.id) AS notes_count,
            (SELECT COUNT(*) FROM public.support_case_notes scn WHERE scn.case_id = sc.id AND scn.is_internal = TRUE) AS internal_notes_count
        FROM public.support_cases sc
        LEFT JOIN public.profiles p ON p.id = sc.customer_id
        LEFT JOIN public.staff_members sm ON sm.id = sc.assigned_staff_id
        LEFT JOIN public.profiles sm_prof ON sm_prof.id = sm.user_id
        LEFT JOIN public.roles r ON r.id = sm.role_id
        WHERE (p_status IS NULL OR p_status = 'ALL' OR sc.status = p_status)
          AND (p_priority IS NULL OR p_priority = 'ALL' OR sc.priority = p_priority)
          AND (p_category IS NULL OR p_category = 'ALL' OR sc.category = p_category)
          AND (p_assigned_to IS NULL OR sc.assigned_staff_id = p_assigned_to)
          AND (p_escalated_dept IS NULL OR p_escalated_dept = 'ALL' OR sc.escalated_to_department = p_escalated_dept)
          AND (
              p_search IS NULL OR p_search = '' OR
              sc.case_number ILIKE '%' || p_search || '%' OR
              sc.subject ILIKE '%' || p_search || '%' OR
              sc.description ILIKE '%' || p_search || '%' OR
              p.full_name ILIKE '%' || p_search || '%' OR
              p.email ILIKE '%' || p_search || '%' OR
              p.phone ILIKE '%' || p_search || '%'
          )
        ORDER BY
            CASE sc.priority
                WHEN 'URGENT' THEN 1
                WHEN 'HIGH' THEN 2
                WHEN 'MEDIUM' THEN 3
                WHEN 'LOW' THEN 4
                ELSE 5
            END,
            sc.updated_at DESC
        LIMIT p_limit OFFSET p_offset
    ) case_row;

    RETURN jsonb_build_object(
        'total', v_total_count,
        'limit', p_limit,
        'offset', p_offset,
        'data', v_cases
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. admin_get_support_case_details: Fetches full case details and linked non-duplicated customer context
CREATE OR REPLACE FUNCTION public.admin_get_support_case_details(p_case_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_case RECORD;
    v_customer JSONB;
    v_meters JSONB;
    v_transactions JSONB;
    v_wallet JSONB;
    v_payments JSONB;
    v_notes JSONB;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'support.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks support.view permission.';
    END IF;

    SELECT
        sc.id,
        sc.case_number,
        sc.customer_id,
        sc.category,
        sc.priority,
        sc.status,
        sc.assigned_staff_id,
        sm_prof.full_name AS assigned_staff_name,
        sm_prof.email AS assigned_staff_email,
        r.display_name AS assigned_staff_role,
        sc.escalated_to_department,
        sc.subject,
        sc.description,
        sc.resolution_notes,
        sc.resolved_at,
        sc.closed_at,
        sc.created_at,
        sc.updated_at
    INTO v_case
    FROM public.support_cases sc
    LEFT JOIN public.staff_members sm ON sm.id = sc.assigned_staff_id
    LEFT JOIN public.profiles sm_prof ON sm_prof.id = sm.user_id
    LEFT JOIN public.roles r ON r.id = sm.role_id
    WHERE sc.id = p_case_id;

    IF v_case.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CASE_NOT_FOUND');
    END IF;

    -- 1. Customer Context Profile
    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'email', p.email,
        'phone', p.phone,
        'account_type', p.account_type,
        'is_onboarded', p.is_onboarded,
        'created_at', p.created_at
    ) INTO v_customer
    FROM public.profiles p
    WHERE p.id = v_case.customer_id;

    -- 2. Customer Registered Meters
    SELECT COALESCE(jsonb_agg(m_row), '[]'::jsonb) INTO v_meters
    FROM (
        SELECT
            m.id,
            m.meter_number,
            m.disco_code,
            m.disco_name,
            m.meter_type,
            m.customer_name,
            m.address,
            m.is_active AS is_primary,
            m.created_at
        FROM public.meters m
        WHERE m.user_id = v_case.customer_id
        ORDER BY m.is_active DESC, m.created_at DESC
    ) m_row;

    -- 3. Customer Recent Electricity Transactions
    SELECT COALESCE(jsonb_agg(tx_row), '[]'::jsonb) INTO v_transactions
    FROM (
        SELECT
            et.id,
            et.meter_number,
            et.disco_code,
            et.disco_code AS disco_name,
            et.amount_kobo,
            et.units_kwh,
            et.token,
            et.status,
            et.reference,
            et.created_at
        FROM public.electricity_transactions et
        WHERE et.user_id = v_case.customer_id
        ORDER BY et.created_at DESC
        LIMIT 10
    ) tx_row;

    -- 4. Customer Wallet History & Ledger
    SELECT jsonb_build_object(
        'wallet_id', w.id,
        'balance_kobo', COALESCE(w.balance_kobo, 0),
        'currency', COALESCE(w.currency, 'NGN'),
        'is_locked', COALESCE(w.is_locked, false),
        'recent_entries', (
            SELECT COALESCE(jsonb_agg(led_row), '[]'::jsonb)
            FROM (
                SELECT
                    wl.id,
                    wl.type,
                    wl.amount_kobo,
                    wl.balance_after_kobo,
                    wl.reference,
                    wl.description,
                    wl.created_at
                FROM public.wallet_transactions wl
                WHERE wl.wallet_id = w.id
                ORDER BY wl.created_at DESC
                LIMIT 10
            ) led_row
        )
    ) INTO v_wallet
    FROM public.wallet_accounts w
    WHERE w.user_id = v_case.customer_id;

    -- 5. Customer Inbound Payments
    SELECT COALESCE(jsonb_agg(pay_row), '[]'::jsonb) INTO v_payments
    FROM (
        SELECT
            pa.id,
            pa.amount_kobo,
            pa.provider,
            pa.status,
            pa.reference,
            pa.created_at,
            pa.updated_at AS verified_at
        FROM public.payment_attempts pa
        WHERE pa.user_id = v_case.customer_id
        ORDER BY pa.created_at DESC
        LIMIT 10
    ) pay_row;

    -- 6. Case Notes (Customer-visible and Internal Notes)
    SELECT COALESCE(jsonb_agg(note_row), '[]'::jsonb) INTO v_notes
    FROM (
        SELECT
            scn.id,
            scn.case_id,
            scn.author_user_id,
            p.full_name AS author_name,
            p.email AS author_email,
            r.display_name AS author_role,
            scn.is_internal,
            scn.note,
            scn.created_at
        FROM public.support_case_notes scn
        LEFT JOIN public.profiles p ON p.id = scn.author_user_id
        LEFT JOIN public.staff_members sm ON sm.user_id = scn.author_user_id
        LEFT JOIN public.roles r ON r.id = sm.role_id
        WHERE scn.case_id = p_case_id
        ORDER BY scn.created_at ASC
    ) note_row;

    RETURN jsonb_build_object(
        'success', true,
        'case', row_to_json(v_case),
        'customer', v_customer,
        'meters', v_meters,
        'transactions', v_transactions,
        'wallet', v_wallet,
        'payments', v_payments,
        'notes', v_notes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. admin_create_support_case: Create new support case with audit log
CREATE OR REPLACE FUNCTION public.admin_create_support_case(
    p_customer_id UUID,
    p_category VARCHAR(64),
    p_priority VARCHAR(32),
    p_subject VARCHAR(255),
    p_description TEXT,
    p_assigned_staff_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_case_id UUID;
    v_case_number TEXT;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'support.manage') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks support.manage permission.';
    END IF;

    -- Generate human-readable case number: CASE-YYYYMMDD-XXXX
    v_case_number := 'CASE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    INSERT INTO public.support_cases (
        case_number,
        customer_id,
        category,
        priority,
        status,
        assigned_staff_id,
        subject,
        description,
        created_by_user_id,
        created_at,
        updated_at
    ) VALUES (
        v_case_number,
        p_customer_id,
        p_category,
        COALESCE(p_priority, 'MEDIUM'),
        'OPEN',
        p_assigned_staff_id,
        p_subject,
        p_description,
        v_caller_id,
        NOW(),
        NOW()
    ) RETURNING id INTO v_case_id;

    -- If created with an assigned staff, record initial note
    IF p_assigned_staff_id IS NOT NULL THEN
        INSERT INTO public.support_case_notes (
            case_id,
            author_user_id,
            is_internal,
            note,
            created_at
        ) VALUES (
            v_case_id,
            v_caller_id,
            TRUE,
            'Case created and assigned to staff upon opening.',
            NOW()
        );
    END IF;

    -- Audit trail
    PERFORM public.log_audit_event(
        v_caller_id,
        'SUPPORT_CASE_CREATED',
        'SUPPORT_CASE',
        v_case_id::TEXT,
        jsonb_build_object(
            'case_number', v_case_number,
            'customer_id', p_customer_id,
            'category', p_category,
            'priority', p_priority,
            'assigned_staff_id', p_assigned_staff_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'case_id', v_case_id,
        'case_number', v_case_number
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. admin_update_support_case_status: Update ticket status with resolution timestamps
CREATE OR REPLACE FUNCTION public.admin_update_support_case_status(
    p_case_id UUID,
    p_status VARCHAR(32),
    p_resolution_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_prev_status VARCHAR(32);
BEGIN
    IF NOT public.has_permission(v_caller_id, 'support.manage') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks support.manage permission.';
    END IF;

    SELECT status INTO v_prev_status
    FROM public.support_cases
    WHERE id = p_case_id;

    IF v_prev_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CASE_NOT_FOUND');
    END IF;

    UPDATE public.support_cases
    SET
        status = p_status,
        resolution_notes = COALESCE(p_resolution_notes, resolution_notes),
        resolved_at = CASE WHEN p_status = 'RESOLVED' AND resolved_at IS NULL THEN NOW() ELSE resolved_at END,
        closed_at = CASE WHEN p_status = 'CLOSED' AND closed_at IS NULL THEN NOW() ELSE closed_at END,
        updated_at = NOW()
    WHERE id = p_case_id;

    -- Record status change note
    INSERT INTO public.support_case_notes (
        case_id,
        author_user_id,
        is_internal,
        note,
        created_at
    ) VALUES (
        p_case_id,
        v_caller_id,
        FALSE,
        'Status updated from ' || v_prev_status || ' to ' || p_status || CASE WHEN p_resolution_notes IS NOT NULL THEN E'\nResolution: ' || p_resolution_notes ELSE '' END,
        NOW()
    );

    -- Audit trail
    PERFORM public.log_audit_event(
        v_caller_id,
        'SUPPORT_CASE_STATUS_CHANGED',
        'SUPPORT_CASE',
        p_case_id::TEXT,
        jsonb_build_object(
            'from_status', v_prev_status,
            'to_status', p_status,
            'resolution_notes', p_resolution_notes
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'case_id', p_case_id,
        'status', p_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- E. admin_assign_support_case: Assign ticket to authorized staff
CREATE OR REPLACE FUNCTION public.admin_assign_support_case(
    p_case_id UUID,
    p_staff_id UUID,
    p_assignment_note TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_staff_name TEXT;
    v_staff_role TEXT;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'support.manage') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks support.manage permission.';
    END IF;

    IF p_staff_id IS NOT NULL THEN
        SELECT p.full_name, r.display_name INTO v_staff_name, v_staff_role
        FROM public.staff_members sm
        JOIN public.profiles p ON p.id = sm.user_id
        JOIN public.roles r ON r.id = sm.role_id
        WHERE sm.id = p_staff_id AND sm.status = 'ACTIVE';

        IF v_staff_name IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND_OR_INACTIVE');
        END IF;
    ELSE
        v_staff_name := 'Unassigned';
    END IF;

    UPDATE public.support_cases
    SET
        assigned_staff_id = p_staff_id,
        updated_at = NOW()
    WHERE id = p_case_id;

    -- Add internal assignment note
    INSERT INTO public.support_case_notes (
        case_id,
        author_user_id,
        is_internal,
        note,
        created_at
    ) VALUES (
        p_case_id,
        v_caller_id,
        TRUE,
        'Case assigned to ' || v_staff_name || CASE WHEN v_staff_role IS NOT NULL THEN ' (' || v_staff_role || ')' ELSE '' END || CASE WHEN p_assignment_note IS NOT NULL THEN E'\nNote: ' || p_assignment_note ELSE '' END,
        NOW()
    );

    -- Audit trail
    PERFORM public.log_audit_event(
        v_caller_id,
        'SUPPORT_CASE_ASSIGNED',
        'SUPPORT_CASE',
        p_case_id::TEXT,
        jsonb_build_object(
            'assigned_staff_id', p_staff_id,
            'assigned_staff_name', v_staff_name,
            'note', p_assignment_note
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'case_id', p_case_id,
        'assigned_staff_id', p_staff_id,
        'assigned_staff_name', v_staff_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- F. admin_escalate_support_case: Escalate case to Operations, Finance, or Manager
CREATE OR REPLACE FUNCTION public.admin_escalate_support_case(
    p_case_id UUID,
    p_escalate_to VARCHAR(64),
    p_escalation_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
BEGIN
    IF NOT public.has_permission(v_caller_id, 'support.manage') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks support.manage permission.';
    END IF;

    IF p_escalate_to NOT IN ('OPERATIONS', 'FINANCE', 'MANAGER') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_ESCALATION_DEPARTMENT');
    END IF;

    UPDATE public.support_cases
    SET
        escalated_to_department = p_escalate_to,
        status = CASE WHEN status = 'OPEN' THEN 'IN_PROGRESS' ELSE status END,
        updated_at = NOW()
    WHERE id = p_case_id;

    -- Add internal escalation note
    INSERT INTO public.support_case_notes (
        case_id,
        author_user_id,
        is_internal,
        note,
        created_at
    ) VALUES (
        p_case_id,
        v_caller_id,
        TRUE,
        '🚨 Escalated to ' || p_escalate_to || ' department.' || E'\nReason: ' || p_escalation_reason,
        NOW()
    );

    -- Audit trail
    PERFORM public.log_audit_event(
        v_caller_id,
        'SUPPORT_CASE_ESCALATED',
        'SUPPORT_CASE',
        p_case_id::TEXT,
        jsonb_build_object(
            'escalated_to_department', p_escalate_to,
            'reason', p_escalation_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'case_id', p_case_id,
        'escalated_to_department', p_escalate_to
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- G. admin_add_support_case_note: Post internal or customer-visible note
CREATE OR REPLACE FUNCTION public.admin_add_support_case_note(
    p_case_id UUID,
    p_note TEXT,
    p_is_internal BOOLEAN DEFAULT TRUE
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_note_id UUID;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'support.manage') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks support.manage permission.';
    END IF;

    INSERT INTO public.support_case_notes (
        case_id,
        author_user_id,
        is_internal,
        note,
        created_at
    ) VALUES (
        p_case_id,
        v_caller_id,
        COALESCE(p_is_internal, TRUE),
        p_note,
        NOW()
    ) RETURNING id INTO v_note_id;

    UPDATE public.support_cases
    SET updated_at = NOW()
    WHERE id = p_case_id;

    -- Audit trail
    PERFORM public.log_audit_event(
        v_caller_id,
        'SUPPORT_CASE_NOTE_ADDED',
        'SUPPORT_CASE',
        p_case_id::TEXT,
        jsonb_build_object(
            'note_id', v_note_id,
            'is_internal', p_is_internal
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'note_id', v_note_id,
        'case_id', p_case_id,
        'is_internal', p_is_internal
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
