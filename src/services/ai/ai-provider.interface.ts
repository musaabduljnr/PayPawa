import { EnergyContext, StructuredAIResponse, StructuredInsightsAnalytics, AIEngineHealthStatus } from '@/types/ai';

export interface IAIProvider {
  readonly name: string;
  readonly modelName: string;

  /**
   * Generates a grounded, structured AI response using only provided energy context.
   */
  generateResponse(
    context: EnergyContext,
    question: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<StructuredAIResponse>;

  /**
   * Generates comprehensive structured analytics calculated directly from authoritative data.
   */
  generateAnalytics(context: EnergyContext, requestId?: string): Promise<StructuredInsightsAnalytics>;

  /**
   * Verifies connectivity and health of the AI provider.
   */
  checkHealth(): Promise<{ status: AIEngineHealthStatus; message: string; latencyMs: number }>;
}
