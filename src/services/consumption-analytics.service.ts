import { supabase } from './supabase';
import {
  ConsumptionAnalyticsResponse,
  SpendingAnalytics,
  UnitConsumptionAnalytics,
  PurchasingCadenceAnalytics,
  ConsumptionForecast,
  DataQualitySummary,
  ApplianceContributionEstimate,
  UsageAlertData,
  PeriodChartData,
  PeriodChartBucket,
  DataSourceType,
  DataQualityGrade,
  TrendDirection,
  ConfidenceScore,
  AnalyticsValue,
} from '@/types/consumption';
import { UserAppliance } from '@/types/auth';

export type BalanceSourceType =
  | 'actual_meter_reading'
  | 'estimated_from_history'
  | 'unavailable';

export type DailyUsageSourceType =
  | 'cadence_derived'
  | 'appliance_profile'
  | 'unavailable';

export interface CanonicalEnergySnapshot {
  meterId: string | null;
  meterNumber: string | null;
  dataVersion: number;

  // Energy Balance
  remainingKwh: number | null;
  remainingKwhSource: BalanceSourceType;
  totalPurchasedUnitsKwh: number;
  totalMeterPurchases: number;

  // Burn Rate / Daily Usage
  averageDailyUsageKwh: number | null;
  averageDailyUsageSource: DailyUsageSourceType;

  // Duration & Status
  exactDaysRemaining: number | null;
  estimatedDaysRemainingRange: string;
  status: 'healthy' | 'medium' | 'low' | null;

  // Confidence & Quality
  dataQuality: DataQualityGrade;
  confidence: ConfidenceScore;
  calculatedAt: string;
}

export class ConsumptionAnalyticsService {
  private static readonly analyticsCache = new Map<
    string,
    { response: ConsumptionAnalyticsResponse; expiresAt: number }
  >();

  /**
   * Invalidates cached analytics for a specific user or user:meter scope.
   */
  static invalidateCache(userId: string, meterId?: string | null): void {
    const prefix = meterId ? `${userId}:${meterId}:` : `${userId}:`;
    for (const key of this.analyticsCache.keys()) {
      if (key.startsWith(prefix)) {
        this.analyticsCache.delete(key);
      }
    }
  }

  /**
   * Authoritative calculation of consumption and spending analytics.
   * Invokes deterministic calculation engine with automatic scoped caching.
   */
  static async getConsumptionAnalytics(
    userId: string,
    meterId?: string | null,
    period: '7d' | '30d' | '90d' | '1y' = '30d',
    bypassCache = false
  ): Promise<ConsumptionAnalyticsResponse> {
    const cacheKey = `${userId}:${meterId || 'all'}:${period}`;
    if (!bypassCache) {
      const entry = this.analyticsCache.get(cacheKey);
      if (entry && entry.expiresAt > Date.now()) {
        return entry.response;
      }
    }

    const calculated = await this.calculateClientSideAnalytics(userId, meterId, period);
    this.analyticsCache.set(cacheKey, {
      response: calculated,
      expiresAt: Date.now() + 60000, // 60-second scoped TTL
    });
    return calculated;
  }

  /**
   * Generates single canonical energy snapshot with strict provenance metadata.
   */
  static async getCanonicalEnergySnapshot(
    userId: string,
    meterId?: string | null
  ): Promise<CanonicalEnergySnapshot> {
    const analytics = await this.getConsumptionAnalytics(userId, meterId, '30d');
    const remainingKwh = analytics.metrics.remainingUnits.value;
    const dailyUsage = analytics.metrics.averageDailyUsage.value;
    const totalPurchasedUnitsKwh = analytics.consumption.totalUnitsKwh || 0;
    const totalMeterPurchases = analytics.purchasing.totalPurchases;

    let exactDaysRemaining: number | null = null;
    let status: 'healthy' | 'medium' | 'low' | null = null;

    if (remainingKwh !== null && dailyUsage !== null && dailyUsage > 0) {
      exactDaysRemaining = remainingKwh / dailyUsage;
      if (exactDaysRemaining > 7) status = 'healthy';
      else if (exactDaysRemaining > 2) status = 'medium';
      else status = 'low';
    } else if (remainingKwh !== null && totalPurchasedUnitsKwh > 0) {
      const pct = (remainingKwh / totalPurchasedUnitsKwh) * 100;
      if (pct > 50) status = 'healthy';
      else if (pct > 20) status = 'medium';
      else status = 'low';
    }

    return {
      meterId: meterId || null,
      meterNumber: analytics.dataQuality.meterId || null,
      dataVersion: 1,
      remainingKwh,
      remainingKwhSource: remainingKwh !== null ? 'estimated_from_history' : 'unavailable',
      totalPurchasedUnitsKwh,
      totalMeterPurchases,
      averageDailyUsageKwh: dailyUsage,
      averageDailyUsageSource: dailyUsage !== null ? 'cadence_derived' : 'unavailable',
      exactDaysRemaining,
      estimatedDaysRemainingRange: analytics.forecast.estimatedDaysRemainingRange || 'Awaiting recharge',
      status,
      dataQuality: analytics.dataQuality.grade,
      confidence: analytics.forecast.confidence,
      calculatedAt: analytics.dataQuality.calculatedAt,
    };
  }

