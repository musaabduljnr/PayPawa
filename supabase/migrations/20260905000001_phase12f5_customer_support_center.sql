-- ============================================================================
-- PAYPAWA: PHASE 12F.5 DATABASE MIGRATION
-- Customer Support Center Integration, Customer RLS, Ticket RPCs & FAQs
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- 1. EXTEND SUPPORT CASES TABLE
-- ----------------------------------------------------------------------------
ALTER TABLE public.support_cases
    ADD COLUMN IF NOT EXISTS related_meter_id UUID REFERENCES public.meters(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS related_wallet_tx_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS related_electricity_tx_id UUID REFERENCES public.electricity_transactions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS internal_reference VARCHAR(64),
    ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(128),
    ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS customer_last_read_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS staff_last_read_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes on new reference columns
CREATE INDEX IF NOT EXISTS idx_support_cases_meter ON public.support_cases(related_meter_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_internal_ref ON public.support_cases(internal_reference);
CREATE INDEX IF NOT EXISTS idx_support_cases_provider_ref ON public.support_cases(provider_reference);

-- Broaden category check constraint safely
DO $$
BEGIN
    ALTER TABLE public.support_cases DROP CONSTRAINT IF EXISTS support_cases_category_check;
    ALTER TABLE public.support_cases ADD CONSTRAINT support_cases_category_check CHECK (
        category IN (
            'FAILED_PURCHASE',
            'WALLET_FUNDING',
            'MISSING_TOKEN',
            'METER_VALIDATION',
            'INCORRECT_DEBIT',
            'DUPLICATE_DEBIT',
            'APP_LOGIN_SECURITY',
            'RECEIPT_REQUEST',
            'DISCO_DOWNTIME',
            'REFUND_REQUEST',
            'ACCOUNT_SETTINGS',
            'TARIFF_QUERY',
            'METER_REPLACEMENT',
            'GENERAL_INQUIRY',
            'WALLET',
            'PAYMENT',
            'ELECTRICITY_PURCHASE',
            'METER',
            'ACCOUNT',
            'TECHNICAL',
            'OTHER',
            'FAILED_TRANSACTION',
            'PENDING_TRANSACTION',
            'REFUND_REVERSAL',
            'INCORRECT_BALANCE',
            'METER_REGISTRATION',
            'METER_VERIFICATION',
            'CONSUMPTION_ANALYTICS',
            'NOTIFICATIONS',
            'ACCOUNT_SECURITY',
            'APP_BUG',
            'GENERAL_ENQUIRY'
        )
    );
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Broaden status check constraint safely
DO $$
BEGIN
    ALTER TABLE public.support_cases DROP CONSTRAINT IF EXISTS support_cases_status_check;
    ALTER TABLE public.support_cases ADD CONSTRAINT support_cases_status_check CHECK (
        status IN (
            'OPEN',
            'ASSIGNED',
            'IN_PROGRESS',
            'WAITING',
            'WAITING_FOR_CUSTOMER',
            'RESOLVED',
            'CLOSED'
        )
    );
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 2. EXTEND SUPPORT CASE NOTES TABLE
-- ----------------------------------------------------------------------------
ALTER TABLE public.support_case_notes
    ADD COLUMN IF NOT EXISTS read_by_customer_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS read_by_staff_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_support_case_notes_unread_customer
    ON public.support_case_notes(case_id, is_internal, read_by_customer_at);

-- 3. CREATE SUPPORT FAQS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(64) NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_faqs_category ON public.support_faqs(category, display_order ASC);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.support_faqs ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read published FAQs
DROP POLICY IF EXISTS "Anyone can view published FAQs" ON public.support_faqs;
CREATE POLICY "Anyone can view published FAQs"
    ON public.support_faqs FOR SELECT
    TO public
    USING (is_published = TRUE);

-- Staff can manage FAQs
DROP POLICY IF EXISTS "Staff can manage FAQs" ON public.support_faqs;
CREATE POLICY "Staff can manage FAQs"
    ON public.support_faqs FOR ALL
    TO authenticated
    USING (public.has_permission(auth.uid(), 'support.manage'));

-- Customers can view their own support cases
DROP POLICY IF EXISTS "Customers can view their own support cases" ON public.support_cases;
CREATE POLICY "Customers can view their own support cases"
    ON public.support_cases FOR SELECT
    TO authenticated
    USING (auth.uid() = customer_id);

-- Customers can create their own tickets
DROP POLICY IF EXISTS "Customers can create support cases" ON public.support_cases;
CREATE POLICY "Customers can create support cases"
    ON public.support_cases FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = customer_id);

-- Customers can update their own tickets (close, reopen, or mark read)
DROP POLICY IF EXISTS "Customers can update their own support cases" ON public.support_cases;
CREATE POLICY "Customers can update their own support cases"
    ON public.support_cases FOR UPDATE
    TO authenticated
    USING (auth.uid() = customer_id)
    WITH CHECK (auth.uid() = customer_id);

-- Customers can only view non-internal notes on their own support cases
DROP POLICY IF EXISTS "Customers can only view non-internal notes" ON public.support_case_notes;
CREATE POLICY "Customers can only view non-internal notes"
    ON public.support_case_notes FOR SELECT
    TO authenticated
    USING (
        is_internal = FALSE
        AND EXISTS (
            SELECT 1 FROM public.support_cases sc
            WHERE sc.id = case_id AND sc.customer_id = auth.uid()
        )
    );

-- Customers can insert messages/notes to their own tickets (must NOT be internal notes)
DROP POLICY IF EXISTS "Customers can create customer notes" ON public.support_case_notes;
CREATE POLICY "Customers can create customer notes"
    ON public.support_case_notes FOR INSERT
    TO authenticated
    WITH CHECK (
        is_internal = FALSE
        AND author_user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.support_cases sc
            WHERE sc.id = case_id AND sc.customer_id = auth.uid()
        )
    );

