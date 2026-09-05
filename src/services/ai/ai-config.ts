/**
 * Single Authoritative AI Engine Configuration
 * 
 * Defines the central approved Gemini model, generation parameters,
 * request timeouts, endpoint routes, and security guardrail limits.
 * All AI consumers and providers must reference this configuration.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

export const AI_CONFIG = {
  gemini: {
    // Model identifier: uses env override if provided, otherwise defaults to the approved Gemini 3.5 Flash model
    model: process.env.AI_MODEL || process.env.EXPO_PUBLIC_AI_MODEL || DEFAULT_GEMINI_MODEL,
    endpointBase: 'https://generativelanguage.googleapis.com/v1beta/models',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 12000,
    temperature: 0.2,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 1024,
  },
  provider: {
    defaultType: 'gemini' as const,
    fallbackType: 'mock' as const,
  },
  guardrails: {
    rateLimitPerMinute: 15,
    rateLimitPerDay: 100,
    cacheTtlSeconds: 300,
  },
} as const;

export type AIConfigType = typeof AI_CONFIG;
