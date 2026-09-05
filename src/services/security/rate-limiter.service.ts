import { supabase } from '../supabase';
import { LoggerService } from '../logger.service';

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  action: string;
  currentCount: number;
  maxRequests: number;
  windowSeconds: number;
  retryAfterSeconds: number;
}

export const RATE_LIMIT_PROFILES: Record<string, RateLimitConfig> = {
  login: { maxRequests: 5, windowSeconds: 60 },
  password_reset: { maxRequests: 3, windowSeconds: 300 },
  otp_request: { maxRequests: 3, windowSeconds: 120 },
  fund_wallet: { maxRequests: 10, windowSeconds: 60 },
  vend_token: { maxRequests: 5, windowSeconds: 60 },
  lookup_meter: { maxRequests: 20, windowSeconds: 60 },
  ai_prompt: { maxRequests: 10, windowSeconds: 60 },
  admin_action: { maxRequests: 30, windowSeconds: 60 },
};

/**
 * Enterprise Rate Limiting Service
 * 
 * Provides hybrid dual-tier rate limiting:
 * 1. Fast local sliding-window memory limiter.
 * 2. Distributed, persistent PostgreSQL rate_limits table via atomic check_rate_limit stored procedure.
 */
export class RateLimiterService {
  private static memoryStore = new Map<string, { count: number; expiresAt: number }>();

  /**
   * Fast in-memory check (useful for client/edge protection).
   */
  static checkMemoryRateLimit(
    identifier: string,
    action: string,
    customConfig?: RateLimitConfig
  ): RateLimitResult {
    const config = customConfig || RATE_LIMIT_PROFILES[action] || { maxRequests: 30, windowSeconds: 60 };
    const now = Date.now();
    const key = `${action}:${identifier}`;
    const record = this.memoryStore.get(key);

    if (!record || now > record.expiresAt) {
      this.memoryStore.set(key, { count: 1, expiresAt: now + config.windowSeconds * 1000 });
      return {
        allowed: true,
        action,
        currentCount: 1,
        maxRequests: config.maxRequests,
        windowSeconds: config.windowSeconds,
        retryAfterSeconds: 0,
      };
    }

    record.count++;
    const retryAfterSeconds = Math.max(0, Math.ceil((record.expiresAt - now) / 1000));

    if (record.count > config.maxRequests) {
      LoggerService.warn('RATE_LIMIT_EXCEEDED', `Rate limit exceeded for ${action} on ${identifier.slice(0, 8)}... (Count: ${record.count}/${config.maxRequests})`);
      return {
        allowed: false,
        action,
        currentCount: record.count,
        maxRequests: config.maxRequests,
        windowSeconds: config.windowSeconds,
        retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      action,
      currentCount: record.count,
      maxRequests: config.maxRequests,
      windowSeconds: config.windowSeconds,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Distributed database-backed rate limit check using check_rate_limit stored procedure.
   */
  static async checkDatabaseRateLimit(
    identifier: string,
    action: string,
    customConfig?: RateLimitConfig,
    client = supabase
  ): Promise<RateLimitResult> {
    const config = customConfig || RATE_LIMIT_PROFILES[action] || { maxRequests: 30, windowSeconds: 60 };

    try {
      const { data, error } = await (client.rpc as any)('check_rate_limit', {
        p_identifier: identifier,
        p_action: action,
        p_max_requests: config.maxRequests,
        p_window_seconds: config.windowSeconds,
      });

      if (error || !data) {
        // Fallback to memory limit if database RPC fails
        return this.checkMemoryRateLimit(identifier, action, config);
      }

      return {
        allowed: Boolean(data.allowed),
        action,
        currentCount: Number(data.current_count),
        maxRequests: Number(data.max_requests),
        windowSeconds: Number(data.window_seconds),
        retryAfterSeconds: Number(data.retry_after_seconds || 0),
      };
    } catch {
      return this.checkMemoryRateLimit(identifier, action, config);
    }
  }

  /**
   * Resets in-memory rate limiter (for automated testing).
   */
  static resetMemoryStoreForTesting(): void {
    this.memoryStore.clear();
  }
}
