import { EnergyContextBuilder } from './energy-context-builder';
import { AIProviderFactory } from './ai-provider.factory';
import { AIGuardrails } from './ai-guardrails';
import { AI_CONFIG } from './ai-config';
import {
  StructuredInsightsAnalytics,
  AIEngineHealthStatus,
  EnergyContext,
} from '@/types/ai';

export interface AIAnalyticsEngineOptions {
  forceDeterministic?: boolean;
  requestId?: string;
}

export class AIAnalyticsEngine {
  private static requestHistory: Array<{
    requestId: string;
    timestamp: string;
    provider: string;
    model: string;
    durationMs: number;
    success: boolean;
    error?: string;
  }> = [];

  /**
   * Performs an internal health-check verifying AI provider initialization,
   * ping connectivity, response validation, and returns an explicit status.
   */
  static async checkHealth(): Promise<{
    status: AIEngineHealthStatus;
    provider: string;
    model: string;
    message: string;
    latencyMs: number;
  }> {
    const provider = AIProviderFactory.getProvider();
    try {
      const result = await provider.checkHealth();
      return {
        status: result.status,
        provider: provider.name,
        model: provider.modelName,
        message: result.message,
        latencyMs: result.latencyMs,
      };
    } catch (err: any) {
      return {
        status: 'UNAVAILABLE',
        provider: provider.name,
        model: provider.modelName,
        message: err.message || 'AI health check failed',
        latencyMs: 0,
      };
    }
  }

  /**
   * Exposes runtime diagnostics for developer/admin verification.
   */
  static getDiagnostics() {
    const provider = AIProviderFactory.getProvider();
    // Security Hardening: Never bundle AI secret keys into client bundles
    const geminiKey = process.env.GEMINI_API_KEY;
    const isKeyConfigured = Boolean(geminiKey && !geminiKey.includes('your_google_gemini'));

    return {
      activeProvider: provider.name,
      configuredModel: provider.modelName,
      isKeyConfigured,
      keyMasked: isKeyConfigured ? `${geminiKey!.slice(0, 4)}...${geminiKey!.slice(-4)}` : 'NOT_CONFIGURED',
      timeoutMs: AI_CONFIG.gemini.timeoutMs,
      recentRequests: this.requestHistory.slice(-10),
    };
  }

  /**
   * Authoritative calculation layer for PayPawa Insights.
   * Gathers authentic meter data, queries the AI engine with strict schema constraints,
   * validates output against mechanical ground truth, and returns structured statistics.
   */
  static async analyzeMeterData(
    userId: string,
    meterId?: string | null,
    period: '7d' | '30d' | '90d' | '1y' = '30d',
    options?: AIAnalyticsEngineOptions
  ): Promise<StructuredInsightsAnalytics> {
    const startTime = Date.now();
    const requestId = options?.requestId || `AI-REQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // 1. Check scoped cache
    if (!options?.forceDeterministic) {
      const cached = AIGuardrails.getCachedAnalytics(userId, meterId || null, period);
      if (cached) {
        return cached;
      }
    }

    // 2. Prepare authorized, privacy-sanitized EnergyContext
    let context: EnergyContext;
    try {
      context = await EnergyContextBuilder.buildContext(userId, meterId, period);
    } catch (err: any) {
      console.error('[AIAnalyticsEngine] Failed to build EnergyContext:', err);
      return this.createUnavailableAnalytics(requestId, period, err.message);
    }

    // 3. Resolve AI Provider (Gemini primary, deterministic fallback)
    const provider = options?.forceDeterministic
      ? AIProviderFactory.getFallbackProvider()
      : AIProviderFactory.getProvider();

    let rawAnalytics: StructuredInsightsAnalytics | null = null;
    let success = true;
    let errorMessage: string | undefined;

    try {
      rawAnalytics = await provider.generateAnalytics(context, requestId);
    } catch (err: any) {
      console.warn(`[AIAnalyticsEngine] Primary provider ${provider.name} failed:`, err.message);
      errorMessage = err.message;

      // Fallback to deterministic rules engine
      try {
        const fallback = AIProviderFactory.getFallbackProvider();
        rawAnalytics = await fallback.generateAnalytics(context, requestId);
      } catch (fallbackErr: any) {
        console.error('[AIAnalyticsEngine] Fallback provider also failed:', fallbackErr);
        success = false;
        return this.createUnavailableAnalytics(requestId, period, fallbackErr.message);
      }
    }

    // 4. Validate output against source records
    let finalAnalytics: StructuredInsightsAnalytics;
    if (rawAnalytics) {
      const validation = AIGuardrails.validateAnalytics(rawAnalytics, context);
      if (validation.isValid && validation.sanitizedAnalytics) {
        finalAnalytics = validation.sanitizedAnalytics;
      } else {
        console.warn('[AIAnalyticsEngine] Validation rejected AI output, applying deterministic fallback:', validation.rejectionReason);
        const fallback = AIProviderFactory.getFallbackProvider();
        finalAnalytics = await fallback.generateAnalytics(context, requestId);
      }
    } else {
      finalAnalytics = this.createUnavailableAnalytics(requestId, period, 'No analytics returned');
    }

    // 5. Record observability telemetry
    const durationMs = Date.now() - startTime;
    this.requestHistory.push({
      requestId,
      timestamp: new Date().toISOString(),
      provider: finalAnalytics.metadata.provider,
      model: finalAnalytics.metadata.model,
      durationMs,
      success,
      error: errorMessage,
    });

    // 6. Cache valid result
    AIGuardrails.setCachedAnalytics(userId, meterId || null, period, finalAnalytics);

    return finalAnalytics;
  }

  /**
   * Invalidates cached analytics for a user (e.g. after a purchase).
   */
  static invalidateUserCache(userId: string): void {
    AIGuardrails.invalidateUserCache(userId);
  }

  private static createUnavailableAnalytics(
    requestId: string,
    period: string,
    errorReason?: string
  ): StructuredInsightsAnalytics {
    return {
      dataQuality: {
        grade: 'INSUFFICIENT',
        sampleSize: 0,
        status: 'UNAVAILABLE',
      },
      averageDailyUsage: { value: null, unit: 'kWh/day', status: 'UNAVAILABLE' },
      estimatedDaysRemaining: { value: null, unit: 'days', status: 'UNAVAILABLE' },
      sevenDaySpend: { value: null, currency: 'NGN', status: 'UNAVAILABLE' },
      periodSpend: { value: null, currency: 'NGN', status: 'UNAVAILABLE' },
      unitsVended: { value: null, unit: 'kWh', status: 'UNAVAILABLE' },
      purchaseFrequency: { value: null, unit: 'purchases', status: 'UNAVAILABLE' },
      purchaseCadence: { value: null, unit: 'days', status: 'UNAVAILABLE', rangeText: 'Data unavailable' },
      consumptionTrend: { direction: 'INSUFFICIENT_DATA', percentageChange: 0, status: 'UNAVAILABLE' },
      confidence: 'INSUFFICIENT_DATA',
      explanation: errorReason || 'Energy analytics currently unavailable.',
      insights: ['Please check your internet connection or verify meter data.'],
      recommendations: [],
      limitations: ['Analytics engine offline or data unreachable.'],
      metadata: {
        requestId,
        provider: 'fallback',
        model: 'unavailable',
        calculatedAt: new Date().toISOString(),
        latencyMs: 0,
        isAiCalculated: false,
      },
    };
  }
}