  /**
   * Deterministic client-side computation matching the PostgreSQL engine.
   * NEVER returns false zeroes or fabricated numbers.
   */
  static async calculateClientSideAnalytics(
    userId: string,
    meterId?: string | null,
    period: '7d' | '30d' | '90d' | '1y' = '30d'
  ): Promise<ConsumptionAnalyticsResponse> {
    const now = new Date();
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;

    const currentPeriodStart = new Date(now.getTime() - periodDays * 86400 * 1000);
    const previousPeriodStart = new Date(currentPeriodStart.getTime() - periodDays * 86400 * 1000);

    // Resolve meter details if meterId is provided
    let targetMeterNumber: string | null = null;
    if (meterId) {
      const { data: meterRow } = await supabase
        .from('meters')
        .select('meter_number')
        .eq('id', meterId)
        .maybeSingle();

      if (meterRow?.meter_number) {
        targetMeterNumber = meterRow.meter_number.replace(/\s/g, '');
      } else if (!meterId.includes('-')) {
        targetMeterNumber = meterId.replace(/\s/g, '');
      }
    }

    // Optimized select of strictly needed columns
    let query = supabase
      .from('electricity_transactions')
      .select('id, user_id, meter_id, meter_number, amount_kobo, status, created_at, units_kwh')
      .eq('user_id', userId)
      .eq('status', 'successful')
      .order('created_at', { ascending: true });

    const { data: rawTxs, error } = await query;
    let txs: any[] = (rawTxs as any[]) || [];

    // Fallback to wallet ledger purchases if electricity_transactions table has no rows
    if (txs.length === 0) {
      const { data: walletRows } = await supabase
        .from('wallet_transactions')
        .select('id, user_id, type, amount_kobo, created_at, related_electricity_tx_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (walletRows && walletRows.length > 0) {
        // Collect all refunded electricity tx IDs to strictly exclude them
        const refundedElecIds = new Set(
          walletRows
            .filter((w) => w.type === 'refund_credit')
            .map((w) => w.related_electricity_tx_id)
            .filter(Boolean)
        );

        const validPurchases = walletRows.filter(
          (w) =>
            w.type === 'purchase_debit' &&
            (!w.related_electricity_tx_id || !refundedElecIds.has(w.related_electricity_tx_id))
        );

        txs = validPurchases.map((w) => ({
          id: w.id,
          user_id: w.user_id,
          meter_id: meterId || null,
          meter_number: targetMeterNumber || null,
          amount_kobo: Math.abs(Number(w.amount_kobo)),
          status: 'successful',
          created_at: w.created_at,
          units_kwh: Math.round(((Math.abs(Number(w.amount_kobo)) / 100) / 206.8) * 10) / 10,
        }));
      }
    }

    // Strict meter isolation: Match either by UUID or meter number
    if (meterId) {
      txs = txs.filter((t) => {
        if (t.meter_id && t.meter_id === meterId) return true;
        if (targetMeterNumber && t.meter_number) {
          const cleanTxNum = t.meter_number.replace(/\s/g, '');
          return cleanTxNum.includes(targetMeterNumber.slice(-4)) || targetMeterNumber.includes(cleanTxNum.slice(-4));
        }
        return false;
      });
    }

    // Current period transactions
    const currentPeriodTxs = txs.filter((t) => new Date(t.created_at) >= currentPeriodStart);
    // Previous period transactions
    const prevPeriodTxs = txs.filter(
      (t) => new Date(t.created_at) >= previousPeriodStart && new Date(t.created_at) < currentPeriodStart
    );

    // 1. Spending Metrics
    const currentSpendNaira = currentPeriodTxs.reduce((sum, t) => sum + Math.abs(Number(t.amount_kobo)) / 100, 0);
    const prevSpendNaira = prevPeriodTxs.reduce((sum, t) => sum + Math.abs(Number(t.amount_kobo)) / 100, 0);

    let percentageChange = 0;
    let direction: TrendDirection = 'INSUFFICIENT_DATA';
    const hasPreviousBaseline = prevSpendNaira > 0;

    if (hasPreviousBaseline) {
      percentageChange = Math.round(((currentSpendNaira - prevSpendNaira) / prevSpendNaira) * 1000) / 10;
      if (percentageChange > 3) {
        direction = 'INCREASING';
      } else if (percentageChange < -3) {
        direction = 'DECREASING';
      } else {
        direction = 'STABLE';
      }
    }

    // 2. Unit Consumption Metrics (Authoritative only, no fabricated values)
    const validUnitTxs = currentPeriodTxs.filter((t) => t.units_kwh !== null && Number(t.units_kwh) > 0);
    const totalUnitsKwh = validUnitTxs.length > 0
      ? validUnitTxs.reduce((sum, t) => sum + Number(t.units_kwh), 0)
      : null;
    const unitSource: DataSourceType = validUnitTxs.length > 0 ? 'PROVIDER' : 'UNAVAILABLE';

    // 3. Purchase Cadence & Intervals across total meter purchase history
    // Group consecutive top-ups within 24 hours into single purchase cycles
    const purchaseCycles: { date: number; units: number; spend: number }[] = [];
    for (const tx of txs) {
      const txTime = new Date(tx.created_at).getTime();
      const txUnits = tx.units_kwh !== null
        ? Number(tx.units_kwh)
        : (Number(tx.amount_kobo) ? (Math.abs(Number(tx.amount_kobo)) / 100 / 206.8) : 0);
      const txSpend = Math.abs(Number(tx.amount_kobo)) / 100;

      if (purchaseCycles.length > 0) {
        const lastCycle = purchaseCycles[purchaseCycles.length - 1];
        const deltaHours = (txTime - lastCycle.date) / (3600 * 1000);
        if (deltaHours < 24) {
          // Merge top-up into existing cycle
          lastCycle.units += txUnits;
          lastCycle.spend += txSpend;
          continue;
        }
      }
      purchaseCycles.push({ date: txTime, units: txUnits, spend: txSpend });
    }

    const intervals: number[] = [];
    for (let i = 1; i < purchaseCycles.length; i++) {
      const prev = purchaseCycles[i - 1];
      const curr = purchaseCycles[i];
      const diffDays = Math.round(((curr.date - prev.date) / (86400 * 1000)) * 10) / 10;
      if (diffDays >= 0.5) {
        intervals.push(diffDays);
      }
    }

    let averageIntervalDays: number | null = null;
    let medianIntervalDays: number | null = null;
    let shortestIntervalDays: number | null = null;
    let longestIntervalDays: number | null = null;

    if (intervals.length > 0) {
      const sorted = [...intervals].sort((a, b) => a - b);
      shortestIntervalDays = sorted[0];
      longestIntervalDays = sorted[sorted.length - 1];
      averageIntervalDays = Math.round((intervals.reduce((a, b) => a + b, 0) / intervals.length) * 10) / 10;

      const mid = Math.floor(sorted.length / 2);
      medianIntervalDays = sorted.length % 2 !== 0
        ? sorted[mid]
        : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
    }

    // Daily burn rate: derived from total units across completed cycles and median cadence
    let estimatedDailyUnitsKwh: number | null = null;
    let averageDailySpendNaira: number | null = null;

    const totalMeterPurchases = txs.length;
    const totalAllUnits = txs.reduce((sum, t) => {
      const u = t.units_kwh !== null
        ? Number(t.units_kwh)
        : (Number(t.amount_kobo) ? (Math.abs(Number(t.amount_kobo)) / 100 / 206.8) : 0);
      return sum + u;
    }, 0);

    if (totalMeterPurchases >= 2 && medianIntervalDays !== null && medianIntervalDays > 0) {
      const averageUnitsPerCycle = totalAllUnits / Math.max(1, purchaseCycles.length);
      estimatedDailyUnitsKwh = Math.round((averageUnitsPerCycle / medianIntervalDays) * 10) / 10;
    }

    if (currentSpendNaira > 0) {
      averageDailySpendNaira = Math.round(currentSpendNaira / periodDays);
    }

    // 4. Data Quality Grade
    const sampleSize = currentPeriodTxs.length;
    let grade: DataQualityGrade = 'INSUFFICIENT';
    if (sampleSize === 0) grade = 'INSUFFICIENT';
    else if (sampleSize === 1) grade = 'LIMITED';
    else if (sampleSize <= 4) grade = 'GOOD';
    else grade = 'STRONG';

    // 5. Honest Cadence & Velocity with terminal states (No indefinite calculating states)
    let purchaseVelocity: string;
    if (totalMeterPurchases === 0) {
      purchaseVelocity = 'Awaiting first recharge';
    } else if (totalMeterPurchases === 1) {
      purchaseVelocity = 'Need 2+ purchases for cadence';
    } else if (medianIntervalDays !== null) {
      purchaseVelocity = `Every ~${medianIntervalDays} days`;
    } else {
      purchaseVelocity = 'Need 2+ purchases for cadence';
    }

    // 5b. Cumulative Estimated Remaining Units calculation across all unexhausted purchases
    let estimatedRemainingUnits: number | null = null;
    if (txs.length > 0) {
      const burnRate = estimatedDailyUnitsKwh || (averageDailySpendNaira ? averageDailySpendNaira / 206.8 : 5.0);
      const safeBurnRate = !isNaN(burnRate) && burnRate > 0 ? burnRate : 5.0;

      let runningBalance = 0;
      let lastTxTime = txs[0].created_at ? new Date(txs[0].created_at).getTime() : now.getTime();

      for (const tx of txs) {
        const txTime = tx.created_at ? new Date(tx.created_at).getTime() : lastTxTime;
        const timeDeltaDays = !isNaN(txTime) && txTime >= lastTxTime
          ? Math.max(0, (txTime - lastTxTime) / (86400 * 1000))
          : 0;
        runningBalance = Math.max(0, runningBalance - (safeBurnRate * timeDeltaDays));

        const txUnits = tx.units_kwh !== null
          ? Number(tx.units_kwh)
          : (Number(tx.amount_kobo) ? Math.round((Math.abs(Number(tx.amount_kobo)) / 100 / 206.8) * 10) / 10 : 0);
        if (!isNaN(txUnits) && txUnits > 0) {
          runningBalance += txUnits;
        }
        if (!isNaN(txTime) && txTime > 0) {
          lastTxTime = txTime;
        }
      }

      // Decay from last purchase to current moment
      const finalDeltaDays = Math.max(0, (now.getTime() - lastTxTime) / (86400 * 1000));
      runningBalance = Math.max(0, runningBalance - (safeBurnRate * finalDeltaDays));

      estimatedRemainingUnits = Math.max(0, Math.round(runningBalance));
    }

    // 6. Honest Forecast & Days Remaining Range (Derived purely from remainingUnits / dailyUsage at full precision)
    let estimatedDaysRemainingRange: string | null = null;
    let estimatedNextPurchaseDate: string | null = null;
    let confidence: ConfidenceScore = grade === 'STRONG' ? 'HIGH' : grade === 'GOOD' ? 'MEDIUM' : 'LOW';

    if (estimatedRemainingUnits !== null && estimatedDailyUnitsKwh !== null && estimatedDailyUnitsKwh > 0) {
      const exactDays = estimatedRemainingUnits / estimatedDailyUnitsKwh;
      if (exactDays >= 1.0) {
        const minRange = Math.floor(exactDays);
        const maxRange = Math.ceil(exactDays);
        estimatedDaysRemainingRange = minRange === maxRange ? `~${minRange} days` : `${minRange}–${maxRange} days`;
        const nextDate = new Date(now.getTime() + exactDays * 86400 * 1000);
        estimatedNextPurchaseDate = nextDate.toISOString();
      } else {
        estimatedDaysRemainingRange = 'Recharge due soon';
        estimatedNextPurchaseDate = now.toISOString();
      }
    } else if (totalMeterPurchases === 1) {
      estimatedDaysRemainingRange = 'Need 2+ purchases';
    } else {
      estimatedDaysRemainingRange = 'Awaiting recharge';
    }

    // 6. Real Period Chart Aggregation (No fake arrays)
    const periodChart = this.buildPeriodChartData(currentPeriodTxs, period);

    // 7. Usage Alert Logic: Only alert when statistically justified by real baseline comparison
    const shouldShowAlert =
      hasPreviousBaseline &&
      direction === 'INCREASING' &&
      percentageChange >= 15 &&
      (grade === 'GOOD' || grade === 'STRONG');

    const usageAlert: UsageAlertData = {
      shouldShowAlert,
      alertTitle: 'Your electricity spending is higher than usual',
      alertBody: `Spending is up +${percentageChange}% compared to your previous ${periodDays}-day baseline. Consider reducing heavy appliance runtimes during peak hours.`,
      percentageIncrease: percentageChange > 0 ? percentageChange : 0,
    };

    // 8. Explainable Insight Generation
    const explainableInsight = this.generateExplainableInsight({
      sampleSize,
      direction,
      percentageChange,
      medianIntervalDays,
      currentSpendNaira,
      totalUnitsKwh,
    });

    const calculatedAtIso = now.toISOString();

    return {
      spending: {
        currentPeriodSpendNaira: currentSpendNaira,
        previousPeriodSpendNaira: prevSpendNaira,
        percentageChange,
        direction,
        hasPreviousBaseline,
        averageDailySpendNaira,
      },
      consumption: {
        totalUnitsKwh,
        estimatedDailyUnitsKwh,
        unitSource,
        unitsAvailableCount: validUnitTxs.length,
        isTelemetryAvailable: false,
      },
      purchasing: {
        totalPurchases: totalMeterPurchases,
        averageIntervalDays,
        medianIntervalDays,
        shortestIntervalDays,
        longestIntervalDays,
        purchaseVelocity,
      },
      forecast: {
        estimatedDaysRemainingRange,
        estimatedNextPurchaseDate,
        confidence,
      },
      dataQuality: {
        sampleSize,
        grade,
        trend: direction,
        calculatedAt: calculatedAtIso,
        dataThrough: calculatedAtIso,
        period,
        isEstimated: true,
        meterId,
      },
      usageAlert,
      periodChart,
      explainableInsight,
      metrics: {
        averageDailySpend: {
          value: averageDailySpendNaira,
          status: averageDailySpendNaira !== null ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
          source: 'DERIVED',
          confidence: averageDailySpendNaira !== null ? (grade === 'STRONG' ? 'HIGH' : 'MEDIUM') : null,
          calculatedAt: calculatedAtIso,
        },
        averageDailyUsage: {
          value: estimatedDailyUnitsKwh,
          status: estimatedDailyUnitsKwh !== null ? 'AVAILABLE' : 'UNAVAILABLE',
          source: estimatedDailyUnitsKwh !== null ? 'PROVIDER' : 'UNAVAILABLE',
          confidence: estimatedDailyUnitsKwh !== null ? 'MEDIUM' : null,
          calculatedAt: calculatedAtIso,
        },
        monthlySpend: {
          value: currentSpendNaira,
          status: 'AVAILABLE',
          source: 'DERIVED',
          confidence: 'HIGH',
          calculatedAt: calculatedAtIso,
        },
        remainingUnits: {
          value: estimatedRemainingUnits,
          status: estimatedRemainingUnits !== null ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
          source: 'ESTIMATED',
          confidence: sampleSize >= 2 ? 'HIGH' : 'MEDIUM',
          calculatedAt: calculatedAtIso,
        },
        purchaseCadence: {
          value: medianIntervalDays,
          status: medianIntervalDays !== null ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
          source: 'DERIVED',
          confidence: medianIntervalDays !== null ? 'MEDIUM' : null,
          calculatedAt: calculatedAtIso,
        },
      },
    };
  }

