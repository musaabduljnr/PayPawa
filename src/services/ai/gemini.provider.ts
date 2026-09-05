import { IAIProvider } from './ai-provider.interface';
import {
  EnergyContext,
  StructuredAIResponse,
  InsightType,
  ConfidenceLevel,
  StructuredInsightsAnalytics,
  AIEngineHealthStatus,
} from '@/types/ai';
import { AI_CONFIG } from './ai-config';

/**
 * Google Gemini AI Provider.
 * Sends compact energy context to Gemini with structured output constraints and system guardrails.
 */
export class GeminiAIProvider implements IAIProvider {
  readonly name = 'gemini';
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(apiKey: string, modelName = AI_CONFIG.gemini.model, timeoutMs = AI_CONFIG.gemini.timeoutMs) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.timeoutMs = timeoutMs;
  }

  async checkHealth(): Promise<{ status: AIEngineHealthStatus; message: string; latencyMs: number }> {
    const startTime = Date.now();
    if (!this.apiKey || this.apiKey.includes('your_google_gemini')) {
      return {
        status: 'CONFIGURATION_ERROR',
        message: 'GEMINI_API_KEY is not configured or contains placeholder.',
        latencyMs: 0,
      };
    }

    const url = `${AI_CONFIG.gemini.endpointBase}/${this.modelName}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with exact JSON: {"status": "ok"}' }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 20 },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return { status: 'AUTHENTICATION_ERROR', message: `Invalid API key (HTTP ${response.status})`, latencyMs };
        }
        if (response.status === 429) {
          return { status: 'RATE_LIMITED', message: 'Quota exceeded / rate limited', latencyMs };
        }
        return { status: 'PROVIDER_ERROR', message: `HTTP ${response.status}`, latencyMs };
      }

      const json = await response.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return { status: 'INVALID_RESPONSE', message: 'Empty response candidate', latencyMs };
      }

      return { status: 'CONNECTED', message: 'Gemini AI engine online and verified.', latencyMs };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      if (err.name === 'AbortError') {
        return { status: 'TIMEOUT', message: 'Health check timed out after 6000ms', latencyMs };
      }
      return { status: 'UNAVAILABLE', message: err.message || 'Network error', latencyMs };
    }
  }

  async generateResponse(
    context: EnergyContext,
    question: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<StructuredAIResponse> {
    const prompt = this.constructPrompt(context, question, history);
    const url = `${AI_CONFIG.gemini.endpointBase}/${this.modelName}:generateContent?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: AI_CONFIG.gemini.temperature,
            topK: AI_CONFIG.gemini.topK,
            topP: AI_CONFIG.gemini.topP,
            maxOutputTokens: AI_CONFIG.gemini.maxOutputTokens,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error (HTTP ${response.status}): ${errText}`);
      }

      const resJson = await response.json();
      const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new Error('Gemini returned an empty response candidate.');
      }

      const parsed = JSON.parse(rawText);
      return this.sanitizeStructuredResponse(parsed, context);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Gemini request timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    }
  }

  async generateAnalytics(context: EnergyContext, requestId = `REQ-${Date.now()}`): Promise<StructuredInsightsAnalytics> {
    const startTime = Date.now();
    const prompt = this.constructAnalyticsPrompt(context);
    const url = `${AI_CONFIG.gemini.endpointBase}/${this.modelName}:generateContent?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1536,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error (HTTP ${response.status}): ${errText}`);
      }

      const resJson = await response.json();
      const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new Error('Gemini returned an empty response candidate.');
      }

      const parsed = JSON.parse(rawText);
      return this.sanitizeStructuredAnalytics(parsed, context, requestId, latencyMs);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Gemini request timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    }
  }

  private constructPrompt(
    context: EnergyContext,
    question: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): string {
    const historyBlock =
      history && history.length > 0
        ? `\nRECENT CONVERSATION HISTORY:\n${history
            .map((h) => `${h.role === 'user' ? 'USER' : 'ASSISTANT'}: ${h.content}`)
            .join('\n')}\n`
        : '';

    return `
You are PayPawa's AI Energy Assistant.
Your job is to help the user understand their electricity spending, purchasing behavior, and consumption patterns using only the verified data supplied by PayPawa.

CRITICAL INSTRUCTIONS & GUARDRAILS:
1. Use ONLY the supplied data in CONTEXT as the source of truth.
2. NEVER invent transactions, meter readings, electricity units, spending, appliance usage, or consumption values.
3. NEVER claim real-time residential consumption or live physical meter telemetry.
4. If the data quality is INSUFFICIENT or sample size is <= 1, clearly explain that there is not enough transaction history to calculate cadence or trends.
5. If answering "Which appliance is likely consuming the most?", use the self-reported appliance items in CONTEXT and explicitly state that appliance breakdowns are ESTIMATES based on reported wattage and hours.
6. If answering "When am I likely to need another token?", cite the calculated median interval and estimated days left range from CONTEXT.
7. If answering "Why did electricity finish faster?", compare the recent purchase interval with typical average interval and spending delta.
8. If answering "How much am I spending?", cite the exact verified period spend in Naira from CONTEXT.
9. Distinguish actual recorded data from estimates and predictions.
10. Return a valid JSON object matching the exact schema specified below. No markdown or conversational wrapper.

CONTEXT:
${JSON.stringify(context, null, 2)}
${historyBlock}
USER QUESTION:
"${question}"

REQUIRED JSON SCHEMA:
{
  "answer": "Clear, concise 1-3 paragraph explanation directly addressing user question",
  "insightType": "SPENDING_SUMMARY | SPENDING_CHANGE | CONSUMPTION_CHANGE | PURCHASE_PATTERN | APPLIANCE_INSIGHT | FORECAST | COST_REDUCTION | GENERAL_ENERGY | INSUFFICIENT_DATA",
  "confidence": "LOW | MEDIUM | HIGH | INSUFFICIENT_DATA",
  "evidence": ["Array of factual bullet points directly derived from CONTEXT"],
  "recommendations": ["Array of practical, safe optimization tips"],
  "limitations": ["Array of honest caveats regarding data source lineage"]
}
`;
  }

  private constructAnalyticsPrompt(context: EnergyContext): string {
    return `
You are the authoritative PayPawa Electricity Consumption Analytics Engine.
Analyze the supplied meter and purchase history to calculate structured energy metrics.

RULES:
1. Use ONLY the supplied data in CONTEXT.
2. NEVER invent transactions, meter readings, electricity units, or spending.
3. NEVER assume missing values.
4. If a statistic cannot be calculated from the supplied data, return null with status "INSUFFICIENT_DATA" or "UNAVAILABLE".
5. Differentiate zero from missing: If ₦0 was spent in the period with qualifying data, return { "value": 0, "status": "ACTUAL" }. If data is missing or insufficient, return { "value": null, "status": "INSUFFICIENT_DATA" }.
6. For cadence, require at least 2 qualifying purchase intervals. If sample size <= 1, return { "value": null, "status": "INSUFFICIENT_DATA" }.
7. Output pure structured JSON matching the schema below. No markdown wrappers or conversational filler.

CONTEXT:
${JSON.stringify(context, null, 2)}

REQUIRED JSON SCHEMA:
{
  "dataQuality": {
    "grade": "STRONG | GOOD | LIMITED | INSUFFICIENT",
    "sampleSize": number,
    "status": "ACTUAL | INSUFFICIENT_DATA"
  },
  "averageDailyUsage": {
    "value": number | null,
    "unit": "kWh/day",
    "status": "AI_CALCULATED | INSUFFICIENT_DATA | UNAVAILABLE"
  },
  "estimatedDaysRemaining": {
    "value": number | null,
    "unit": "days",
    "status": "AI_CALCULATED | INSUFFICIENT_DATA | UNAVAILABLE",
    "rangeText": "e.g. 5–8 days or Need 2+ purchases"
  },
  "sevenDaySpend": {
    "value": number | null,
    "currency": "NGN",
    "status": "ACTUAL | INSUFFICIENT_DATA"
  },
  "periodSpend": {
    "value": number | null,
    "currency": "NGN",
    "status": "ACTUAL | INSUFFICIENT_DATA"
  },
  "unitsVended": {
    "value": number | null,
    "unit": "kWh",
    "status": "ACTUAL | UNAVAILABLE"
  },
  "purchaseFrequency": {
    "value": number | null,
    "unit": "purchases",
    "status": "ACTUAL"
  },
  "purchaseCadence": {
    "value": number | null,
    "unit": "days",
    "status": "AI_CALCULATED | INSUFFICIENT_DATA",
    "rangeText": "e.g. Every ~5 days or Need 2+ purchases for cadence"
  },
  "consumptionTrend": {
    "direction": "INCREASING | DECREASING | STABLE | INSUFFICIENT_DATA",
    "percentageChange": number,
    "status": "AI_CALCULATED | INSUFFICIENT_DATA"
  },
  "confidence": "HIGH | MEDIUM | LOW | INSUFFICIENT_DATA",
  "explanation": "Concise summary of verified energy consumption and cadence.",
  "insights": ["Array of factual insights derived directly from data"],
  "recommendations": ["Array of energy efficiency recommendations"],
  "limitations": ["Caveats regarding data quality and sample size"]
}
`;
  }

  private sanitizeStructuredResponse(parsed: any, context: EnergyContext): StructuredAIResponse {
    const validInsightTypes: InsightType[] = [
      'SPENDING_SUMMARY',
      'SPENDING_CHANGE',
      'CONSUMPTION_CHANGE',
      'PURCHASE_PATTERN',
      'APPLIANCE_INSIGHT',
      'FORECAST',
      'COST_REDUCTION',
      'GENERAL_ENERGY',
      'INSUFFICIENT_DATA',
    ];

    const validConf: ConfidenceLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'INSUFFICIENT_DATA'];

    const insightType = validInsightTypes.includes(parsed.insightType) ? parsed.insightType : 'GENERAL_ENERGY';
    const confidence = validConf.includes(parsed.confidence) ? parsed.confidence : 'MEDIUM';

    return {
      answer: typeof parsed.answer === 'string' ? parsed.answer.trim() : 'Data explanation generated.',
      insightType,
      confidence,
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(String) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
      limitations: Array.isArray(parsed.limitations)
        ? parsed.limitations.map(String)
        : ['Calculated from platform transaction records and user-reported profile details.'],
      isGroundTruthGrounded: true,
      dataQualityGrade: context.dataQuality.grade,
    };
  }

  private sanitizeStructuredAnalytics(
    parsed: any,
    context: EnergyContext,
    requestId: string,
    latencyMs: number
  ): StructuredInsightsAnalytics {
    return {
      dataQuality: {
        grade: parsed?.dataQuality?.grade || context.dataQuality.grade,
        sampleSize: Number(parsed?.dataQuality?.sampleSize ?? context.dataQuality.sampleSize),
        status: context.dataQuality.sampleSize > 0 ? 'ACTUAL' : 'INSUFFICIENT_DATA',
      },
      averageDailyUsage: {
        value: typeof parsed?.averageDailyUsage?.value === 'number' ? parsed.averageDailyUsage.value : null,
        unit: 'kWh/day',
        status: parsed?.averageDailyUsage?.status || (context.consumption.estimatedDailyUnitsKwh !== null ? 'AI_CALCULATED' : 'INSUFFICIENT_DATA'),
      },
      estimatedDaysRemaining: {
        value: typeof parsed?.estimatedDaysRemaining?.value === 'number' ? parsed.estimatedDaysRemaining.value : null,
        unit: 'days',
        status: parsed?.estimatedDaysRemaining?.status || (context.purchasing.medianIntervalDays !== null ? 'AI_CALCULATED' : 'INSUFFICIENT_DATA'),
        rangeText: parsed?.estimatedDaysRemaining?.rangeText || context.forecast.estimatedDaysRemainingRange || undefined,
      },
      sevenDaySpend: {
        value: typeof parsed?.sevenDaySpend?.value === 'number' ? parsed.sevenDaySpend.value : context.spending.currentPeriodSpendNaira,
        currency: 'NGN',
        status: 'ACTUAL',
      },
      periodSpend: {
        value: typeof parsed?.periodSpend?.value === 'number' ? parsed.periodSpend.value : context.spending.currentPeriodSpendNaira,
        currency: 'NGN',
        status: 'ACTUAL',
      },
      unitsVended: {
        value: typeof parsed?.unitsVended?.value === 'number' ? parsed.unitsVended.value : context.consumption.totalUnitsKwh,
        unit: 'kWh',
        status: context.consumption.totalUnitsKwh !== null ? 'ACTUAL' : 'UNAVAILABLE',
      },
      purchaseFrequency: {
        value: typeof parsed?.purchaseFrequency?.value === 'number' ? parsed.purchaseFrequency.value : context.purchasing.totalPurchases,
        unit: 'purchases',
        status: 'ACTUAL',
      },
      purchaseCadence: {
        value: typeof parsed?.purchaseCadence?.value === 'number' ? parsed.purchaseCadence.value : context.purchasing.medianIntervalDays,
        unit: 'days',
        status: context.purchasing.medianIntervalDays !== null ? 'AI_CALCULATED' : 'INSUFFICIENT_DATA',
        rangeText: parsed?.purchaseCadence?.rangeText || context.purchasing.purchaseVelocity,
      },
      consumptionTrend: {
        direction: parsed?.consumptionTrend?.direction || context.spending.direction,
        percentageChange: typeof parsed?.consumptionTrend?.percentageChange === 'number' ? parsed.consumptionTrend.percentageChange : context.spending.percentageChange,
        status: context.spending.hasPreviousBaseline ? 'AI_CALCULATED' : 'INSUFFICIENT_DATA',
      },
      confidence: parsed?.confidence || (context.dataQuality.grade === 'STRONG' ? 'HIGH' : context.dataQuality.grade === 'GOOD' ? 'MEDIUM' : 'INSUFFICIENT_DATA'),
      explanation: typeof parsed?.explanation === 'string' ? parsed.explanation : 'Energy analytics computed.',
      insights: Array.isArray(parsed?.insights) ? parsed.insights.map(String) : [],
      recommendations: Array.isArray(parsed?.recommendations) ? parsed.recommendations.map(String) : [],
      limitations: Array.isArray(parsed?.limitations) ? parsed.limitations.map(String) : [],
      metadata: {
        requestId,
        provider: this.name,
        model: this.modelName,
        calculatedAt: new Date().toISOString(),
        latencyMs,
        isAiCalculated: true,
      },
    };
  }
}
