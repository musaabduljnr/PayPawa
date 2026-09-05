-- ============================================================================
-- PAYPAWA: PHASE 10B DATABASE MIGRATION
-- Customer, Meter & Transaction Operations Center Stored Procedures & RLS
-- Framework: Supabase / PostgreSQL 15+
-- ============================================================================

-- 1. RLS POLICIES FOR OPERATIONAL STAFF
-- ----------------------------------------------------------------------------

-- A. Profiles: Staff with 'users.view' can view customer profiles
DROP POLICY IF EXISTS "Staff can view customer profiles" ON public.profiles;
CREATE POLICY "Staff can view customer profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (public.has_permission(auth.uid(), 'users.view') OR auth.uid() = id);

-- B. Meters: Staff with 'meters.view' can view all meters
DROP POLICY IF EXISTS "Staff can view all meters" ON public.meters;
CREATE POLICY "Staff can view all meters"
    ON public.meters FOR SELECT
    TO authenticated
    USING (public.has_permission(auth.uid(), 'meters.view') OR auth.uid() = user_id);

-- C. Electricity Transactions: Staff with 'transactions.view' can view all transactions
DROP POLICY IF EXISTS "Staff can view all electricity transactions" ON public.electricity_transactions;
CREATE POLICY "Staff can view all electricity transactions"
    ON public.electricity_transactions FOR SELECT
    TO authenticated
    USING (public.has_permission(auth.uid(), 'transactions.view') OR auth.uid() = user_id);

-- D. Wallet Accounts: Staff with 'wallets.view' can view customer wallets
DROP POLICY IF EXISTS "Staff can view customer wallets" ON public.wallet_accounts;
CREATE POLICY "Staff can view customer wallets"
    ON public.wallet_accounts FOR SELECT
    TO authenticated
    USING (public.has_permission(auth.uid(), 'wallets.view') OR auth.uid() = user_id);

-- 2. OPERATIONAL STORED PROCEDURES (RPCs)
-- ----------------------------------------------------------------------------