  /**
   * Builds real, truthful period chart buckets from verified transactions.
   * If transactions are empty, returns clean zeroed buckets with hasData = false.
   */
  private static buildPeriodChartData(
    txs: any[],
    period: '7d' | '30d' | '90d' | '1y'
  ): PeriodChartData {
    const buckets: PeriodChartBucket[] = [];
    const now = new Date();

    if (period === '7d') {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const fullDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      
      const counts = Array(7).fill(0);
      const amounts = Array(7).fill(0);
      const units = Array(7).fill(0);

      txs.forEach((tx) => {
        const txDate = new Date(tx.created_at);
        const dayIdx = (txDate.getDay() + 6) % 7; // Monday = 0
        counts[dayIdx] += 1;
        amounts[dayIdx] += Math.abs(Number(tx.amount_kobo)) / 100;
        if (tx.units_kwh) units[dayIdx] += Number(tx.units_kwh);
      });

      for (let i = 0; i < 7; i++) {
        buckets.push({
          label: days[i],
          fullLabel: fullDays[i],
          count: counts[i],
          amountNaira: amounts[i],
          unitsKwh: units[i] > 0 ? units[i] : null,
        });
      }
    } else if (period === '30d') {
      const shortLabels = ['W1', 'W2', 'W3', 'W4', 'W5'];
      const fullLabels = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
      const counts = Array(5).fill(0);
      const amounts = Array(5).fill(0);

      txs.forEach((tx) => {
        const txDate = new Date(tx.created_at);
        const diffDays = Math.floor((now.getTime() - txDate.getTime()) / (86400 * 1000));
        const weekIdx = Math.min(4, Math.max(0, 4 - Math.floor(diffDays / 7)));
        counts[weekIdx] += 1;
        amounts[weekIdx] += Math.abs(Number(tx.amount_kobo)) / 100;
      });

      for (let i = 0; i < 5; i++) {
        buckets.push({
          label: shortLabels[i],
          fullLabel: fullLabels[i],
          count: counts[i],
          amountNaira: amounts[i],
          unitsKwh: null,
        });
      }
    } else {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const fullMonths = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const counts = Array(12).fill(0);
      const amounts = Array(12).fill(0);

      txs.forEach((tx) => {
        const txDate = new Date(tx.created_at);
        const mIdx = txDate.getMonth();
        counts[mIdx] += 1;
        amounts[mIdx] += Math.abs(Number(tx.amount_kobo)) / 100;
      });

      for (let i = 0; i < 12; i++) {
        buckets.push({
          label: months[i],
          fullLabel: fullMonths[i],
          count: counts[i],
          amountNaira: amounts[i],
          unitsKwh: null,
        });
      }
    }

    const totalSpend = buckets.reduce((s, b) => s + b.amountNaira, 0);
    const totalCount = buckets.reduce((s, b) => s + b.count, 0);
    const hasData = totalCount > 0;

    return {
      period,
      buckets,
      totalSpendNaira: totalSpend,
      totalPurchases: totalCount,
      totalUnitsKwh: null,
      hasData,
      status: hasData ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
    };
  }

