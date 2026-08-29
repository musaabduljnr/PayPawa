export interface EnergyInsightsData {
  estimatedDaysLeft: number;
  monthlySpendNaira: number;
  totalUnitsKwh: number;
  dailyAverageKwh: number;
  spendingChangePct: number;
  unitsChangePct: number;
}

export class AnalyticsService {
  /**
   * Retrieves aggregated consumption statistics and bento insights.
   */
  static async getInsights(userId: string): Promise<EnergyInsightsData> {
    return {
      estimatedDaysLeft: 12,
      monthlySpendNaira: 24500,
      totalUnitsKwh: 114,
      dailyAverageKwh: 3.8,
      spendingChangePct: 12,
      unitsChangePct: 8,
    };
  }

  /**
   * Period trend datasets for analytics charts.
   */
  static getChartData() {
    return {
      W: [60, 80, 45, 90, 70, 55, 75],
      M: [50, 70, 60, 80, 55, 90, 65, 70, 50, 85, 60, 75, 40, 88, 72, 66, 55, 80, 70, 60, 75, 82, 55, 65, 78, 72, 68, 85, 77, 60],
      Y: [70, 60, 80, 75, 90, 65, 70, 85, 60, 75, 80, 72],
    };
  }
}