-- A. admin_list_customers: Search, filter, and paginate customer directory
CREATE OR REPLACE FUNCTION public.admin_list_customers(
    p_search TEXT DEFAULT NULL,
    p_account_type TEXT DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_total_count INT := 0;
    v_customers JSONB;
BEGIN
    -- Authoritative server-side permission check
    IF NOT public.has_permission(v_caller_id, 'users.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks users.view permission.';
    END IF;

    -- Compute total matching count
    SELECT COUNT(*) INTO v_total_count
    FROM public.profiles p
    WHERE (p_account_type IS NULL OR p_account_type = 'ALL' OR p.account_type = p_account_type)
      AND (
          p_search IS NULL OR p_search = '' OR
          p.full_name ILIKE '%' || p_search || '%' OR
          p.email ILIKE '%' || p_search || '%' OR
          p.phone ILIKE '%' || p_search || '%' OR
          p.id::TEXT ILIKE '%' || p_search || '%'
      );

    -- Fetch paginated results with joined aggregations
    SELECT COALESCE(jsonb_agg(cust_row), '[]'::jsonb) INTO v_customers
    FROM (
        SELECT
            p.id,
            p.full_name,
            p.email,
            p.phone,
            p.account_type,
            p.is_onboarded,
            p.created_at,
            p.updated_at,
            (SELECT COUNT(*) FROM public.meters m WHERE m.user_id = p.id) AS meters_count,
            (SELECT COUNT(*) FROM public.electricity_transactions et WHERE et.user_id = p.id) AS transactions_count,
            (SELECT COALESCE(w.balance_kobo, 0) FROM public.wallet_accounts w WHERE w.user_id = p.id LIMIT 1) AS wallet_balance_kobo
        FROM public.profiles p
        WHERE (p_account_type IS NULL OR p_account_type = 'ALL' OR p.account_type = p_account_type)
          AND (
              p_search IS NULL OR p_search = '' OR
              p.full_name ILIKE '%' || p_search || '%' OR
              p.email ILIKE '%' || p_search || '%' OR
              p.phone ILIKE '%' || p_search || '%' OR
              p.id::TEXT ILIKE '%' || p_search || '%'
          )
        ORDER BY p.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) cust_row;

    RETURN jsonb_build_object(
        'total', v_total_count,
        'limit', p_limit,
        'offset', p_offset,
        'data', v_customers
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. admin_list_meters: Search, filter by DisCo, and paginate meters
CREATE OR REPLACE FUNCTION public.admin_list_meters(
    p_search TEXT DEFAULT NULL,
    p_disco TEXT DEFAULT NULL,
    p_meter_type TEXT DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_total_count INT := 0;
    v_meters JSONB;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'meters.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks meters.view permission.';
    END IF;

    SELECT COUNT(*) INTO v_total_count
    FROM public.meters m
    LEFT JOIN public.profiles p ON p.id = m.user_id
    WHERE (p_disco IS NULL OR p_disco = 'ALL' OR m.disco_code ILIKE p_disco OR m.disco_name ILIKE '%' || p_disco || '%')
      AND (p_meter_type IS NULL OR p_meter_type = 'ALL' OR m.meter_type = p_meter_type)
      AND (
          p_search IS NULL OR p_search = '' OR
          m.meter_number ILIKE '%' || p_search || '%' OR
          m.customer_name ILIKE '%' || p_search || '%' OR
          m.nickname ILIKE '%' || p_search || '%' OR
          p.full_name ILIKE '%' || p_search || '%' OR
          p.email ILIKE '%' || p_search || '%'
      );

    SELECT COALESCE(jsonb_agg(meter_row), '[]'::jsonb) INTO v_meters
    FROM (
        SELECT
            m.id,
            m.user_id,
            m.meter_number,
            m.disco_code,
            m.disco_name,
            m.meter_type,
            m.nickname,
            m.customer_name,
            m.address,
            m.is_active,
            m.created_at,
            p.full_name AS owner_name,
            p.email AS owner_email,
            (SELECT COUNT(*) FROM public.electricity_transactions et WHERE et.meter_id = m.id OR et.meter_number = m.meter_number) AS total_purchases
        FROM public.meters m
        LEFT JOIN public.profiles p ON p.id = m.user_id
        WHERE (p_disco IS NULL OR p_disco = 'ALL' OR m.disco_code ILIKE p_disco OR m.disco_name ILIKE '%' || p_disco || '%')
          AND (p_meter_type IS NULL OR p_meter_type = 'ALL' OR m.meter_type = p_meter_type)
          AND (
              p_search IS NULL OR p_search = '' OR
              m.meter_number ILIKE '%' || p_search || '%' OR
              m.customer_name ILIKE '%' || p_search || '%' OR
              m.nickname ILIKE '%' || p_search || '%' OR
              p.full_name ILIKE '%' || p_search || '%' OR
              p.email ILIKE '%' || p_search || '%'
          )
        ORDER BY m.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) meter_row;

    RETURN jsonb_build_object(
        'total', v_total_count,
        'limit', p_limit,
        'offset', p_offset,
        'data', v_meters
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. admin_list_transactions: Search, filter by status/date/provider, and paginate transactions
CREATE OR REPLACE FUNCTION public.admin_list_transactions(
    p_search TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_provider TEXT DEFAULT NULL,
    p_from_date TIMESTAMPTZ DEFAULT NULL,
    p_to_date TIMESTAMPTZ DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_total_count INT := 0;
    v_transactions JSONB;
BEGIN
    IF NOT public.has_permission(v_caller_id, 'transactions.view') AND current_setting('role', true) <> 'service_role' AND current_setting('role', true) <> 'superuser' THEN
        RAISE EXCEPTION 'Unauthorized: Caller lacks transactions.view permission.';
    END IF;

    SELECT COUNT(*) INTO v_total_count
    FROM public.electricity_transactions et
    LEFT JOIN public.profiles p ON p.id = et.user_id
    WHERE (p_status IS NULL OR p_status = 'ALL' OR et.status = p_status)
      AND (p_provider IS NULL OR p_provider = 'ALL' OR et.provider_name ILIKE p_provider)
      AND (p_from_date IS NULL OR et.created_at >= p_from_date)
      AND (p_to_date IS NULL OR et.created_at <= p_to_date)
      AND (
          p_search IS NULL OR p_search = '' OR
          et.reference ILIKE '%' || p_search || '%' OR
          et.meter_number ILIKE '%' || p_search || '%' OR
          et.id::TEXT ILIKE '%' || p_search || '%' OR
          p.full_name ILIKE '%' || p_search || '%' OR
          p.email ILIKE '%' || p_search || '%'
      );

    SELECT COALESCE(jsonb_agg(tx_row), '[]'::jsonb) INTO v_transactions
    FROM (
        SELECT
            et.id,
            et.user_id,
            et.meter_id,
            et.meter_number,
            et.amount_kobo,
            et.service_fee_kobo,
            et.customer_charge_kobo,
            et.units_kwh,
            et.tariff_per_kwh_kobo,
            et.token,
            et.status,
            et.reference,
            et.idempotency_key,
            et.provider_name,
            et.provider_transaction_id,
            et.failure_code,
            et.failure_message,
            et.created_at,
            et.completed_at,
            p.full_name AS customer_name,
            p.email AS customer_email
        FROM public.electricity_transactions et
        LEFT JOIN public.profiles p ON p.id = et.user_id
        WHERE (p_status IS NULL OR p_status = 'ALL' OR et.status = p_status)
          AND (p_provider IS NULL OR p_provider = 'ALL' OR et.provider_name ILIKE p_provider)
          AND (p_from_date IS NULL OR et.created_at >= p_from_date)
          AND (p_to_date IS NULL OR et.created_at <= p_to_date)
          AND (
              p_search IS NULL OR p_search = '' OR
              et.reference ILIKE '%' || p_search || '%' OR
              et.meter_number ILIKE '%' || p_search || '%' OR
              et.id::TEXT ILIKE '%' || p_search || '%' OR
              p.full_name ILIKE '%' || p_search || '%' OR
              p.email ILIKE '%' || p_search || '%'
          )
        ORDER BY et.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) tx_row;

    RETURN jsonb_build_object(
        'total', v_total_count,
        'limit', p_limit,
        'offset', p_offset,
        'data', v_transactions
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