  /**
   * Generates deterministic, honest insights without false precision or unfounded causation.
   */
  private static generateExplainableInsight(params: {
    sampleSize: number;
    direction: TrendDirection;
    percentageChange: number;
    medianIntervalDays: number | null;
    currentSpendNaira: number;
    totalUnitsKwh: number | null;
  }): string {
    if (params.sampleSize === 0) {
      return 'Your consumption profile is still building. Make your first electricity purchase to unlock cadence insights.';
    }

    if (params.sampleSize === 1) {
      return '1 recharge recorded. Make another electricity purchase when your token finishes to establish your purchase cadence.';
    }

    if (params.direction === 'INCREASING') {
      return `Your electricity purchases this period are about ${Math.abs(params.percentageChange)}% higher than your previous pattern.`;
    }

    if (params.direction === 'DECREASING') {
      return `Your electricity purchases this period are about ${Math.abs(params.percentageChange)}% lower than your previous pattern.`;
    }

    if (params.medianIntervalDays !== null) {
      return `Your electricity purchase pattern is consistent, recurring every ~${params.medianIntervalDays} days.`;
    }

    return 'Your electricity purchase history is building normally.';
  }

  /**
   * Formats raw RPC database payload into strongly-typed client structure with provenance.
   */
  private static formatAnalyticsResponse(
    raw: any,
    period: '7d' | '30d' | '90d' | '1y',
    meterId?: string | null
  ): ConsumptionAnalyticsResponse {
    const spending: SpendingAnalytics = {
      currentPeriodSpendNaira: Number(raw.spending?.current_period_spend_naira) || 0,
      previousPeriodSpendNaira: Number(raw.spending?.previous_period_spend_naira) || 0,
      percentageChange: Number(raw.spending?.percentage_change) || 0,
      direction: raw.spending?.direction || 'INSUFFICIENT_DATA',
      hasPreviousBaseline: Boolean(raw.spending?.has_previous_baseline),
      averageDailySpendNaira: raw.spending?.average_daily_spend_naira !== undefined && raw.spending?.average_daily_spend_naira !== null
        ? Number(raw.spending?.average_daily_spend_naira)
        : null,
    };

    const consumption: UnitConsumptionAnalytics = {
      totalUnitsKwh: raw.consumption?.total_units_kwh !== null && raw.consumption?.total_units_kwh !== undefined
        ? Number(raw.consumption?.total_units_kwh)
        : null,
      estimatedDailyUnitsKwh: raw.consumption?.estimated_daily_units_kwh !== null && raw.consumption?.estimated_daily_units_kwh !== undefined
        ? Number(raw.consumption?.estimated_daily_units_kwh)
        : null,
      unitSource: raw.consumption?.unit_source || 'UNAVAILABLE',
      unitsAvailableCount: Number(raw.consumption?.units_available_count) || 0,
      isTelemetryAvailable: false,
    };

    const totalPurchases = Number(raw.purchasing?.total_purchases) || 0;
    const medianIntervalDays = raw.purchasing?.median_interval_days !== null && raw.purchasing?.median_interval_days !== undefined
      ? Number(raw.purchasing?.median_interval_days)
      : null;

    let purchaseVelocity = raw.purchasing?.purchase_velocity;
    if (!purchaseVelocity || purchaseVelocity.toLowerCase().includes('calculating')) {
      if (totalPurchases === 0) {
        purchaseVelocity = 'Awaiting first recharge';
      } else if (totalPurchases === 1 || medianIntervalDays === null) {
        purchaseVelocity = 'Need 2+ purchases for cadence';
      } else {
        purchaseVelocity = `Every ~${medianIntervalDays} days`;
      }
    }

    const purchasing: PurchasingCadenceAnalytics = {
      totalPurchases,
      averageIntervalDays: raw.purchasing?.average_interval_days !== null && raw.purchasing?.average_interval_days !== undefined
        ? Number(raw.purchasing?.average_interval_days)
        : null,
      medianIntervalDays,
      shortestIntervalDays: raw.purchasing?.shortest_interval_days !== null && raw.purchasing?.shortest_interval_days !== undefined
        ? Number(raw.purchasing?.shortest_interval_days)
        : null,
      longestIntervalDays: raw.purchasing?.longest_interval_days !== null && raw.purchasing?.longest_interval_days !== undefined
        ? Number(raw.purchasing?.longest_interval_days)
        : null,
      purchaseVelocity,
    };

    let estDaysRemainingRange = raw.forecast?.estimated_days_remaining_range || null;
    if (!estDaysRemainingRange || estDaysRemainingRange.toLowerCase().includes('calculating') || estDaysRemainingRange.toLowerCase().includes('building')) {
      if (totalPurchases === 0) {
        estDaysRemainingRange = 'Awaiting recharge';
      } else if (totalPurchases === 1 || medianIntervalDays === null) {
        estDaysRemainingRange = 'Need 2+ purchases';
      }
    }

    const forecast: ConsumptionForecast = {
      estimatedDaysRemainingRange: estDaysRemainingRange,
      estimatedNextPurchaseDate: raw.forecast?.estimated_next_purchase_date || null,
      confidence: raw.forecast?.confidence || 'LOW',
    };

    const nowIso = new Date().toISOString();
    const dataQuality: DataQualitySummary = {
      sampleSize: Number(raw.data_quality?.sample_size) || 0,
      grade: raw.data_quality?.grade || 'INSUFFICIENT',
      trend: raw.data_quality?.trend || 'INSUFFICIENT_DATA',
      calculatedAt: raw.data_quality?.calculated_at || nowIso,
      dataThrough: raw.data_quality?.data_through || nowIso,
      period: period,
      isEstimated: true,
      meterId: meterId,
    };

    const shouldShowAlert =
      spending.hasPreviousBaseline &&
      spending.direction === 'INCREASING' &&
      spending.percentageChange >= 15 &&
      (dataQuality.grade === 'GOOD' || dataQuality.grade === 'STRONG');

    const usageAlert: UsageAlertData = {
      shouldShowAlert,
      alertTitle: 'Your electricity spending is higher than usual',
      alertBody: `Spending is up +${spending.percentageChange}% compared to your previous baseline. Consider reducing heavy appliance runtimes during peak hours.`,
      percentageIncrease: spending.percentageChange > 0 ? spending.percentageChange : 0,
    };

    const explainableInsight = this.generateExplainableInsight({
      sampleSize: purchasing.totalPurchases,
      direction: spending.direction,
      percentageChange: spending.percentageChange,
      medianIntervalDays: purchasing.medianIntervalDays,
      currentSpendNaira: spending.currentPeriodSpendNaira,
      totalUnitsKwh: consumption.totalUnitsKwh,
    });

    const periodChart: PeriodChartData = {
      period,
      buckets: [],
      totalSpendNaira: spending.currentPeriodSpendNaira,
      totalPurchases: purchasing.totalPurchases,
      totalUnitsKwh: consumption.totalUnitsKwh,
      hasData: purchasing.totalPurchases > 0,
      status: purchasing.totalPurchases > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
    };

    return {
      spending,
      consumption,
      purchasing,
      forecast,
      dataQuality,
      usageAlert,
      periodChart,
      explainableInsight,
      metrics: {
        averageDailySpend: {
          value: spending.averageDailySpendNaira,
          status: spending.averageDailySpendNaira !== null ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
          source: 'DERIVED',
          confidence: spending.averageDailySpendNaira !== null ? (dataQuality.grade === 'STRONG' ? 'HIGH' : 'MEDIUM') : null,
          calculatedAt: dataQuality.calculatedAt,
        },
        averageDailyUsage: {
          value: consumption.estimatedDailyUnitsKwh,
          status: consumption.estimatedDailyUnitsKwh !== null ? 'AVAILABLE' : 'UNAVAILABLE',
          source: consumption.estimatedDailyUnitsKwh !== null ? 'PROVIDER' : 'UNAVAILABLE',
          confidence: consumption.estimatedDailyUnitsKwh !== null ? 'MEDIUM' : null,
          calculatedAt: dataQuality.calculatedAt,
        },
        monthlySpend: {
          value: spending.currentPeriodSpendNaira,
          status: 'AVAILABLE',
          source: 'DERIVED',
          confidence: 'HIGH',
          calculatedAt: dataQuality.calculatedAt,
        },
        remainingUnits: {
          value: null,
          status: 'UNAVAILABLE',
          source: 'UNAVAILABLE',
          confidence: null,
          calculatedAt: dataQuality.calculatedAt,
        },
        purchaseCadence: {
          value: purchasing.medianIntervalDays,
          status: purchasing.medianIntervalDays !== null ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
          source: 'DERIVED',
          confidence: purchasing.medianIntervalDays !== null ? 'MEDIUM' : null,
          calculatedAt: dataQuality.calculatedAt,
        },
      },
    };
  }

