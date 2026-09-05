-- ==============================================================================
-- PHASE 7: CONSUMPTION INTELLIGENCE ENGINE MIGRATION
-- ==============================================================================
-- 1. Create Controlled Data Source Enum
-- 2. Create consumption_events table
-- 3. Create meter_readings table
-- 4. Create consumption_analytics_snapshots table
-- 5. Create calculate_consumption_analytics stored procedure
-- 6. Create record_manual_meter_reading stored procedure
-- 7. Create backfill_consumption_events stored procedure
-- 8. Row Level Security & Indexes
-- ==============================================================================

-- 1. Controlled Data Source Classification
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_source_type') THEN
    CREATE TYPE data_source_type AS ENUM (
      'PROVIDER',
      'USER_REPORTED',
      'METER',
      'IOT',
      'ESTIMATED',
      'INFERRED',
      'UNAVAILABLE'
    );
  END IF;
END $$;

-- 2. Consumption Events Table
CREATE TABLE IF NOT EXISTS public.consumption_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meter_id uuid REFERENCES public.meters(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES public.electricity_transactions(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('PURCHASE', 'METER_READING', 'ESTIMATED_USAGE', 'ADJUSTMENT')),
  units numeric(12, 4),
  units_source data_source_type NOT NULL DEFAULT 'UNAVAILABLE',
  amount_kobo bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  confidence numeric(3, 2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0.00 AND confidence <= 1.00),
  occurred_at timestamptz NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast user/meter chronological aggregation
CREATE INDEX IF NOT EXISTS idx_consumption_events_user_occurred 
  ON public.consumption_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_events_meter_occurred 
  ON public.consumption_events(meter_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_events_tx_id 
  ON public.consumption_events(transaction_id);

-- 3. Meter Readings Table (Supports user-reported, manual, IoT & Smart Meter readings)
CREATE TABLE IF NOT EXISTS public.meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  reading_value numeric(12, 4) NOT NULL CHECK (reading_value >= 0),
  unit text NOT NULL DEFAULT 'kwh',
  reading_type text NOT NULL DEFAULT 'cumulative' CHECK (reading_type IN ('cumulative', 'interval', 'delta')),
  source data_source_type NOT NULL DEFAULT 'USER_REPORTED',
  is_anomalous boolean NOT NULL DEFAULT false,
  anomaly_reason text,
  recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meter_readings_meter_recorded 
  ON public.meter_readings(meter_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_meter_readings_user 
  ON public.meter_readings(user_id);

-- 4. Consumption Analytics Snapshots Table (Precomputed cache)
CREATE TABLE IF NOT EXISTS public.consumption_analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meter_id uuid REFERENCES public.meters(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('7d', '30d', '90d', '1y', 'all')),
  metrics jsonb NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  data_through timestamptz NOT NULL,
  version text NOT NULL DEFAULT 'v1',
  CONSTRAINT uq_user_meter_period UNIQUE (user_id, meter_id, period)
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_lookup 
  ON public.consumption_analytics_snapshots(user_id, meter_id, period);

-- ==============================================================================
-- 5. Stored Procedure: Record Manual Meter Reading
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.record_manual_meter_reading(
  p_user_id uuid,
  p_meter_id uuid,
  p_reading numeric,
  p_recorded_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_reading record;
  v_reading_id uuid;
  v_is_anomalous boolean := false;
  v_anomaly_reason text := null;
  v_consumed_kwh numeric := null;
BEGIN
  -- 1. Verify Meter Ownership
  IF NOT EXISTS (SELECT 1 FROM public.meters WHERE id = p_meter_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED_METER',
      'message', 'Meter does not belong to user.'
    );
  END IF;

  -- 2. Validation Checks
  IF p_reading < 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_READING',
      'message', 'Meter reading cannot be negative.'
    );
  END IF;

  IF p_recorded_at > (now() + interval '5 minutes') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FUTURE_TIMESTAMP',
      'message', 'Reading timestamp cannot be in the future.'
    );
  END IF;

  -- 3. Fetch Previous Reading for this meter
  SELECT * INTO v_last_reading
  FROM public.meter_readings
  WHERE meter_id = p_meter_id AND is_anomalous = false
  ORDER BY recorded_at DESC
  LIMIT 1;

  IF v_last_reading.id IS NOT NULL THEN
    IF p_reading < v_last_reading.reading_value THEN
      -- Drop in reading detected: mark anomalous without deleting or calculating negative consumption
      v_is_anomalous := true;
      v_anomaly_reason := 'Reading (' || p_reading || ') is lower than previous reading (' || v_last_reading.reading_value || '). Possible rollover or typo.';
    ELSIF (p_reading - v_last_reading.reading_value) > 5000 THEN
      -- Extreme jump detected (>5,000 kWh jump between readings)
      v_is_anomalous := true;
      v_anomaly_reason := 'Unusually large jump of ' || (p_reading - v_last_reading.reading_value) || ' kWh detected.';
    ELSE
      v_consumed_kwh := p_reading - v_last_reading.reading_value;
    END IF;
  END IF;

  -- 4. Insert Reading
  INSERT INTO public.meter_readings (
    user_id,
    meter_id,
    reading_value,
    unit,
    reading_type,
    source,
    is_anomalous,
    anomaly_reason,
    recorded_at
  ) VALUES (
    p_user_id,
    p_meter_id,
    p_reading,
    'kwh',
    'cumulative',
    'USER_REPORTED',
    v_is_anomalous,
    v_anomaly_reason,
    p_recorded_at
  )
  RETURNING id INTO v_reading_id;

  -- 5. If valid difference exists, record consumption event
  IF v_consumed_kwh IS NOT NULL AND v_consumed_kwh >= 0 THEN
    INSERT INTO public.consumption_events (
      user_id,
      meter_id,
      event_type,
      units,
      units_source,
      confidence,
      occurred_at,
      metadata
    ) VALUES (
      p_user_id,
      p_meter_id,
      'METER_READING',
      v_consumed_kwh,
      'USER_REPORTED',
      0.95,
      p_recorded_at,
      jsonb_build_object('meter_reading_id', v_reading_id, 'previous_reading', v_last_reading.reading_value, 'current_reading', p_reading)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reading_id', v_reading_id,
    'reading_value', p_reading,
    'is_anomalous', v_is_anomalous,
    'anomaly_reason', v_anomaly_reason,
    'delta_kwh', v_consumed_kwh
  );
END;
$$;

-- ==============================================================================
-- 6. Stored Procedure: Authoritative Consumption Analytics Calculation
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.calculate_consumption_analytics(
  p_user_id uuid,
  p_meter_id uuid DEFAULT NULL,
  p_period text DEFAULT '30d'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_days int := 30;
  v_now timestamptz := now();
  v_period_start timestamptz;
  v_prev_period_start timestamptz;
  v_tx_count int := 0;
  v_total_spend_kobo bigint := 0;
  v_prev_spend_kobo bigint := 0;
  v_total_units numeric := 0;
  v_units_available_count int := 0;
  v_spend_change_pct numeric := 0;
  v_spend_change_direction text := 'STABLE';
  v_intervals numeric[];
  v_avg_interval_days numeric := null;
  v_median_interval_days numeric := null;
  v_min_interval_days numeric := null;
  v_max_interval_days numeric := null;
  v_estimated_daily_units numeric := null;
  v_data_quality text := 'INSUFFICIENT';
  v_latest_tx record;
  v_prev_ts timestamptz;
  v_curr_ts timestamptz;
  v_diff_days numeric;
  v_sorted_intervals numeric[];
  v_int_len int;
  v_unit_source text := 'UNAVAILABLE';
  v_trend_classification text := 'INSUFFICIENT_DATA';
  v_days_remaining_range text := null;
  v_estimated_next_purchase_date text := null;
BEGIN
  -- 1. Determine period window
  IF p_period = '7d' THEN v_period_days := 7;
  ELSIF p_period = '30d' THEN v_period_days := 30;
  ELSIF p_period = '90d' THEN v_period_days := 90;
  ELSIF p_period = '1y' THEN v_period_days := 365;
  ELSE v_period_days := 30;
  END IF;

  v_period_start := v_now - (v_period_days || ' days')::interval;
  v_prev_period_start := v_period_start - (v_period_days || ' days')::interval;

  -- 2. Aggregate Current Period Spending & Authoritative Units from successful transactions
  SELECT 
    COUNT(*),
    COALESCE(SUM(amount_kobo), 0),
    COALESCE(SUM(units_kwh), 0),
    COUNT(units_kwh)
  INTO 
    v_tx_count,
    v_total_spend_kobo,
    v_total_units,
    v_units_available_count
  FROM public.electricity_transactions
  WHERE user_id = p_user_id
    AND status = 'successful'
    AND (p_meter_id IS NULL OR meter_id = p_meter_id)
    AND created_at >= v_period_start;

  -- 3. Aggregate Previous Period Spending for Period Comparison
  SELECT COALESCE(SUM(amount_kobo), 0)
  INTO v_prev_spend_kobo
  FROM public.electricity_transactions
  WHERE user_id = p_user_id
    AND status = 'successful'
    AND (p_meter_id IS NULL OR meter_id = p_meter_id)
    AND created_at >= v_prev_period_start
    AND created_at < v_period_start;

  -- 4. Calculate Period Spending Comparison with Safe Zero-Baseline
  IF v_prev_spend_kobo > 0 THEN
    v_spend_change_pct := ROUND(((v_total_spend_kobo - v_prev_spend_kobo)::numeric / v_prev_spend_kobo::numeric) * 100, 1);
    IF v_spend_change_pct > 3 THEN
      v_spend_change_direction := 'INCREASING';
    ELSIF v_spend_change_pct < -3 THEN
      v_spend_change_direction := 'DECREASING';
    ELSE
      v_spend_change_direction := 'STABLE';
    END IF;
  ELSE
    -- Zero baseline handled safely: No division by zero or Infinity%
    v_spend_change_pct := 0;
    v_spend_change_direction := 'INSUFFICIENT_DATA';
  END IF;

  -- 5. Calculate Purchase Intervals across ALL historical successful transactions for this meter
  v_intervals := ARRAY[]::numeric[];
  v_prev_ts := NULL;

  FOR v_curr_ts IN
    SELECT created_at 
    FROM public.electricity_transactions
    WHERE user_id = p_user_id
      AND status = 'successful'
      AND (p_meter_id IS NULL OR meter_id = p_meter_id)
    ORDER BY created_at ASC
  LOOP
    IF v_prev_ts IS NOT NULL THEN
      v_diff_days := ROUND(EXTRACT(EPOCH FROM (v_curr_ts - v_prev_ts)) / 86400.0, 1);
      IF v_diff_days > 0.05 THEN
        v_intervals := array_append(v_intervals, v_diff_days);
      END IF;
    END IF;
    v_prev_ts := v_curr_ts;
  END LOOP;

  -- 6. Interval Statistics (Mean, Median, Min, Max)
  v_int_len := array_length(v_intervals, 1);
  IF v_int_len IS NOT NULL AND v_int_len > 0 THEN
    -- Sort intervals for median
    SELECT array_agg(val ORDER BY val) INTO v_sorted_intervals FROM unnest(v_intervals) AS val;
    
    -- Mean
    SELECT ROUND(AVG(val), 1), MIN(val), MAX(val) 
    INTO v_avg_interval_days, v_min_interval_days, v_max_interval_days 
    FROM unnest(v_intervals) AS val;

    -- Median
    IF (v_int_len % 2) = 1 THEN
      v_median_interval_days := v_sorted_intervals[(v_int_len + 1) / 2];
    ELSE
      v_median_interval_days := ROUND((v_sorted_intervals[v_int_len / 2] + v_sorted_intervals[(v_int_len / 2) + 1]) / 2.0, 1);
    END IF;
  END IF;

  -- 7. Fetch Latest Successful Transaction
  SELECT * INTO v_latest_tx
  FROM public.electricity_transactions
  WHERE user_id = p_user_id
    AND status = 'successful'
    AND (p_meter_id IS NULL OR meter_id = p_meter_id)
  ORDER BY created_at DESC
  LIMIT 1;

  -- 8. Authoritative Unit Source & Daily Usage Estimation
  IF v_units_available_count > 0 AND v_total_units > 0 THEN
    v_unit_source := 'PROVIDER';
    v_estimated_daily_units := ROUND(v_total_units / v_period_days::numeric, 1);
  ELSE
    v_unit_source := 'UNAVAILABLE';
    v_estimated_daily_units := NULL;
  END IF;

  -- 9. Determine Data Quality Grade
  IF v_tx_count = 0 THEN
    v_data_quality := 'INSUFFICIENT';
    v_trend_classification := 'INSUFFICIENT_DATA';
  ELSIF v_tx_count = 1 THEN
    v_data_quality := 'LIMITED';
    v_trend_classification := 'INSUFFICIENT_DATA';
  ELSIF v_tx_count BETWEEN 2 AND 4 THEN
    v_data_quality := 'GOOD';
    v_trend_classification := v_spend_change_direction;
  ELSE
    v_data_quality := 'STRONG';
    v_trend_classification := v_spend_change_direction;
  END IF;

  -- 10. Estimated Days Remaining Range (Honest Range rather than false precision)
  IF v_median_interval_days IS NOT NULL AND v_latest_tx.id IS NOT NULL THEN
    DECLARE
      v_days_since_last numeric := ROUND(EXTRACT(EPOCH FROM (v_now - v_latest_tx.created_at)) / 86400.0, 1);
      v_expected_left numeric := v_median_interval_days - v_days_since_last;
      v_min_range int;
      v_max_range int;
    BEGIN
      IF v_expected_left > 0 THEN
        v_min_range := GREATEST(1, FLOOR(v_expected_left * 0.8)::int);
        v_max_range := GREATEST(v_min_range + 1, CEIL(v_expected_left * 1.2)::int);
        v_days_remaining_range := v_min_range || '–' || v_max_range || ' days';
        v_estimated_next_purchase_date := (v_latest_tx.created_at + (v_median_interval_days || ' days')::interval)::text;
      ELSE
        v_days_remaining_range := 'Recharge due soon';
        v_estimated_next_purchase_date := v_now::text;
      END IF;
    END;
  END IF;

  -- 11. Build and Return Structured JSON
  RETURN jsonb_build_object(
    'spending', jsonb_build_object(
      'current_period_spend_naira', ROUND(v_total_spend_kobo / 100.0, 2),
      'previous_period_spend_naira', ROUND(v_prev_spend_kobo / 100.0, 2),
      'percentage_change', v_spend_change_pct,
      'direction', v_spend_change_direction,
      'has_previous_baseline', (v_prev_spend_kobo > 0)
    ),
    'consumption', jsonb_build_object(
      'total_units_kwh', CASE WHEN v_units_available_count > 0 THEN v_total_units ELSE NULL END,
      'estimated_daily_units_kwh', v_estimated_daily_units,
      'unit_source', v_unit_source,
      'units_available_count', v_units_available_count
    ),
    'purchasing', jsonb_build_object(
      'total_purchases', v_tx_count,
      'average_interval_days', v_avg_interval_days,
      'median_interval_days', v_median_interval_days,
      'shortest_interval_days', v_min_interval_days,
      'longest_interval_days', v_max_interval_days,
      'purchase_velocity', CASE 
        WHEN v_median_interval_days IS NOT NULL THEN 'Every ~' || v_median_interval_days || ' days'
        ELSE 'Cadence calculating...'
      END
    ),
    'forecast', jsonb_build_object(
      'estimated_days_remaining_range', v_days_remaining_range,
      'estimated_next_purchase_date', v_estimated_next_purchase_date,
      'confidence', CASE 
        WHEN v_data_quality = 'STRONG' THEN 'HIGH'
        WHEN v_data_quality = 'GOOD' THEN 'MEDIUM'
        ELSE 'LOW'
      END
    ),
    'data_quality', jsonb_build_object(
      'sample_size', v_tx_count,
      'grade', v_data_quality,
      'trend', v_trend_classification,
      'calculated_at', v_now,
      'data_through', v_now,
      'period', p_period,
      'is_estimated', true,
      'meter_id', p_meter_id
    )
  );
END;
$$;

-- ==============================================================================
-- 7. Stored Procedure: Backfill Consumption Events
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.backfill_consumption_events(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted_count int := 0;
BEGIN
  INSERT INTO public.consumption_events (
    user_id,
    meter_id,
    transaction_id,
    event_type,
    units,
    units_source,
    amount_kobo,
    currency,
    confidence,
    occurred_at,
    metadata
  )
  SELECT 
    tx.user_id,
    tx.meter_id,
    tx.id,
    'PURCHASE',
    tx.units_kwh,
    CASE 
      WHEN tx.units_kwh IS NOT NULL AND tx.units_kwh > 0 THEN 'PROVIDER'::data_source_type
      ELSE 'UNAVAILABLE'::data_source_type
    END,
    tx.amount_kobo,
    'NGN',
    1.00,
    tx.created_at,
    jsonb_build_object('reference', tx.reference, 'disco_code', tx.disco_code, 'token', tx.token)
  FROM public.electricity_transactions tx
  WHERE tx.status = 'successful'
    AND (p_user_id IS NULL OR tx.user_id = p_user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.consumption_events ce WHERE ce.transaction_id = tx.id
    );

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'backfilled_events', v_inserted_count
  );
END;
$$;

-- ==============================================================================
-- 8. Row Level Security (RLS)
-- ==============================================================================
ALTER TABLE public.consumption_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- Consumption Events Policies
DROP POLICY IF EXISTS "Users can read own consumption events" ON public.consumption_events;
CREATE POLICY "Users can read own consumption events"
  ON public.consumption_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own consumption events" ON public.consumption_events;
CREATE POLICY "Users can insert own consumption events"
  ON public.consumption_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Meter Readings Policies
DROP POLICY IF EXISTS "Users can read own meter readings" ON public.meter_readings;
CREATE POLICY "Users can read own meter readings"
  ON public.meter_readings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own meter readings" ON public.meter_readings;
CREATE POLICY "Users can insert own meter readings"
  ON public.meter_readings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Snapshots Policies
DROP POLICY IF EXISTS "Users can read own analytics snapshots" ON public.consumption_analytics_snapshots;
CREATE POLICY "Users can read own analytics snapshots"
  ON public.consumption_analytics_snapshots FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert own analytics snapshots" ON public.consumption_analytics_snapshots;
CREATE POLICY "Users can upsert own analytics snapshots"
  ON public.consumption_analytics_snapshots FOR ALL
  USING (auth.uid() = user_id);
