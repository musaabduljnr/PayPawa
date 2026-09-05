import { ConsumptionAnalyticsService } from './consumption-analytics.service';
import { PeriodChartData } from '@/types/consumption';

export interface EnergyInsightsData {
  estimatedDaysLeft: number | null;
  monthlySpendNaira: number;
  totalUnitsKwh: number | null;
  dailyAverageKwh: number | null;
  spendingChangePct: number;
  unitsChangePct: number | null;
}

/**
 * AnalyticsService - Unified facade delegating to authoritative ConsumptionAnalyticsService.
 * Mock static datasets have been removed.
 */
export class AnalyticsService {
  /**
   * Retrieves aggregated consumption statistics and bento insights from authoritative engine.
   */
  static async getInsights(userId: string, meterId?: string | null): Promise<EnergyInsightsData> {
    const analytics = await ConsumptionAnalyticsService.getConsumptionAnalytics(userId, meterId, '30d');
    return {
      estimatedDaysLeft: analytics.forecast.estimatedDaysRemainingRange ? parseInt(analytics.forecast.estimatedDaysRemainingRange) || null : null,
      monthlySpendNaira: analytics.spending.currentPeriodSpendNaira,
      totalUnitsKwh: analytics.consumption.totalUnitsKwh,
      dailyAverageKwh: analytics.consumption.estimatedDailyUnitsKwh,
      spendingChangePct: analytics.spending.percentageChange,
      unitsChangePct: null,
    };
  }

  /**
   * Authoritative chart data aggregation delegating directly to ConsumptionAnalyticsService.
   */
  static async getChartData(userId: string, meterId?: string | null, period: '7d' | '30d' | '1y' = '7d'): Promise<PeriodChartData> {
    const analytics = await ConsumptionAnalyticsService.getConsumptionAnalytics(userId, meterId, period);
    return analytics.periodChart;
  }
}
