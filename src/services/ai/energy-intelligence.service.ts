import { supabase } from '../supabase';
import { EnergyContextBuilder } from './energy-context-builder';
import { AIProviderFactory } from './ai-provider.factory';
import { AIGuardrails } from './ai-guardrails';
import {
  StructuredAIResponse,
  AIChatMessage,
  SuggestedQuestion,
  AIFeedbackPayload,
  AIQueryOptions,
} from '@/types/ai';

export class EnergyIntelligenceService {
  /**
   * Main entry point for interacting with the AI Energy Assistant.
   */
  static async askAssistant(
    userId: string,
    options: AIQueryOptions
  ): Promise<{ success: boolean; message: AIChatMessage; errorMessage?: string }> {
    const startTime = Date.now();
    const { question, meterId, period = '30d', conversationId } = options;

    // 1. Prompt Injection & Security Sanitization
    const sanitizeResult = AIGuardrails.sanitizeAndValidateQuery(question);
    if (!sanitizeResult.isSafe) {
      const blockedMsg: AIChatMessage = {
        id: `MSG-${Date.now()}`,
        conversationId: conversationId || `CONV-${Date.now()}`,
        userId,
        meterId: meterId || null,
        role: 'assistant',
        content:
          "I cannot process this request. As your energy assistant, I only answer questions related to your electricity spending, consumption patterns, and energy-saving advice.",
        insightType: 'GENERAL_ENERGY',
        confidence: 'HIGH',
        evidence: ['Query flagged by security guardrails.'],
        recommendations: ['Ask about your electricity spending or purchase frequency.'],
        limitations: ['Prompt injection or disallowed commands are rejected.'],
        createdAt: new Date().toISOString(),
      };
      return { success: false, message: blockedMsg, errorMessage: sanitizeResult.reason };
    }

    // 2. Rate Limiting Check
    const rateCheck = AIGuardrails.checkRateLimit(userId);
    if (!rateCheck.isAllowed) {
      const rateMsg: AIChatMessage = {
        id: `MSG-${Date.now()}`,
        conversationId: conversationId || `CONV-${Date.now()}`,
        userId,
        meterId: meterId || null,
        role: 'assistant',
        content: `You've asked several questions in a short period. Please wait ${rateCheck.retryAfterSeconds || 15} seconds before asking your next question.`,
        insightType: 'GENERAL_ENERGY',
        confidence: 'HIGH',
        evidence: ['Rate limit threshold reached.'],
        recommendations: ['Review previous answers while the cooldown expires.'],
        limitations: ['Rate limits protect system availability.'],
        createdAt: new Date().toISOString(),
      };
      return { success: false, message: rateMsg, errorMessage: 'Rate limit exceeded.' };
    }

    // 3. Check Scoped Cache
    if (!options.forceDeterministic) {
      const cached = AIGuardrails.getCachedResponse(userId, meterId || null, period, question);
      if (cached) {
        const cachedMsg: AIChatMessage = {
          id: `MSG-${Date.now()}`,
          conversationId: conversationId || `CONV-${Date.now()}`,
          userId,
          meterId: meterId || null,
          role: 'assistant',
          content: cached.answer,
          structuredResponse: cached,
          insightType: cached.insightType,
          confidence: cached.confidence,
          evidence: cached.evidence,
          recommendations: cached.recommendations,
          limitations: cached.limitations,
          createdAt: new Date().toISOString(),
        };
        return { success: true, message: cachedMsg };
      }
    }

    // 4. Construct Grounded Energy Context
    let context;
    try {
      context = await EnergyContextBuilder.buildContext(userId, meterId, period);
    } catch (err: any) {
      console.error('[EnergyIntelligenceService] Error building context:', err);
      return {
        success: false,
        message: this.createFallbackMessage(
          userId,
          meterId || null,
          conversationId,
          'Unable to assemble energy analytics. Please check your internet connection and try again.'
        ),
        errorMessage: err?.message,
      };
    }

    // 5. Select Provider & Execute Request (with Automatic Fallback)
    let provider = AIProviderFactory.getProvider();
    let rawResponse: StructuredAIResponse | null = null;
    let providerUsed = provider.name;
    let modelUsed = provider.modelName;
    let isSuccess = true;
    let providerError: string | null = null;

    try {
      rawResponse = await provider.generateResponse(context, sanitizeResult.sanitizedQuery, options.history);
    } catch (err: any) {
      console.warn(`[EnergyIntelligenceService] Provider ${provider.name} failed, falling back:`, err.message);
      providerError = err.message;
      try {
        const fallback = AIProviderFactory.getFallbackProvider();
        providerUsed = fallback.name;
        modelUsed = fallback.modelName;
        rawResponse = await fallback.generateResponse(context, sanitizeResult.sanitizedQuery, options.history);
      } catch (fallbackErr: any) {
        console.error('[EnergyIntelligenceService] Fallback provider also failed:', fallbackErr);
        isSuccess = false;
      }
    }

    // 6. Response Validation & Hallucination Guardrails
    let finalResponse: StructuredAIResponse;
    if (rawResponse && isSuccess) {
      const validation = AIGuardrails.validateResponse(rawResponse, context);
      if (validation.isValid && validation.sanitizedResponse) {
        finalResponse = validation.sanitizedResponse;
      } else {
        // Fall back to deterministic answer if model response hallucinated
        console.warn('[EnergyIntelligenceService] Model response failed guardrail check, falling back to deterministic:', validation.rejectionReason);
        const fallback = AIProviderFactory.getFallbackProvider();
        finalResponse = await fallback.generateResponse(context, sanitizeResult.sanitizedQuery, options.history);
      }
    } else {
      const fallback = AIProviderFactory.getFallbackProvider();
      finalResponse = await fallback.generateResponse(context, sanitizeResult.sanitizedQuery, options.history);
    }

    // Cache the verified response
    AIGuardrails.setCachedResponse(userId, meterId || null, period, question, finalResponse);

    // 7. Format Assistant Message
    const assistantMessage: AIChatMessage = {
      id: `MSG-${Date.now()}`,
      conversationId: conversationId || `CONV-${Date.now()}`,
      userId,
      meterId: meterId || null,
      role: 'assistant',
      content: finalResponse.answer,
      structuredResponse: finalResponse,
      insightType: finalResponse.insightType,
      confidence: finalResponse.confidence,
      evidence: finalResponse.evidence,
      recommendations: finalResponse.recommendations,
      limitations: finalResponse.limitations,
      createdAt: new Date().toISOString(),
    };

    // 8. Background Persistence & Operational Telemetry
    const latencyMs = Date.now() - startTime;
    this.persistMessageAndAudit(
      userId,
      meterId || null,
      assistantMessage,
      providerUsed,
      modelUsed,
      latencyMs,
      isSuccess,
      providerError
    );

    return { success: true, message: assistantMessage };
  }