-- 5. STORED PROCEDURES & RPCS FOR CUSTOMER SUPPORT
-- ----------------------------------------------------------------------------

-- A. customer_create_support_ticket
CREATE OR REPLACE FUNCTION public.customer_create_support_ticket(
    p_category VARCHAR(64),
    p_subject VARCHAR(255),
    p_description TEXT,
    p_priority VARCHAR(32) DEFAULT 'MEDIUM',
    p_related_meter_id UUID DEFAULT NULL,
    p_related_wallet_tx_id UUID DEFAULT NULL,
    p_related_electricity_tx_id UUID DEFAULT NULL,
    p_internal_reference VARCHAR(64) DEFAULT NULL,
    p_provider_reference VARCHAR(128) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_id UUID := auth.uid();
    v_case_id UUID;
    v_case_number VARCHAR(32);
    v_priority VARCHAR(32) := UPPER(COALESCE(p_priority, 'MEDIUM'));
    v_category VARCHAR(64) := UPPER(p_category);
    v_year_day VARCHAR(10);
    v_random_suffix VARCHAR(6);
BEGIN
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User must be signed in to submit a ticket.';
    END IF;

    IF p_subject IS NULL OR LENGTH(TRIM(p_subject)) = 0 THEN
        RAISE EXCEPTION 'Validation error: Subject is required.';
    END IF;

    IF p_description IS NULL OR LENGTH(TRIM(p_description)) = 0 THEN
        RAISE EXCEPTION 'Validation error: Description is required.';
    END IF;

    IF v_priority NOT IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT') THEN
        v_priority := 'MEDIUM';
    END IF;

    -- Generate unique human-readable case number: CASE-YYYYMMDD-XXXX
    v_year_day := TO_CHAR(NOW(), 'YYYYMMDD');
    v_random_suffix := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    v_case_number := 'CASE-' || v_year_day || '-' || v_random_suffix;

    -- Insert case row
    INSERT INTO public.support_cases (
        case_number,
        customer_id,
        category,
        priority,
        status,
        subject,
        description,
        related_meter_id,
        related_wallet_tx_id,
        related_electricity_tx_id,
        internal_reference,
        provider_reference,
        created_by_user_id,
        created_at,
        updated_at
    ) VALUES (
        v_case_number,
        v_customer_id,
        v_category,
        v_priority,
        'OPEN',
        TRIM(p_subject),
        TRIM(p_description),
        p_related_meter_id,
        p_related_wallet_tx_id,
        p_related_electricity_tx_id,
        p_internal_reference,
        p_provider_reference,
        v_customer_id,
        NOW(),
        NOW()
    ) RETURNING id INTO v_case_id;

    -- Insert initial customer message in support_case_notes
    INSERT INTO public.support_case_notes (
        case_id,
        author_user_id,
        is_internal,
        note,
        created_at
    ) VALUES (
        v_case_id,
        v_customer_id,
        FALSE,
        TRIM(p_description),
        NOW()
    );

    -- Log action to immutable audit_logs
    INSERT INTO public.audit_logs (
        actor_user_id,
        action,
        target_type,
        target_id,
        result,
        metadata
    ) VALUES (
        v_customer_id,
        'CUSTOMER_TICKET_CREATED',
        'support_cases',
        v_case_id::TEXT,
        'SUCCESS',
        jsonb_build_object(
            'case_number', v_case_number,
            'category', v_category,
            'priority', v_priority,
            'subject', p_subject
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', v_case_id,
        'case_number', v_case_number
    );
END;
$$;

-- B. customer_reply_to_ticket
CREATE OR REPLACE FUNCTION public.customer_reply_to_ticket(
    p_ticket_id UUID,
    p_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_id UUID := auth.uid();
    v_case public.support_cases%ROWTYPE;
    v_note_id UUID;
    v_new_status VARCHAR(32);
BEGIN
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User must be signed in.';
    END IF;

    IF p_message IS NULL OR LENGTH(TRIM(p_message)) = 0 THEN
        RAISE EXCEPTION 'Validation error: Message text cannot be blank.';
    END IF;

    SELECT * INTO v_case
    FROM public.support_cases
    WHERE id = p_ticket_id AND customer_id = v_customer_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found or access denied.';
    END IF;

    -- If ticket was closed or resolved, customer replying automatically shifts it to WAITING (waiting for agent)
    IF v_case.status IN ('RESOLVED', 'CLOSED') THEN
        v_new_status := 'OPEN';
    ELSE
        v_new_status := v_case.status;
    END IF;

    -- Insert message
    INSERT INTO public.support_case_notes (
        case_id,
        author_user_id,
        is_internal,
        note,
        created_at
    ) VALUES (
        p_ticket_id,
        v_customer_id,
        FALSE,
        TRIM(p_message),
        NOW()
    ) RETURNING id INTO v_note_id;

    -- Update ticket timestamp and status
    UPDATE public.support_cases
    SET
        status = v_new_status,
        updated_at = NOW(),
        customer_last_read_at = NOW()
    WHERE id = p_ticket_id;

    -- Log to audit_logs
    INSERT INTO public.audit_logs (
        actor_user_id,
        action,
        target_type,
        target_id,
        result,
        metadata
    ) VALUES (
        v_customer_id,
        'CUSTOMER_TICKET_REPLY',
        'support_cases',
        p_ticket_id::TEXT,
        'SUCCESS',
        jsonb_build_object(
            'case_number', v_case.case_number,
            'note_id', v_note_id
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'note_id', v_note_id,
        'status', v_new_status
    );
END;
$$;

-- C. customer_close_ticket
CREATE OR REPLACE FUNCTION public.customer_close_ticket(
    p_ticket_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_id UUID := auth.uid();
    v_case public.support_cases%ROWTYPE;
BEGIN
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    SELECT * INTO v_case
    FROM public.support_cases
    WHERE id = p_ticket_id AND customer_id = v_customer_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found or access denied.';
    END IF;

    UPDATE public.support_cases
    SET
        status = 'CLOSED',
        closed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO public.audit_logs (
        actor_user_id,
        action,
        target_type,
        target_id,
        result,
        metadata
    ) VALUES (
        v_customer_id,
        'CUSTOMER_TICKET_CLOSED',
        'support_cases',
        p_ticket_id::TEXT,
        'SUCCESS',
        jsonb_build_object('case_number', v_case.case_number)
    );

    RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- D. customer_reopen_ticket
CREATE OR REPLACE FUNCTION public.customer_reopen_ticket(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_id UUID := auth.uid();
    v_case public.support_cases%ROWTYPE;
BEGIN
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    SELECT * INTO v_case
    FROM public.support_cases
    WHERE id = p_ticket_id AND customer_id = v_customer_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found or access denied.';
    END IF;

    UPDATE public.support_cases
    SET
        status = 'OPEN',
        reopened_at = NOW(),
        updated_at = NOW()
    WHERE id = p_ticket_id;

    IF p_reason IS NOT NULL AND LENGTH(TRIM(p_reason)) > 0 THEN
        INSERT INTO public.support_case_notes (
            case_id,
            author_user_id,
            is_internal,
            note,
            created_at
        ) VALUES (
            p_ticket_id,
            v_customer_id,
            FALSE,
            'Ticket Reopened: ' || TRIM(p_reason),
            NOW()
        );
    END IF;

    INSERT INTO public.audit_logs (
        actor_user_id,
        action,
        target_type,
        target_id,
        result,
        metadata
    ) VALUES (
        v_customer_id,
        'CUSTOMER_TICKET_REOPENED',
        'support_cases',
        p_ticket_id::TEXT,
        'SUCCESS',
        jsonb_build_object('case_number', v_case.case_number, 'reason', p_reason)
    );

    RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- E. customer_get_unread_support_count
CREATE OR REPLACE FUNCTION public.customer_get_unread_support_count()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_id UUID := auth.uid();
    v_count INT := 0;
BEGIN
    IF v_customer_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT COUNT(scn.id) INTO v_count
    FROM public.support_case_notes scn
    JOIN public.support_cases sc ON sc.id = scn.case_id
    WHERE sc.customer_id = v_customer_id
      AND scn.is_internal = FALSE
      AND scn.author_user_id <> v_customer_id
      AND scn.read_by_customer_at IS NULL;

    RETURN v_count;
END;
$$;

-- F. customer_mark_ticket_read
CREATE OR REPLACE FUNCTION public.customer_mark_ticket_read(
    p_ticket_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_id UUID := auth.uid();
BEGIN
    IF v_customer_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Unauthenticated');
    END IF;

    -- Update read timestamp on messages
    UPDATE public.support_case_notes
    SET read_by_customer_at = NOW()
    WHERE case_id = p_ticket_id
      AND is_internal = FALSE
      AND author_user_id <> v_customer_id
      AND read_by_customer_at IS NULL;

    -- Update ticket customer_last_read_at
    UPDATE public.support_cases
    SET customer_last_read_at = NOW()
    WHERE id = p_ticket_id AND customer_id = v_customer_id;

    RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- 6. NOTIFICATION TRIGGER FOR AGENT REPLIES
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_customer_on_support_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_case public.support_cases%ROWTYPE;
BEGIN
    -- Only trigger if this is a customer-visible note and NOT written by the customer
    IF NEW.is_internal = FALSE THEN
        SELECT * INTO v_case FROM public.support_cases WHERE id = NEW.case_id;

        IF FOUND AND v_case.customer_id <> NEW.author_user_id THEN
            INSERT INTO public.notifications (
                user_id,
                title,
                body,
                type,
                severity,
                data
            ) VALUES (
                v_case.customer_id,
                'Support Reply: ' || v_case.case_number,
                SUBSTRING(NEW.note FROM 1 FOR 140),
                'support_reply',
                'info',
                jsonb_build_object(
                    'ticket_id', v_case.id,
                    'case_number', v_case.case_number,
                    'category', v_case.category,
                    'action_url', '/support/' || v_case.id::TEXT
                )
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_note_customer_notification ON public.support_case_notes;
CREATE TRIGGER trg_support_note_customer_notification
    AFTER INSERT ON public.support_case_notes
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_notify_customer_on_support_reply();

-- 7. SEED ACCURATE INITIAL FAQS
-- ----------------------------------------------------------------------------
INSERT INTO public.support_faqs (category, question, answer, display_order)
VALUES
    (
        'ELECTRICITY_PURCHASE',
        'How long does it take to receive my electricity token?',
        'Tokens are vended instantly via our secure gateway. Once your payment is approved, your 20-digit token is generated and displayed on your screen, accompanied by an instant push notification and utility receipt.',
        1
    ),
    (
        'ELECTRICITY_PURCHASE',
        'What should I do if my token shows as Pending or Missing?',
        'If a token does not generate immediately, check your Transaction History. If the status says Pending, our gateway reconciliation engine automatically polls the provider every 60 seconds. You can also tap "Report Issue" directly from the transaction card.',
        2
    ),
    (
        'WALLET',
        'How do I fund my PayPawa wallet?',
        'Navigate to Wallet > Fund Wallet, enter the amount (minimum ₦500), and choose your preferred method: Card, Direct Bank Transfer, or USSD code via our secure Paystack checkout portal.',
        3
    ),
    (
        'WALLET',
        'My bank was debited but my wallet was not credited. What happened?',
        'Bank transfers typically settle within seconds, but occasionally banking switches experience intermittent delays. Our automated webhook reconciles credits as soon as payment clears. If your wallet is uncredited after 15 minutes, tap "Report Issue" to open a ticket with your transaction reference.',
        4
    ),
    (
        'METER',
        'Why does meter verification fail when adding my meter?',
        'Meter verification connects directly to your regional DISCO database. Verification can fail if the 11-digit meter number is mistyped, the incorrect DISCO is selected, or if a newly installed meter has not yet been registered on the national grid.',
        5
    ),
    (
        'ACCOUNT',
        'How do I request account deletion or data erasure?',
        'Under Profile > Personal Info & Security, tap "Request Account Deletion". You will be asked to confirm by typing DELETE. Your profile, registered meters, and alerts will be permanently erased in compliance with privacy regulations.',
        6
    )
ON CONFLICT DO NOTHING;
