import { supabase } from '../supabase';
import { ConsumptionAnalyticsService } from '../consumption-analytics.service';
import { EnergyContext } from '@/types/ai';
import { UserAppliance } from '@/types/auth';

export class EnergyContextBuilder {
  /**
   * Constructs an authorized, compact, and sanitized EnergyContext.
   */
  static async buildContext(
    userId: string,
    meterId?: string | null,
    period: '7d' | '30d' | '90d' | '1y' = '30d'
  ): Promise<EnergyContext> {
    // 1. Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, account_type')
      .eq('id', userId)
      .single();

    // 2. Fetch and verify meter if specified
    let targetMeterId: string | null = null;
    let meterInfo: any = {};

    if (meterId) {
      const { data: meter, error: meterErr } = await supabase
        .from('meters')
        .select('*')
        .eq('id', meterId)
        .eq('user_id', userId)
        .single();

      if (meter && !meterErr) {
        targetMeterId = meter.id;
        meterInfo = {
          id: meter.id,
          name: meter.nickname || meter.disco_name,
          meterNumber: meter.meter_number,
          discoCode: meter.disco_code,
          discoName: meter.disco_name,
          meterType: meter.meter_type,
        };
      }
    }

    // If no meter specified, get user's active/first meter
    if (!targetMeterId) {
      const { data: defaultMeters } = await supabase
        .from('meters')
        .select('*')
        .eq('user_id', userId)
        .order('is_active', { ascending: false })
        .limit(1);

      if (defaultMeters && defaultMeters.length > 0) {
        const m = defaultMeters[0];
        targetMeterId = m.id;
        meterInfo = {
          id: m.id,
          name: m.nickname || m.disco_name,
          meterNumber: m.meter_number,
          discoCode: m.disco_code,
          discoName: m.disco_name,
          meterType: m.meter_type,
        };
      }
    }

    // 3. Retrieve deterministic analytics from Phase 7 engine
    const analytics = await ConsumptionAnalyticsService.getConsumptionAnalytics(
      userId,
      targetMeterId,
      period
    );

    // 4. Retrieve registered user appliances
    const { data: rawAppliances } = await supabase
      .from('user_appliances')
      .select('*')
      .eq('user_id', userId);

    const appliancesList: UserAppliance[] = (rawAppliances as any) || [];
    const applianceEstimates = ConsumptionAnalyticsService.getApplianceEstimates(appliancesList);
    const totalDailyKwh = applianceEstimates.reduce((s, a) => s + a.estimatedDailyKwh, 0);

    // 5. Fetch recent purchases for interval context (Dual-key matching + wallet ledger fallback)
    const { data: rawTxs } = await supabase
      .from('electricity_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'successful')
      .order('created_at', { ascending: false });

    let scopedTxs = (rawTxs || []).filter((t) => {
      if (!targetMeterId) return true;
      if (t.meter_id === targetMeterId) return true;
      if (meterInfo.meterNumber && t.meter_number) {
        const cleanA = t.meter_number.replace(/\s/g, '');
        const cleanB = meterInfo.meterNumber.replace(/\s/g, '');
        return cleanA.includes(cleanB.slice(-4)) || cleanB.includes(cleanA.slice(-4));
      }
      return false;
    });

    if (scopedTxs.length === 0) {
      const { data: walletRows } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'purchase_debit')
        .order('created_at', { ascending: false })
        .limit(5);

      if (walletRows && walletRows.length > 0) {
        scopedTxs = walletRows.map((w) => ({
          amount_kobo: Math.abs(Number(w.amount_kobo)),
          units_kwh: Math.round(((Math.abs(Number(w.amount_kobo)) / 100) / 206.8) * 10) / 10,
          created_at: w.created_at,
        })) as any[];
      }
    }

    const recentPurchases = scopedTxs.slice(0, 5).map((t) => ({
      amountNaira: Math.floor(Number(t.amount_kobo) / 100),
      unitsKwh: t.units_kwh ? Number(t.units_kwh) : null,
      date: t.created_at,
    }));

    // 6. Build and assemble finalized context
    const now = new Date();
    const calculatedAt = now.toISOString();

    return {
      user: {
        id: userId,
        accountType: profile?.account_type || 'household',
        name: profile?.full_name || 'Customer',
      },
      meter: meterInfo,
      period: {
        key: period,
        startDate: analytics.dataQuality.calculatedAt,
        endDate: analytics.dataQuality.dataThrough,
      },
      spending: analytics.spending,
      consumption: analytics.consumption,
      purchasing: analytics.purchasing,
      forecast: analytics.forecast,
      appliances: {
        totalEstimatedDailyKwh: totalDailyKwh,
        items: applianceEstimates,
        count: applianceEstimates.length,
        isSelfReported: true,
      },
      dataQuality: {
        grade: analytics.dataQuality.grade,
        sampleSize: analytics.dataQuality.sampleSize,
        unitSource: analytics.consumption.unitSource,
        hasContinuousHistory: analytics.dataQuality.sampleSize >= 3,
      },
      recentPurchases,
      dataFreshness: {
        calculatedAt,
        dataThrough: analytics.dataQuality.dataThrough,
        isStale: false,
      },
    };
  }
}
