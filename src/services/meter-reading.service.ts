import { supabase } from './supabase';
import { MeterReading } from '@/types/consumption';
import { ConsumptionAnalyticsService } from './consumption-analytics.service';

export interface RecordMeterReadingResult {
  success: boolean;
  readingId?: string;
  readingValue?: number;
  isAnomalous?: boolean;
  anomalyReason?: string | null;
  deltaKwh?: number | null;
  errorCode?: string;
  errorMessage?: string;
}

export class MeterReadingService {
  /**
   * Records a user-reported or hardware meter reading.
   * Performs validation, drop detection, anomaly flagging, and consumption logging.
   */
  static async recordReading(
    userId: string,
    meterId: string,
    readingValue: number,
    recordedAt?: string
  ): Promise<RecordMeterReadingResult> {
    const timestamp = recordedAt || new Date().toISOString();

    // 1. Client-Side Quick Validations
    if (readingValue < 0) {
      return {
        success: false,
        errorCode: 'INVALID_READING',
        errorMessage: 'Meter reading cannot be a negative value.',
      };
    }

    if (new Date(timestamp).getTime() > Date.now() + 5 * 60 * 1000) {
      return {
        success: false,
        errorCode: 'FUTURE_TIMESTAMP',
        errorMessage: 'Reading timestamp cannot be in the future.',
      };
    }

    try {
      // 2. Try stored procedure execution first
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
        'record_manual_meter_reading',
        {
          p_user_id: userId,
          p_meter_id: meterId,
          p_reading: readingValue,
          p_recorded_at: timestamp,
        }
      );

      if (!rpcError && rpcData && typeof rpcData === 'object') {
        const res = rpcData as any;
        if (res.success) {
          ConsumptionAnalyticsService.invalidateCache(userId, meterId);
          return {
            success: true,
            readingId: res.reading_id,
            readingValue: res.reading_value,
            isAnomalous: res.is_anomalous,
            anomalyReason: res.anomaly_reason,
            deltaKwh: res.delta_kwh,
          };
        }
        return {
          success: false,
          errorCode: res.error || 'DATABASE_ERROR',
          errorMessage: res.message || 'Unable to record meter reading.',
        };
      }
    } catch (err) {
      console.warn('[MeterReadingService] RPC execution failed, using resilient client logic:', err);
    }