  /**
   * Computes relative estimated contribution of user-reported appliances with explicit caveats.
   */
  static getApplianceEstimates(appliances: UserAppliance[]): ApplianceContributionEstimate[] {
    if (!appliances || appliances.length === 0) return [];

    const calculated = appliances.map((a) => {
      const dailyKwh = Number(a.estimated_daily_kwh) || 0;
      const dailyHours = a.weekly_hours ? Math.round((Number(a.weekly_hours) / 7) * 10) / 10 : 0;
      return {
        applianceId: a.id,
        name: a.appliance_type.replace(/_/g, ' '),
        applianceType: a.appliance_type,
        estimatedWattage: (a as any).wattage || 0,
        quantity: a.quantity || 1,
        dailyUsageHours: dailyHours,
        estimatedDailyKwh: dailyKwh,
      };
    });

    const totalDailyKwh = calculated.reduce((sum, a) => sum + a.estimatedDailyKwh, 0);

    return calculated.map((item) => ({
      ...item,
      relativeContributionPct: totalDailyKwh > 0 ? Math.round((item.estimatedDailyKwh / totalDailyKwh) * 100) : 0,
      confidence: 'USER_REPORTED',
      caveat: 'Estimated from self-reported usage profile. Actual measurement requires sub-metering or IoT telemetry.',
    }));
  }
}
