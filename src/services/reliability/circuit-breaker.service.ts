import { LoggerService } from '../logger.service';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type ReliabilityErrorCode =
  | 'NETWORK_TEMPORARY'
  | 'GATEWAY_TIMEOUT'
  | 'PROVIDER_DOWNTIME'
  | 'INVALID_METER'
  | 'INVALID_AMOUNT'
  | 'INSUFFICIENT_FUNDS'
  | 'DUPLICATE_REQUEST'
  | 'PROVIDER_PERMANENT_FAILURE'
  | 'TRANSACTION_STATUS_UNKNOWN';

export interface CircuitBreakerConfig {
  failureThreshold: number; // consecutive failures before opening (default: 5)
  cooldownPeriodMs: number; // time before testing probe in HALF_OPEN (default: 30000ms)
  timeoutMs: number;        // per-call timeout limit (default: 20000ms)
  serviceName: string;      // identifier for metrics and logging
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  consecutiveFailures: number;
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  totalTimeouts: number;
  lastStateChange: string;
  nextAttemptAllowedAt: string | null;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private totalRequests = 0;
  private totalSuccesses = 0;
  private totalFailures = 0;
  private totalTimeouts = 0;
  private lastFailureTime = 0;
  private lastStateChange = Date.now();

  private readonly config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      cooldownPeriodMs: config?.cooldownPeriodMs ?? 30000,
      timeoutMs: config?.timeoutMs ?? 20000,
      serviceName: config?.serviceName ?? 'squad-gateway',
    };
  }

  getState(): CircuitState {
    this.checkCooldown();
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    this.checkCooldown();
    const nextAllowed = this.state === 'OPEN'
      ? new Date(this.lastFailureTime + this.config.cooldownPeriodMs).toISOString()
      : null;

    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      totalRequests: this.totalRequests,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
      totalTimeouts: this.totalTimeouts,
      lastStateChange: new Date(this.lastStateChange).toISOString(),
      nextAttemptAllowedAt: nextAllowed,
    };
  }

  /**
   * Resets breaker state to CLOSED (useful for testing and administrative override).
   */
  reset(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.lastStateChange = Date.now();
    LoggerService.info('circuit-breaker', 'circuit.reset', {
      message: `Circuit reset to CLOSED for ${this.config.serviceName}`,
      metadata: { service: this.config.serviceName, state: 'CLOSED' },
    });
  }

  /**
   * Evaluates if cooldown period has elapsed to transition from OPEN to HALF_OPEN.
   */
  private checkCooldown(): void {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.config.cooldownPeriodMs) {
        this.transitionTo('HALF_OPEN', 'Cooldown period elapsed; allowing probe request');
      }
    }
  }

  private transitionTo(newState: CircuitState, reason: string): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    LoggerService.warn('circuit-breaker', 'circuit.state_transition', {
      message: `Circuit state transition: ${oldState} -> ${newState} (${reason})`,
      metadata: {
        service: this.config.serviceName,
        from: oldState,
        to: newState,
        reason,
        consecutiveFailures: this.consecutiveFailures,
      },
    });
  }

  /**
   * Executes an asynchronous operation through the circuit breaker.
   * If OPEN, fails immediately with PROVIDER_DOWNTIME without hitting network.
   */
  async execute<T>(
    operationName: string,
    operation: (signal: AbortSignal) => Promise<T>,
    fallback?: (error: Error, code: ReliabilityErrorCode) => Promise<T> | T
  ): Promise<T> {
    this.totalRequests++;
    this.checkCooldown();

    if (this.state === 'OPEN') {
      const remainingCooldown = Math.max(
        0,
        Math.ceil((this.lastFailureTime + this.config.cooldownPeriodMs - Date.now()) / 1000)
      );
      const errMsg = `Service ${this.config.serviceName} is currently unavailable (Circuit OPEN). Retry in ${remainingCooldown}s.`;
      
      LoggerService.warn('circuit-breaker', 'circuit.fast_fail', {
        message: errMsg,
        metadata: {
          service: this.config.serviceName,
          operation: operationName,
          remainingCooldownSeconds: remainingCooldown,
        },
      });

      if (fallback) {
        return fallback(new Error(errMsg), 'PROVIDER_DOWNTIME');
      }
      throw new Error(errMsg);
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => {
      controller.abort();
    }, this.config.timeoutMs);

    const startTime = Date.now();

    try {
      const result = await operation(controller.signal);
      clearTimeout(timeoutTimer);

      this.recordSuccess(operationName, Date.now() - startTime);
      return result;
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      const isTimeout = err.name === 'AbortError' || err.message?.toLowerCase().includes('timeout');
      const errorCode = this.classifyError(err, isTimeout);

      this.recordFailure(operationName, err, isTimeout, errorCode);

      if (fallback) {
        return fallback(err, errorCode);
      }
      throw err;
    }
  }

  recordSuccess(operationName: string, durationMs: number): void {
    this.totalSuccesses++;
    this.consecutiveFailures = 0;

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED', `Probe request succeeded for ${operationName} in ${durationMs}ms`);
    }
  }

  recordFailure(
    operationName: string,
    err: Error,
    isTimeout = false,
    errorCode?: ReliabilityErrorCode
  ): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (isTimeout) {
      this.totalTimeouts++;
    }

    const code = errorCode || this.classifyError(err, isTimeout);

    // Certain business errors (like invalid meter number) are NOT system outages
    const isSystemFailure =
      code === 'GATEWAY_TIMEOUT' ||
      code === 'NETWORK_TEMPORARY' ||
      code === 'PROVIDER_DOWNTIME' ||
      code === 'PROVIDER_PERMANENT_FAILURE';

    if (isSystemFailure) {
      this.consecutiveFailures++;
      if (this.state === 'HALF_OPEN') {
        this.transitionTo('OPEN', `Probe request failed for ${operationName}: ${err.message}`);
      } else if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.transitionTo(
          'OPEN',
          `Consecutive system failures (${this.consecutiveFailures}) exceeded threshold (${this.config.failureThreshold})`
        );
      }
    }
  }

  /**
   * Classifies low-level network and API errors into canonical reliability categories.
   */
  classifyError(err: any, isTimeout = false): ReliabilityErrorCode {
    if (isTimeout) return 'GATEWAY_TIMEOUT';

    const msg = (err?.message || '').toLowerCase();
    const code = (err?.code || '').toLowerCase();

    if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('enotfound')) {
      return 'NETWORK_TEMPORARY';
    }
    if (msg.includes('circuit open') || msg.includes('downtime') || msg.includes('503') || msg.includes('502')) {
      return 'PROVIDER_DOWNTIME';
    }
    if (msg.includes('invalid meter') || msg.includes('meter not found')) {
      return 'INVALID_METER';
    }
    if (msg.includes('insufficient') || msg.includes('low balance')) {
      return 'INSUFFICIENT_FUNDS';
    }
    if (msg.includes('minimum') || msg.includes('limit exceeded') || msg.includes('invalid amount')) {
      return 'INVALID_AMOUNT';
    }
    if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('already processed')) {
      return 'DUPLICATE_REQUEST';
    }
    if (msg.includes('reconciliation') || msg.includes('unknown') || msg.includes('status unknown')) {
      return 'TRANSACTION_STATUS_UNKNOWN';
    }

    return 'PROVIDER_PERMANENT_FAILURE';
  }
}

// Singleton Circuit Breaker for SquadCo Utility API
export const SquadCircuitBreaker = new CircuitBreaker({
  serviceName: 'squad-electricity-gateway',
  failureThreshold: 5,
  cooldownPeriodMs: 30000,
  timeoutMs: 25000,
});