    // 3. Fallback to resilient client-side execution
    return this.recordReadingClientSide(userId, meterId, readingValue, timestamp);
  }

  /**
   * Client-side fallback implementation with full validation and anomaly detection.
   */
  private static async recordReadingClientSide(
    userId: string,
    meterId: string,
    readingValue: number,
    recordedAt: string
  ): Promise<RecordMeterReadingResult> {
    // Verify meter ownership
    const { data: meter, error: meterErr } = await supabase
      .from('meters')
      .select('id, user_id')
      .eq('id', meterId)
      .eq('user_id', userId)
      .single();

    if (meterErr || !meter) {
      return {
        success: false,
        errorCode: 'UNAUTHORIZED_METER',
        errorMessage: 'The specified meter is not registered under your account.',
      };
    }

    // Fetch previous non-anomalous reading
    const { data: prevReadings } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('meter_id', meterId)
      .eq('is_anomalous', false)
      .order('recorded_at', { ascending: false })
      .limit(1);

    let isAnomalous = false;
    let anomalyReason: string | null = null;
    let deltaKwh: number | null = null;

    const lastReading = prevReadings && prevReadings.length > 0 ? prevReadings[0] : null;

    if (lastReading) {
      const prevVal = Number(lastReading.reading_value);
      if (readingValue < prevVal) {
        isAnomalous = true;
        anomalyReason = `Reading (${readingValue} kWh) is lower than previous reading (${prevVal} kWh). Possible rollover or typo.`;
      } else if (readingValue - prevVal > 5000) {
        isAnomalous = true;
        anomalyReason = `Unusually large jump of ${readingValue - prevVal} kWh detected. Flagged for review.`;
      } else {
        deltaKwh = Math.round((readingValue - prevVal) * 100) / 100;
      }
    }

    // Insert into meter_readings table (with meters.metadata fallback)
    let insertedId = `MR-${Date.now()}`;
    const { data: inserted, error: insertErr } = await supabase
      .from('meter_readings')
      .insert({
        user_id: userId,
        meter_id: meterId,
        reading_value: readingValue,
        unit: 'kwh',
        reading_type: 'cumulative',
        source: 'USER_REPORTED',
        is_anomalous: isAnomalous,
        anomaly_reason: anomalyReason,
        recorded_at: recordedAt,
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      // If table does not exist in schema cache, store in meter metadata JSON
      const { data: currentMeter } = await (supabase
        .from('meters') as any)
        .select('metadata')
        .eq('id', meterId)
        .single();

      const prevMeta = currentMeter?.metadata || {};
      const prevList = Array.isArray(prevMeta.meter_readings) ? prevMeta.meter_readings : [];
      const newEntry = {
        id: insertedId,
        user_id: userId,
        meter_id: meterId,
        reading_value: readingValue,
        unit: 'kwh',
        reading_type: 'cumulative',
        source: 'USER_REPORTED',
        is_anomalous: isAnomalous,
        anomaly_reason: anomalyReason,
        recorded_at: recordedAt,
      };

      await (supabase
        .from('meters') as any)
        .update({
          metadata: {
            ...prevMeta,
            meter_readings: [newEntry, ...prevList],
          },
        })
        .eq('id', meterId);
    } else {
      insertedId = inserted.id;
    }

    // If valid delta, insert a consumption event if table exists
    if (deltaKwh !== null && deltaKwh >= 0) {
      try {
        await supabase.from('consumption_events').insert({
          user_id: userId,
          meter_id: meterId,
          event_type: 'METER_READING',
          units: deltaKwh,
          units_source: 'USER_REPORTED',
          confidence: 0.95,
          occurred_at: recordedAt,
          metadata: {
            meter_reading_id: insertedId,
            previous_reading: lastReading ? Number(lastReading.reading_value) : null,
            current_reading: readingValue,
          },
        });
      } catch (ceErr) {
        // graceful ignore if table not present
      }
    }

    ConsumptionAnalyticsService.invalidateCache(userId, meterId);

    return {
      success: true,
      readingId: insertedId,
      readingValue,
      isAnomalous,
      anomalyReason,
      deltaKwh,
    };
  }

  /**
   * Retrieves chronological reading history for a specific meter.
   */
  static async getReadingsForMeter(userId: string, meterId: string): Promise<MeterReading[]> {
    const { data, error } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('user_id', userId)
      .eq('meter_id', meterId)
      .order('recorded_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map((r) => ({
        id: r.id,
        userId: r.user_id,
        meterId: r.meter_id,
        readingValue: Number(r.reading_value),
        unit: r.unit || 'kwh',
        readingType: r.reading_type || 'cumulative',
        source: r.source || 'USER_REPORTED',
        isAnomalous: !!r.is_anomalous,
        anomalyReason: r.anomaly_reason,
        recordedAt: r.recorded_at,
        createdAt: r.created_at || r.recorded_at,
      }));
    }

    // Fallback to meters.metadata
    const { data: meter } = await (supabase
      .from('meters') as any)
      .select('metadata')
      .eq('id', meterId)
      .single();

    const readingsList = meter?.metadata?.meter_readings;
    if (Array.isArray(readingsList)) {
      return readingsList.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        meterId: r.meter_id,
        readingValue: Number(r.reading_value),
        unit: r.unit || 'kwh',
        readingType: r.reading_type || 'cumulative',
        source: r.source || 'USER_REPORTED',
        isAnomalous: !!r.is_anomalous,
        anomalyReason: r.anomaly_reason,
        recordedAt: r.recorded_at,
        createdAt: r.recorded_at,
      }));
    }

    return [];
  }
}

