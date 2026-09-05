/**
 * ============================================================================
 * PAYPAWA: PHASE 12B OBSERVABILITY, LOGGING & ERROR TRACKING TYPES
 * ============================================================================
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export type ErrorCategory =
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'VALIDATION_ERROR'
  | 'DATABASE_ERROR'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'PAYMENT_VERIFICATION_ERROR'
  | 'WALLET_ERROR'
  | 'TRANSACTION_ERROR'
  | 'ANALYTICS_ERROR'
  | 'AI_ERROR'
  | 'NOTIFICATION_ERROR'
  | 'INTERNAL_ERROR';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export type AlertCategory =
  | 'FINANCIAL'
  | 'PROVIDER'
  | 'SECURITY'
  | 'INFRASTRUCTURE'
  | 'DATABASE';

export interface StructuredLogEntry {
  timestamp: string;
  environment: 'development' | 'staging' | 'production';
  service: string;
  severity: LogLevel;
  event: string;
  correlationId: string;
  userId?: string | null;
  meterId?: string | null;
  internalTransactionId?: string | null;
  providerReference?: string | null;
  errorCode?: ErrorCategory | string | null;
  durationMs?: number | null;
  status?: string | null;
  message?: string;
  metadata?: Record<string, any> | null;
}

export interface SystemHealthReport {
  timestamp: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: { status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs?: number; message?: string };
    squadco: { status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs?: number; message?: string };
    payment: { status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs?: number; message?: string };
    ai: { status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs?: number; message?: string };
    notifications: { status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs?: number; message?: string };
  };
}
