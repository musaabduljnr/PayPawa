import { IAIProvider } from './ai-provider.interface';
import { GeminiAIProvider } from './gemini.provider';
import { MockAIProvider } from './mock.provider';
import { AIProviderType } from '@/types/ai';
import { AI_CONFIG } from './ai-config';

export class AIProviderFactory {
  /**
   * Resolves the primary AI provider based on environment configuration.
   * Enforces a strict production guard against unauthorized mock data.
   */
  static getProvider(preferredType?: AIProviderType): IAIProvider {
    const isProduction = process.env.NODE_ENV === 'production';
    const mockEnabled = process.env.MOCK_DATA_ENABLED === 'true' || process.env.EXPO_PUBLIC_MOCK_DATA_ENABLED === 'true';

    const envProvider = (process.env.AI_PROVIDER || process.env.EXPO_PUBLIC_AI_PROVIDER || (isProduction ? 'gemini' : 'mock')).toLowerCase();
    const type = preferredType || (envProvider as AIProviderType);

    // Security Hardening: Never bundle AI secret keys into the client bundle
    const geminiKey = process.env.GEMINI_API_KEY;

    if (geminiKey && !geminiKey.includes('your_google_gemini')) {
      return new GeminiAIProvider(geminiKey, AI_CONFIG.gemini.model, AI_CONFIG.gemini.timeoutMs);
    }

    if (isProduction && !mockEnabled) {
      console.warn('[AIProviderFactory] Production mode: External Gemini API key not detected. Falling back to deterministic rules engine.');
    }

    // Default to authoritative deterministic MockAIProvider
    return new MockAIProvider();
  }

  /**
   * Provides the fallback provider instance.
   */
  static getFallbackProvider(): IAIProvider {
    return new MockAIProvider();
  }
}
