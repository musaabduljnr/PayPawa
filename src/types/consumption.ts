/**
 * Phase 7 & 8A: Consumption Intelligence Engine — Type Definitions
 * 
 * Establishes strict data lineage, confidence grading, data source classification,
 * purchase interval metrics, honest provenance, and consumption analytics schemas.
 */

import { AnalyticsValue, PeriodChartData } from './analytics';

export * from './analytics';

export type DataSourceType =
  | 'PROVIDER'        // Authoritative data returned directly by utility gateway/DISCO
  | 'USER_REPORTED'   // User-entered manual meter readings or appliance surveys
  | 'METER'           // Direct hardware/smart-meter telemetry
  | 'IOT'             // Sub-meter or smart plug IoT stream
  | 'ESTIMATED'       // Derived statistical estimates from purchase frequency/cadence
  | 'INFERRED'        // Indirect machine learning or appliance decomposition
  | 'UNAVAILABLE';    // Real metric is missing; not fabricated

export type DataQualityGrade = 'INSUFFICIENT' | 'LIMITED' | 'GOOD' | 'STRONG';

export type TrendDirection = 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';

export type ConfidenceScore = 'HIGH' | 'MEDIUM' | 'LOW';

export type ConsumptionEventType = 'PURCHASE' | 'METER_READING' | 'ESTIMATED_USAGE' | 'ADJUSTMENT';

export interface ConsumptionEvent {
  id: string;
  userId: string;
  meterId: string | null;
  transactionId?: string | null;
  eventType: ConsumptionEventType;
  unitsKwh: number | null;
  unitsSource: DataSourceType;
  amountKobo: number;
  currency: string;
  confidence: number;
  occurredAt: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface MeterReading {
  id: string;
  userId: string;
  meterId: string;
  readingValue: number;
  unit: string;
  readingType: 'cumulative' | 'interval' | 'delta';
  source: DataSourceType;
  isAnomalous: boolean;
  anomalyReason?: string | null;
  recordedAt: string;
  createdAt: string;
}

export interface SpendingAnalytics {
  currentPeriodSpendNaira: number;
  previousPeriodSpendNaira: number;
  percentageChange: number;
  direction: TrendDirection;
  hasPreviousBaseline: boolean;
  averageDailySpendNaira: number | null;
}

export interface UnitConsumptionAnalytics {
  totalUnitsKwh: number | null;
  estimatedDailyUnitsKwh: number | null;
  unitSource: DataSourceType;
  unitsAvailableCount: number;
  isTelemetryAvailable: boolean;
}

export interface PurchasingCadenceAnalytics {
  totalPurchases: number;
  averageIntervalDays: number | null;
  medianIntervalDays: number | null;
  shortestIntervalDays: number | null;
  longestIntervalDays: number | null;
  purchaseVelocity: string; // e.g. "Every ~8.5 days" or "Cadence calculating..."
}

export interface ConsumptionForecast {
  estimatedDaysRemainingRange: string | null; // e.g. "7–10 days"
  estimatedNextPurchaseDate: string | null;
  confidence: ConfidenceScore;
}

export interface UsageAlertData {
  shouldShowAlert: boolean;
  alertTitle: string;
  alertBody: string;
  percentageIncrease: number;
}

export interface DataQualitySummary {
  sampleSize: number;
  grade: DataQualityGrade;
  trend: TrendDirection;
  calculatedAt: string;
  dataThrough: string;
  period: '7d' | '30d' | '90d' | '1y' | 'all';
  isEstimated: boolean;
  meterId?: string | null;
}

export interface ConsumptionAnalyticsResponse {
  spending: SpendingAnalytics;
  consumption: UnitConsumptionAnalytics;
  purchasing: PurchasingCadenceAnalytics;
  forecast: ConsumptionForecast;
  dataQuality: DataQualitySummary;
  usageAlert: UsageAlertData;
  periodChart: PeriodChartData;
  explainableInsight: string;
  
  // Strongly-typed Provenance Metrics
  metrics: {
    averageDailySpend: AnalyticsValue<number>;
    averageDailyUsage: AnalyticsValue<number>;
    monthlySpend: AnalyticsValue<number>;
    remainingUnits: AnalyticsValue<number>;
    purchaseCadence: AnalyticsValue<number>;
  };
}

export interface ApplianceContributionEstimate {
  applianceId: string;
  name: string;
  applianceType: string;
  estimatedWattage: number;
  quantity: number;
  dailyUsageHours: number;
  estimatedDailyKwh: number;
  relativeContributionPct: number;
  confidence: DataSourceType; // 'USER_REPORTED' / 'ESTIMATED'
  caveat: string;
}
