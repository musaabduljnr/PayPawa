import {
  DataSourceType,
  DataQualityGrade,
  TrendDirection,
  ConfidenceScore,
  SpendingAnalytics,
  UnitConsumptionAnalytics,
  PurchasingCadenceAnalytics,
  ConsumptionForecast,
  ApplianceContributionEstimate,
} from './consumption';

export type AIProviderType = 'gemini' | 'openai' | 'openrouter' | 'mock';

export type InsightType =
  | 'SPENDING_SUMMARY'
  | 'SPENDING_CHANGE'
  | 'CONSUMPTION_CHANGE'
  | 'PURCHASE_PATTERN'
  | 'APPLIANCE_INSIGHT'
  | 'FORECAST'
  | 'COST_REDUCTION'
  | 'GENERAL_ENERGY'
  | 'INSUFFICIENT_DATA';

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT_DATA';

/**
 * Compact, privacy-sanitized energy context constructed from Phase 7 analytics.
 */
export interface EnergyContext {
  user: {
    id: string;
    accountType: string;
    name?: string;
  };
  meter: {
    id: string | null;
    name?: string;
    meterNumber?: string;
    discoCode?: string;
    discoName?: string;
    meterType?: string;
  };
  period: {
    key: '7d' | '30d' | '90d' | '1y';
    startDate: string;
    endDate: string;
  };
  spending: SpendingAnalytics;
  consumption: UnitConsumptionAnalytics;
  purchasing: PurchasingCadenceAnalytics;
  forecast: ConsumptionForecast;
  appliances: {
    totalEstimatedDailyKwh: number;
    items: ApplianceContributionEstimate[];
    count: number;
    isSelfReported: boolean;
  };
  dataQuality: {
    grade: DataQualityGrade;
    sampleSize: number;
    unitSource: DataSourceType;
    hasContinuousHistory: boolean;
  };
  recentPurchases: Array<{
    amountNaira: number;
    unitsKwh: number | null;
    date: string;
    daysSinceLastPurchase?: number;
  }>;
  dataFreshness: {
    calculatedAt: string;
    dataThrough: string;
    isStale: boolean;
  };
}

/**
 * Enforced structured output format from AI providers.
 */
export interface StructuredAIResponse {
  answer: string;
  insightType: InsightType;
  confidence: ConfidenceLevel;
  evidence: string[];
  recommendations: string[];
  limitations: string[];
  isGroundTruthGrounded: boolean;
  dataQualityGrade: DataQualityGrade;
  disclaimer?: string;
}

/**
 * Chat message representation for UI and persistence.
 */
export interface AIChatMessage {
  id: string;
  conversationId: string;
  userId: string;
  meterId: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  structuredResponse?: StructuredAIResponse;
  insightType?: InsightType;
  confidence?: ConfidenceLevel;
  evidence?: string[];
  recommendations?: string[];
  limitations?: string[];
  isHelpful?: boolean | null;
  feedbackReason?: string | null;
  createdAt: string;
}

/**
 * Suggested question item tailored to user's real data state.
 */
export interface SuggestedQuestion {
  id: string;
  question: string;
  category: InsightType;
  isAvailableForData: boolean;
  unavailabilityReason?: string;
}

/**
 * User query options for AI energy assistant.
 */
export interface AIQueryOptions {
  question: string;
  meterId?: string | null;
  period?: '7d' | '30d' | '90d' | '1y';
  conversationId?: string;
  forceDeterministic?: boolean;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Audit telemetry record.
 */
export interface AIAuditRecord {
  userId: string;
  meterId?: string | null;
  requestType: string;
  provider: AIProviderType;
  model: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  estimatedCostUsd?: number;
  success: boolean;
  errorMessage?: string;
}

/**
 * User feedback submission payload.
 */
export interface AIFeedbackPayload {
  messageId: string;
  isHelpful: boolean;
  reason?: string;
}

export type StatStatus =
  | 'ACTUAL'
  | 'AI_CALCULATED'
  | 'ESTIMATED'
  | 'INSUFFICIENT_DATA'
  | 'UNAVAILABLE'
  | 'ERROR';

export type AIEngineHealthStatus =
  | 'CONNECTED'
  | 'AUTHENTICATION_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'UNAVAILABLE';

export interface AIStatMetric<T = number> {
  value: T | null;
  unit?: string;
  status: StatStatus;
  currency?: string;
  rangeText?: string;
  context?: string;
}

export interface StructuredInsightsAnalytics {
  dataQuality: {
    grade: DataQualityGrade;
    sampleSize: number;
    status: StatStatus;
  };
  averageDailyUsage: AIStatMetric<number>;
  estimatedDaysRemaining: AIStatMetric<number>;
  sevenDaySpend: AIStatMetric<number>;
  periodSpend: AIStatMetric<number>;
  unitsVended: AIStatMetric<number>;
  purchaseFrequency: AIStatMetric<number>;
  purchaseCadence: AIStatMetric<number>;
  consumptionTrend: {
    direction: TrendDirection;
    percentageChange: number;
    status: StatStatus;
  };
  confidence: ConfidenceLevel;
  explanation: string;
  insights: string[];
  recommendations: string[];
  limitations: string[];
  metadata: {
    requestId: string;
    provider: string;
    model: string;
    calculatedAt: string;
    latencyMs: number;
    isAiCalculated: boolean;
  };
}
