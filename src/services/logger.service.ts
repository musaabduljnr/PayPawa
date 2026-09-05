import { CorrelationService } from './correlation.service';
import type {
  LogLevel,
  ErrorCategory,
  StructuredLogEntry,
  AlertSeverity,
} from '@/types/observability';
import { supabase } from './supabase';

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /authorization/i,
  /bearer/i,
  /cookie/i,
  /cvv/i,
  /pin/i,
  /card.*number/i,
  /private.*key/i,
  /access.*token/i,
  /refresh.*token/i,
  /api.*key/i,
];

export class LoggerService {
  private static environment: 'development' | 'staging' | 'production' =
    (process.env.EXPO_PUBLIC_APP_ENV as any) ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  private static inMemoryBuffer: StructuredLogEntry[] = [];
  private static readonly MAX_BUFFER_SIZE = 100;
  private static lastLogSignature: string = '';
  private static lastLogTimestamp: number = 0;

  /**
   * Recursively sanitizes data objects, replacing sensitive strings with [REDACTED].
   * Also masks electricity STS tokens so plain text tokens never leak.
   */
  static sanitize<T>(obj: T, depth = 0): T {
    if (!obj || depth > 5) return obj;

    if (typeof obj === 'string') {
      // Mask 20-digit electricity tokens: e.g. 26832663990919393911 -> •••• •••• •••• •••• 3911
      const cleanDigits = obj.replace(/[^0-9]/g, '');
      if (cleanDigits.length === 20) {
        return `•••• •••• •••• •••• ${cleanDigits.slice(-4)}` as unknown as T;
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitize(item, depth + 1)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pat) => pat.test(key));
        if (isSensitiveKey) {
          result[key] = '[REDACTED]';
        } else if (key.toLowerCase() === 'token' && typeof value === 'string') {
          const digits = value.replace(/[^0-9]/g, '');
          result[key] = digits.length >= 16 ? `•••• •••• •••• •••• ${digits.slice(-4)}` : '[REDACTED_TOKEN]';
        } else {
          result[key] = this.sanitize(value, depth + 1);
        }
      }
      return result as T;
    }

    return obj;
  }

  /**
   * Core structured logging function.
   */
  static log(
    severity: LogLevel,
    service: string,
    event: string,
    options: {
      message?: string;
      correlationId?: string;
      userId?: string | null;
      meterId?: string | null;
      internalTransactionId?: string | null;
      providerReference?: string | null;
      errorCode?: ErrorCategory | string | null;
      durationMs?: number | null;
      status?: string | null;
      metadata?: Record<string, any> | null;
    } = {}
  ): StructuredLogEntry {
    const correlationId = options.correlationId || CorrelationService.getActiveId();
    const sanitizedMetadata = options.metadata ? this.sanitize(options.metadata) : null;

    // Anti-spam de-duplication: suppress identical logs occurring within 500ms
    const signature = `${severity}:${service}:${event}:${options.message || ''}:${options.internalTransactionId || ''}`;
    const now = Date.now();
    if (signature === this.lastLogSignature && now - this.lastLogTimestamp < 500) {
      return this.inMemoryBuffer[0] || ({} as StructuredLogEntry);
    }
    this.lastLogSignature = signature;
    this.lastLogTimestamp = now;

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      environment: this.environment,
      service,
      severity,
      event,
      correlationId,
      userId: options.userId || null,
      meterId: options.meterId || null,
      internalTransactionId: options.internalTransactionId || null,
      providerReference: options.providerReference || null,
      errorCode: options.errorCode || null,
      durationMs: options.durationMs || null,
      status: options.status || null,
      message: options.message || undefined,
      metadata: sanitizedMetadata,
    };

    // Store in circular buffer
    this.inMemoryBuffer.unshift(entry);
    if (this.inMemoryBuffer.length > this.MAX_BUFFER_SIZE) {
      this.inMemoryBuffer.pop();
    }

    // Output to console with severity differentiation
    const prefix = `[${entry.severity.toUpperCase()}] [${entry.service}] [${entry.event}] (${entry.correlationId})`;
    const body = `${entry.message ? ` - ${entry.message}` : ''}${entry.durationMs ? ` (${entry.durationMs}ms)` : ''}`;

    if (severity === 'critical' || severity === 'error') {
      console.error(prefix + body, entry.metadata || '');
    } else if (severity === 'warn') {
      console.warn(prefix + body, entry.metadata || '');
    } else {
      console.log(prefix + body);
    }

    // High and Critical severity alerts record to system_alert_events table asynchronously
    if ((severity === 'critical' || severity === 'error') && this.environment !== 'development') {
      this.recordDatabaseAlert(entry).catch(() => {});
    }

    return entry;
  }

  static debug(service: string, event: string, options?: Parameters<typeof LoggerService.log>[3]) {
    return this.log('debug', service, event, options);
  }

  static info(service: string, event: string, options?: Parameters<typeof LoggerService.log>[3]) {
    return this.log('info', service, event, options);
  }

  static warn(service: string, event: string, options?: Parameters<typeof LoggerService.log>[3]) {
    return this.log('warn', service, event, options);
  }

  static error(service: string, event: string, options?: Parameters<typeof LoggerService.log>[3]) {
    return this.log('error', service, event, options);
  }

  static critical(service: string, event: string, options?: Parameters<typeof LoggerService.log>[3]) {
    return this.log('critical', service, event, options);
  }

  /**
   * Retrieves recent structured logs from in-memory ring buffer.
   */
  static getRecentLogs(): StructuredLogEntry[] {
    return [...this.inMemoryBuffer];
  }

  /**
   * Clears circular log buffer (useful for test isolation).
   */
  static clearLogs(): void {
    this.inMemoryBuffer = [];
    this.lastLogSignature = '';
    this.lastLogTimestamp = 0;
  }

  /**
   * Asynchronously emits critical alerts to Supabase system_alert_events table.
   */
  private static async recordDatabaseAlert(entry: StructuredLogEntry): Promise<void> {
    try {
      let dbSeverity: AlertSeverity = 'medium';
      if (entry.severity === 'critical') dbSeverity = 'critical';
      else if (entry.severity === 'error') dbSeverity = 'high';

      await (supabase.from('system_alert_events') as any).insert({
        severity: dbSeverity,
        category: 'FINANCIAL',
        event_type: entry.event,
        message: entry.message || entry.event,
        correlation_id: entry.correlationId,
        user_id: entry.userId || null,
        meter_id: entry.meterId || null,
        transaction_id: entry.internalTransactionId || null,
        metadata: entry.metadata || {},
      });
    } catch {
      // Non-fatal if database alert insert fails
    }
  }
}