  /**
   * Retrieves suggested questions filtered by user's active data availability.
   */
  static async getSuggestedQuestions(
    userId: string,
    meterId?: string | null
  ): Promise<SuggestedQuestion[]> {
    const context = await EnergyContextBuilder.buildContext(userId, meterId);
    const hasHistory = context.purchasing.totalPurchases >= 2;
    const hasBaseline = context.spending.hasPreviousBaseline;
    const hasAppliances = context.appliances.items.length > 0;

    return [
      {
        id: 'q-finish-faster',
        question: 'Why did my electricity finish faster?',
        category: 'PURCHASE_PATTERN',
        isAvailableForData: hasHistory,
        unavailabilityReason: 'Requires 2+ historical purchases',
      },
      {
        id: 'q-monthly-spend',
        question: 'How much am I spending on electricity?',
        category: 'SPENDING_SUMMARY',
        isAvailableForData: true,
      },
      {
        id: 'q-period-compare',
        question: 'What changed compared with last month?',
        category: 'SPENDING_CHANGE',
        isAvailableForData: hasBaseline,
        unavailabilityReason: 'Requires previous period history',
      },
      {
        id: 'q-appliances',
        question: 'Which appliance is likely consuming the most?',
        category: 'APPLIANCE_INSIGHT',
        isAvailableForData: hasAppliances,
        unavailabilityReason: 'Add appliances in Profile first',
      },
      {
        id: 'q-when-token',
        question: 'When am I likely to need another token?',
        category: 'FORECAST',
        isAvailableForData: hasHistory,
        unavailabilityReason: 'Requires 2+ historical purchases',
      },
      {
        id: 'q-reduce-cost',
        question: 'How can I reduce my electricity cost?',
        category: 'COST_REDUCTION',
        isAvailableForData: true,
      },
    ];
  }

  /**
   * Records user helpfulness rating (thumbs up / down) for an AI response.
   */
  static async recordFeedback(payload: AIFeedbackPayload): Promise<boolean> {
    try {
      await supabase
        .from('ai_messages')
        .update({
          is_helpful: payload.isHelpful,
          feedback_reason: payload.reason || null,
        })
        .eq('id', payload.messageId);
      return true;
    } catch (e) {
      console.warn('[EnergyIntelligenceService] Could not persist feedback to DB:', e);
      return true;
    }
  }

  private static createFallbackMessage(
    userId: string,
    meterId: string | null,
    conversationId: string | undefined,
    fallbackText: string
  ): AIChatMessage {
    return {
      id: `MSG-${Date.now()}`,
      conversationId: conversationId || `CONV-${Date.now()}`,
      userId,
      meterId,
      role: 'assistant',
      content: fallbackText,
      insightType: 'GENERAL_ENERGY',
      confidence: 'LOW',
      evidence: ['Deterministic offline fallback triggered.'],
      recommendations: ['Check that your mobile device is connected to the internet.'],
      limitations: ['Real-time AI explanation was temporarily unavailable.'],
      createdAt: new Date().toISOString(),
    };
  }

  private static async persistMessageAndAudit(
    userId: string,
    meterId: string | null,
    message: AIChatMessage,
    provider: string,
    model: string,
    latencyMs: number,
    success: boolean,
    errorMessage: string | null
  ): Promise<void> {
    try {
      // Log audit telemetry
      await supabase.from('ai_audit_logs').insert({
        user_id: userId,
        meter_id: meterId,
        request_type: message.insightType || 'GENERAL_ENERGY',
        provider,
        model,
        latency_ms: latencyMs,
        success,
        error_message: errorMessage,
      });

      // Save message to conversation table if available
      await supabase.from('ai_messages').insert({
        id: message.id.startsWith('MSG-') ? undefined : message.id,
        conversation_id: message.conversationId || `CONV-${userId}`,
        user_id: userId,
        meter_id: meterId,
        role: message.role,
        content: message.content,
        structured_response: message.structuredResponse as any,
        insight_type: message.insightType,
        confidence: message.confidence,
        evidence: message.evidence as any,
        recommendations: message.recommendations as any,
        limitations: message.limitations as any,
      });
    } catch (e) {
      // Non-fatal if tables are pending migration or schema cache refresh
    }
  }
}
