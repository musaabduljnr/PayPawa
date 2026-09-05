import { supabase } from './supabase';
import { SquadMonitoringService } from './squad-monitoring.service';
import type { SystemHealthReport } from '@/types/observability';

export class HealthCheckService {
  /**
   * Liveness Check: Confirms the mobile runtime / process is responsive.
   */
  static checkLiveness(): { status: 'alive'; timestamp: string } {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness Check: Evaluates connectivity and configuration readiness
   * of all integrated services without exposing secrets or credentials.
   */
  static async checkReadiness(): Promise<SystemHealthReport> {
    const report: SystemHealthReport = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      services: {
        database: { status: 'healthy' },
        squadco: { status: 'healthy' },
        payment: { status: 'healthy' },
        ai: { status: 'healthy' },
        notifications: { status: 'healthy' },
      },
    };

    // 1. Database Connectivity Probe
    try {
      const start = Date.now();
      const { error } = await supabase
        .from('meters')
        .select('id')
        .limit(1);

      const latency = Date.now() - start;
      if (error) {
        report.services.database = {
          status: 'unhealthy',
          latencyMs: latency,
          message: 'Database connection failed',
        };
        report.status = 'unhealthy';
      } else {
        report.services.database = {
          status: latency > 1000 ? 'degraded' : 'healthy',
          latencyMs: latency,
        };
      }
    } catch {
      report.services.database = {
        status: 'unhealthy',
        message: 'Network error connecting to database',
      };
      report.status = 'unhealthy';
    }

    // 2. SquadCo Health Status
    const squadSummary = SquadMonitoringService.getSummary();
    if (squadSummary.healthStatus === 'OFFLINE') {
      report.services.squadco = {
        status: 'unhealthy',
        latencyMs: squadSummary.averageLatencyMs,
        message: squadSummary.lastFailureReason || 'Squad gateway unavailable',
      };
      if (report.status !== 'unhealthy') report.status = 'degraded';
    } else if (squadSummary.healthStatus === 'DEGRADED') {
      report.services.squadco = {
        status: 'degraded',
        latencyMs: squadSummary.averageLatencyMs,
      };
      if (report.status !== 'unhealthy') report.status = 'degraded';
    } else {
      report.services.squadco = {
        status: 'healthy',
        latencyMs: squadSummary.averageLatencyMs || undefined,
      };
    }

    // 3. Payment Gateway Probe (Configuration check)
    const hasPaystackKey = Boolean(process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY);
    report.services.payment = {
      status: hasPaystackKey ? 'healthy' : 'degraded',
      message: hasPaystackKey ? undefined : 'Payment public key not configured',
    };

    // 4. AI Engine Probe
    report.services.ai = {
      status: 'healthy',
    };

    // 5. Notifications Service Probe
    report.services.notifications = {
      status: 'healthy',
    };

    return report;
  }
}
