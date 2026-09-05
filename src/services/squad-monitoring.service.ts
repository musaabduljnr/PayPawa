import { LoggerService } from './logger.service';
import { supabase } from './supabase';

export interface SquadMetricSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeoutRequests: number;
  averageLatencyMs: number;
  healthStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  lastFailureReason?: string;
  lastSuccessfulAt?: string;
}

export class SquadMonitoringService {
  private static totalRequests = 0;
  private static successfulRequests = 0;
  private static failedRequests = 0;
  private static timeoutRequests = 0;
  private static totalLatencyMs = 0;
  private static consecutiveTimeouts = 0;
  private static lastFailureReason?: string;
  private static lastSuccessfulAt?: string;

  /**
   * Records execution telemetry for an outgoing SquadCo utility operation.
   */
  static recordExecution(params: {
    operation: 'lookup' | 'vend' | 'requery';
    durationMs: number;
    success: boolean;
    status: string;
    isTimeout?: boolean;
    reference?: string;
    errorMessage?: string;
    correlationId?: string;
  }) {
    this.totalRequests++;
    this.totalLatencyMs += params.durationMs;

    if (params.isTimeout) {
      this.timeoutRequests++;
      this.failedRequests++;
      this.consecutiveTimeouts++;
      this.lastFailureReason = 'Gateway Timeout';

      LoggerService.warn('squad-monitoring', 'squad.request.timeout', {
        correlationId: params.correlationId,
        providerReference: params.reference,
        durationMs: params.durationMs,
        message: `Squad ${params.operation} timed out after ${params.durationMs}ms`,
        errorCode: 'PROVIDER_TIMEOUT',
      });
    } else if (params.success) {
      this.successfulRequests++;
      this.consecutiveTimeouts = 0;
      this.lastSuccessfulAt = new Date().toISOString();

      LoggerService.info('squad-monitoring', 'squad.request.success', {
        correlationId: params.correlationId,
        providerReference: params.reference,
        durationMs: params.durationMs,
        status: params.status,
      });
    } else {
      this.failedRequests++;
      this.lastFailureReason = params.errorMessage || 'Vending Failure';

      LoggerService.error('squad-monitoring', 'squad.request.failure', {
        correlationId: params.correlationId,
        providerReference: params.reference,
        durationMs: params.durationMs,
        message: params.errorMessage,
        errorCode: 'PROVIDER_ERROR',
      });
    }

    // Evaluate provider health status
    const health = this.getHealthStatus();

    // Alert if degraded or offline
    if (health === 'OFFLINE' || this.consecutiveTimeouts >= 3) {
      LoggerService.critical('squad-monitoring', 'squad.provider.outage', {
        message: `Squad electricity gateway shows critical degradation (${this.consecutiveTimeouts} consecutive timeouts).`,
        errorCode: 'PROVIDER_TIMEOUT',
      });
    }

    // Periodically update database telemetry asynchronously
    if (this.totalRequests % 5 === 0) {
      this.syncDatabaseTelemetry().catch(() => {});
    }
  }

  /**
   * Computes health status dynamically.
   */
  static getHealthStatus(): 'ONLINE' | 'DEGRADED' | 'OFFLINE' {
    if (this.consecutiveTimeouts >= 3) return 'OFFLINE';
    if (this.totalRequests > 0) {
      const errorRate = this.failedRequests / this.totalRequests;
      if (errorRate > 0.4) return 'OFFLINE';
      if (errorRate > 0.15) return 'DEGRADED';
    }
    return 'ONLINE';
  }

  /**
   * Retrieves summary metric snapshot.
   */
  static getSummary(): SquadMetricSummary {
    const avgLatency = this.totalRequests > 0 ? Math.round(this.totalLatencyMs / this.totalRequests) : 0;
    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      timeoutRequests: this.timeoutRequests,
      averageLatencyMs: avgLatency,
      healthStatus: this.getHealthStatus(),
      lastFailureReason: this.lastFailureReason,
      lastSuccessfulAt: this.lastSuccessfulAt,
    };
  }

  /**
   * Resets local counters (for test suite isolation).
   */
  static reset() {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.timeoutRequests = 0;
    this.totalLatencyMs = 0;
    this.consecutiveTimeouts = 0;
    this.lastFailureReason = undefined;
    this.lastSuccessfulAt = undefined;
  }

  /**
   * Syncs latest metric snapshot to public.provider_health_telemetry.
   */
  private static async syncDatabaseTelemetry(): Promise<void> {
    const summary = this.getSummary();
    const errorPct = this.totalRequests > 0 ? (this.failedRequests / this.totalRequests) * 100 : 0;

    await (supabase.from('provider_health_telemetry') as any).upsert({
      provider_name: 'squad',
      service_type: 'VENDING',
      status: summary.healthStatus,
      last_successful_at: summary.lastSuccessfulAt || null,
      last_failure_at: summary.lastFailureReason ? new Date().toISOString() : null,
      last_error_message: summary.lastFailureReason || null,
      latency_ms: summary.averageLatencyMs,
      error_rate_pct: parseFloat(errorPct.toFixed(2)),
      updated_at: new Date().toISOString(),
    });
  }
}
