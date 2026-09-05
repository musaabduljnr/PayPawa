-- ============================================================================
-- Migration: 20260902000001_fix_consumption_energy_status.sql
-- Description: Fixes calculate_consumption_analytics to derive estimated days
--              remaining strictly from physical energy duration (remainingUnits / dailyUsage)
--              rather than purchase interval delta (medianInterval - daysSinceLastPurchase).
-- ============================================================================

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
  
  -- Intervals & Burn Rates
  v_intervals numeric[] := ARRAY[]::numeric[];
  v_cycle_kwh_list numeric[] := ARRAY[]::numeric[];
  v_avg_interval_days numeric := null;
  v_median_interval_days numeric := null;
  v_min_interval_days numeric := null;
  v_max_interval_days numeric := null;
  v_estimated_daily_units numeric := null;
  v_average_daily_spend numeric := null;
  v_data_quality text := 'INSUFFICIENT';
  v_unit_source text := 'UNAVAILABLE';
  v_trend_classification text := 'INSUFFICIENT_DATA';
  v_days_remaining_range text := null;
  v_estimated_next_purchase_date text := null;
  
  -- Running Balance Ledger
  v_running_balance numeric := 0;
  v_safe_burn_rate numeric := 5.0;
  v_last_tx_time timestamptz := NULL;
  v_tx_time timestamptz;
  v_tx_units numeric;
  v_delta_days numeric;
  v_total_meter_purchases int := 0;
  v_exact_days numeric := null;
  v_min_range int;
  v_max_range int;
  
  -- Cursor records
  r_tx record;
  r_cycle record;
  v_prev_cycle_ts timestamptz := NULL;
  v_prev_cycle_units numeric := 0;
  v_prev_cycle_spend numeric := 0;
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

  -- 2. Aggregate Current Period Spending & Units
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

  -- 3. Aggregate Previous Period Spending
  SELECT COALESCE(SUM(amount_kobo), 0)
  INTO v_prev_spend_kobo
  FROM public.electricity_transactions
  WHERE user_id = p_user_id
    AND status = 'successful'
    AND (p_meter_id IS NULL OR meter_id = p_meter_id)
    AND created_at >= v_prev_period_start
    AND created_at < v_period_start;

  -- 4. Calculate Period Spending Comparison
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
    v_spend_change_pct := 0;
    v_spend_change_direction := 'INSUFFICIENT_DATA';
  END IF;

  -- 5. Calculate Purchase Cycles & Intervals across ALL historical successful transactions
  FOR r_tx IN
    SELECT created_at, units_kwh, amount_kobo
    FROM public.electricity_transactions
    WHERE user_id = p_user_id
      AND status = 'successful'
      AND (p_meter_id IS NULL OR meter_id = p_meter_id)
    ORDER BY created_at ASC
  LOOP
    v_total_meter_purchases := v_total_meter_purchases + 1;
    v_tx_units := COALESCE(r_tx.units_kwh, ROUND((ABS(r_tx.amount_kobo) / 100.0 / 206.8), 1));
    
    IF v_prev_cycle_ts IS NOT NULL THEN
      v_delta_days := ROUND(EXTRACT(EPOCH FROM (r_tx.created_at - v_prev_cycle_ts)) / 86400.0, 1);
      IF v_delta_days >= 0.5 THEN
        v_intervals := array_append(v_intervals, v_delta_days);
        IF v_prev_cycle_units > 0 THEN
          v_cycle_kwh_list := array_append(v_cycle_kwh_list, ROUND(v_prev_cycle_units / v_delta_days, 1));
        END IF;
        v_prev_cycle_ts := r_tx.created_at;
        v_prev_cycle_units := v_tx_units;
      ELSE
        -- Merge top-up within 12 hours into active cycle
        v_prev_cycle_units := v_prev_cycle_units + v_tx_units;
      END IF;
    ELSE
      v_prev_cycle_ts := r_tx.created_at;
      v_prev_cycle_units := v_tx_units;
    END IF;
  END LOOP;

  -- 6. Median Interval & Daily Burn Rate
  IF array_length(v_intervals, 1) > 0 THEN
    SELECT 
      ROUND(AVG(val), 1), MIN(val), MAX(val), percentile_cont(0.5) WITHIN GROUP (ORDER BY val)
    INTO 
      v_avg_interval_days, v_min_interval_days, v_max_interval_days, v_median_interval_days
    FROM unnest(v_intervals) AS val;
  END IF;

  IF array_length(v_cycle_kwh_list, 1) > 0 THEN
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY val)
    INTO v_estimated_daily_units
    FROM unnest(v_cycle_kwh_list) AS val;
  END IF;

  -- 7. Cumulative Energy Ledger with Time-Decay
  v_safe_burn_rate := COALESCE(v_estimated_daily_units, 5.0);
  v_running_balance := 0;
  v_last_tx_time := NULL;

  FOR r_tx IN
    SELECT created_at, units_kwh, amount_kobo
    FROM public.electricity_transactions
    WHERE user_id = p_user_id
      AND status = 'successful'
      AND (p_meter_id IS NULL OR meter_id = p_meter_id)
    ORDER BY created_at ASC
  LOOP
    v_tx_units := COALESCE(r_tx.units_kwh, ROUND((ABS(r_tx.amount_kobo) / 100.0 / 206.8), 1));
    IF v_last_tx_time IS NOT NULL THEN
      v_delta_days := GREATEST(0, EXTRACT(EPOCH FROM (r_tx.created_at - v_last_tx_time)) / 86400.0);
      v_running_balance := GREATEST(0, v_running_balance - (v_safe_burn_rate * v_delta_days));
    END IF;
    v_running_balance := v_running_balance + v_tx_units;
    v_last_tx_time := r_tx.created_at;
  END LOOP;

  IF v_last_tx_time IS NOT NULL THEN
    v_delta_days := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_last_tx_time)) / 86400.0);
    v_running_balance := GREATEST(0, v_running_balance - (v_safe_burn_rate * v_delta_days));
  END IF;

  -- 8. Estimated Days Remaining (Physical duration = balance / burn_rate)
  IF v_running_balance > 0 AND v_estimated_daily_units IS NOT NULL AND v_estimated_daily_units > 0 THEN
    v_exact_days := v_running_balance / v_estimated_daily_units;
    IF v_exact_days >= 0.8 THEN
      v_min_range := FLOOR(v_exact_days)::int;
      v_max_range := CEIL(v_exact_days)::int;
      IF v_min_range = v_max_range THEN
        v_days_remaining_range := '~' || v_min_range || ' days';
      ELSE
        v_days_remaining_range := v_min_range || '–' || v_max_range || ' days';
      END IF;
      v_estimated_next_purchase_date := (v_now + (v_exact_days || ' days')::interval)::text;
    ELSE
      v_days_remaining_range := 'Recharge due soon';
      v_estimated_next_purchase_date := v_now::text;
    END IF;
  ELSIF v_total_meter_purchases = 1 THEN
    v_days_remaining_range := 'Need 2+ purchases';
  ELSE
    v_days_remaining_range := 'Awaiting recharge';
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

  -- 10. Build and Return Structured JSON
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
      'unit_source', CASE WHEN v_units_available_count > 0 THEN 'PROVIDER' ELSE 'UNAVAILABLE' END,
      'units_available_count', v_units_available_count
    ),
    'purchasing', jsonb_build_object(
      'total_purchases', v_total_meter_purchases,
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
      'calculated_at', v_now::text,
      'data_through', v_now::text
    )
  );
END;
$$;
