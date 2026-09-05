import {
  ElectricityProvider,
  DiscoInfo,
  VerifyMeterRequest,
  VerifyMeterResponse,
  VendTokenRequest,
  VendTokenResponse,
  QueryTransactionRequest,
  QueryTransactionResponse,
} from './ElectricityProvider';
import { normalizeToSquadDisco, NIGERIAN_DISCOS } from './discoMapping';
import { LoggerService } from '../logger.service';
import { CorrelationService } from '../correlation.service';
import { SquadMonitoringService } from '../squad-monitoring.service';
import { SquadCircuitBreaker } from '../reliability/circuit-breaker.service';

/**
 * Squad (by HabariPay / GTCO) Electricity Gateway Implementation
 * 
 * Implements standard ElectricityProvider interface for Squad VAS Utilities.
 * Handles dynamic DISCO discovery, JIT meter lookup to satisfy the two-step
 * vending session requirement, minimum vend guarding, and STS token extraction.
 */
export class SquadProvider implements ElectricityProvider {
  readonly providerName = 'squad';

  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(baseUrl?: string, secretKey?: string) {
    this.baseUrl = (
      baseUrl ||
      process.env.EXPO_PUBLIC_SQUAD_BASE_URL ||
      process.env.SQUAD_BASE_URL ||
      'https://sandbox-api-d.squadco.com'
    ).replace(/\/$/, '');

    // Security Hardening: Never fall back to EXPO_PUBLIC_ prefixed secret keys in client bundles
    this.secretKey =
      secretKey ||
      process.env.SQUAD_SECRET_KEY ||
      '';
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.secretKey) {
      headers['Authorization'] = `Bearer ${this.secretKey}`;
    }
    return headers;
  }

  private formatTokenString(rawToken: string): string {
    const clean = String(rawToken || '').replace(/[^0-9]/g, '');
    if (clean.length === 20) {
      return clean.replace(/(\d{4})(?=\d)/g, '$1 ');
    }
    return rawToken ? String(rawToken).replace(/^Token\s*:\s*/i, '') : '';
  }

  /**
   * Discovers electricity providers dynamically from Squad, with static fallback.
   */
  async getDiscos(): Promise<DiscoInfo[]> {
    if (this.secretKey) {
      try {
        const endpoint = `${this.baseUrl}/vending/utilities/electricity/service-providers`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(endpoint, {
          method: 'GET',
          headers: this.getHeaders(),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const res = await response.json();
        if (res.status === 200 && Array.isArray(res.data)) {
          return res.data.map((item: any) => ({
            code: item.code.toLowerCase(),
            name: item.name,
            shortName: item.code.toUpperCase(),
            serviceID: item.code,
            minAmountKobo: 50000,
            maxAmountKobo: 50000000,
            isAvailable: true,
          }));
        }
      } catch (err) {
        console.warn('[SquadProvider] Failed to fetch live DISCO directory; using fallback catalog:', err);
      }
    }

    return NIGERIAN_DISCOS;
  }

  /**
   * Validates a meter number with the DISCO switch.
   * Extracts customer details and the critical session reference required for vending.
   */
  async verifyMeter(request: VerifyMeterRequest): Promise<VerifyMeterResponse> {
    const sanitizedMeter = (request.meterNumber || '').replace(/\s/g, '');
    const squadDisco = normalizeToSquadDisco(request.discoCode);

    if (!sanitizedMeter || sanitizedMeter.length < 8) {
      return {
        success: false,
        meterNumber: request.meterNumber,
        discoCode: request.discoCode,
        customerName: '',
        address: '',
        meterType: request.meterType,
        errorCode: 'INVALID_METER_NUMBER',
        errorMessage: 'Meter number must be between 8 and 13 digits.',
      };
    }

    const hasLiveKey = Boolean(
      this.secretKey &&
      !this.secretKey.includes('xxxxxxxx') &&
      this.secretKey.trim().length > 10
    );

    const startTime = Date.now();
    const correlationId = CorrelationService.getActiveId();

    if (hasLiveKey) {
      if (SquadCircuitBreaker.getState() === 'OPEN') {
        return {
          success: false,
          meterNumber: sanitizedMeter,
          discoCode: request.discoCode,
          customerName: '',
          address: '',
          meterType: request.meterType,
          errorCode: 'PROVIDER_DOWNTIME',
          errorMessage: 'Electricity provider is currently experiencing temporary downtime. Please retry in a few moments.',
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000);

      try {
        const endpoint = `${this.baseUrl}/vending/utilities/electricity/lookup`;
        LoggerService.info('squad-provider', 'squad.meter.verify_initiated', {
          correlationId,
          metadata: { disco: squadDisco, meter: sanitizedMeter },
        });

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            meter_no: sanitizedMeter,
            meter_type: request.meterType || 'prepaid',
            provider: squadDisco,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        const res = await response.json();

        if (res.status === 200 && res.success && res.data) {
          SquadCircuitBreaker.recordSuccess('lookup', durationMs);
          const d = res.data;
          const minVendNaira = d.minimum_vend ? Number(d.minimum_vend) : undefined;
          const debtNaira = d.outstanding_debt ? Number(d.outstanding_debt) : undefined;

          SquadMonitoringService.recordExecution({
            operation: 'lookup',
            durationMs,
            success: true,
            status: '200',
            reference: d.reference,
            correlationId,
          });

          return {
            success: true,
            meterNumber: sanitizedMeter,
            discoCode: request.discoCode,
            customerName: d.customer_name || 'Verified Customer',
            address: d.address || 'Address on Record',
            meterType: request.meterType,
            tariffCode: d.account_type || undefined,
            minimumVendNaira: minVendNaira,
            outstandingDebtNaira: debtNaira,
            providerSessionRef: d.reference,
            rawResponse: res,
          };
        }

        if (res.status >= 500) {
          SquadCircuitBreaker.recordFailure('lookup', new Error(res.message || 'Server error'), false, 'PROVIDER_DOWNTIME');
        }

        SquadMonitoringService.recordExecution({
          operation: 'lookup',
          durationMs,
          success: false,
          status: String(res.status || 'failed'),
          errorMessage: res.message || 'Lookup rejected',
          correlationId,
        });

        return {
          success: false,
          meterNumber: sanitizedMeter,
          discoCode: request.discoCode,
          customerName: '',
          address: '',
          meterType: request.meterType,
          errorCode: res.status ? `STATUS_${res.status}` : 'LOOKUP_FAILED',
          errorMessage: res.message || 'Unable to verify meter with utility provider.',
          rawResponse: res,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        const isTimeout = err.name === 'AbortError';

        SquadCircuitBreaker.recordFailure('lookup', err, isTimeout, isTimeout ? 'GATEWAY_TIMEOUT' : 'NETWORK_TEMPORARY');

        SquadMonitoringService.recordExecution({
          operation: 'lookup',
          durationMs,
          success: false,
          isTimeout,
          status: isTimeout ? 'timeout' : 'error',
          errorMessage: err.message,
          correlationId,
        });

        return {
          success: false,
          meterNumber: sanitizedMeter,
          discoCode: request.discoCode,
          customerName: '',
          address: '',
          meterType: request.meterType,
          errorCode: isTimeout ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR',
          errorMessage: isTimeout
            ? 'Request timed out while connecting to utility switch.'
            : `Network connection error reaching Squad gateway (${err?.message || 'Check connection'}).`,
        };
      }
    }

    // Squad Sandbox / Development Mode Fallback
    LoggerService.debug('squad-provider', 'squad.meter.sandbox_fallback', {
      correlationId,
      metadata: { meter: sanitizedMeter, disco: squadDisco },
    });

    // Zero-mock production guardrail: Never return mock verification in production
    if (process.env.NODE_ENV === 'production' || process.env.EXPO_PUBLIC_APP_ENV === 'production') {
      return {
        success: false,
        meterNumber: sanitizedMeter,
        discoCode: request.discoCode,
        customerName: '',
        address: '',
        meterType: request.meterType,
        errorCode: 'PROVIDER_CONFIGURATION_ERROR',
        errorMessage: 'Electricity provider credentials are not configured in production.',
      };
    }

    const isDocMeter = sanitizedMeter === '45067198783';
    const isTestMeter = sanitizedMeter === '01429812456';

    // Strict Validation Guard: Reject invalid meter numbers
    // Only documented official sandbox test meters are recognized when running without a live gateway
    if (!isDocMeter && !isTestMeter) {
      return {
        success: false,
        meterNumber: sanitizedMeter,
        discoCode: request.discoCode,
        customerName: '',
        address: '',
        meterType: request.meterType,
        errorCode: 'INVALID_METER_NUMBER',
        errorMessage: 'The provided meter number was not recognized by the DISCO. Please check the number and try again.',
      };
    }

    return {
      success: true,
      meterNumber: sanitizedMeter,
      discoCode: request.discoCode,
      customerName: isDocMeter ? 'GALADIMA SHEHU MALAMI' : 'MUSA ABUBAKAR (Sandbox Test)',
      address: isDocMeter ? '9 ADEYEMO STREET MAFOLUKU' : '12 UNITY ROAD, VICTORIA ISLAND, LAGOS',
      meterType: request.meterType,
      tariffCode: 'NMD',
      minimumVendNaira: 1000,
      outstandingDebtNaira: isDocMeter ? 361257.12 : 0,
      providerSessionRef: `${squadDisco}-${Date.now().toString(16)}`,
    };
  }

  /**
   * Vends electricity token via Squad.
   * Transparently executes JIT lookup to acquire fresh session reference if not already supplied.
   */
  async vendToken(request: VendTokenRequest): Promise<VendTokenResponse> {
    const sanitizedMeter = (request.meterNumber || '').replace(/\s/g, '');
    const amountNaira = Math.round(request.amountKobo / 100);
    const requestId = request.internalReference;
    const hasLiveKey = Boolean(
      this.secretKey &&
      !this.secretKey.includes('xxxxxxxx') &&
      this.secretKey.trim().length > 10
    );

    let sessionReference = request.lookupReference;
    let minVendNaira: number | undefined;
    let outstandingDebt: number | undefined;

    // 1. JIT Meter Lookup if no session reference was passed
    if (!sessionReference) {
      console.log(`[SquadProvider] Executing JIT lookup for ${sanitizedMeter} before vending...`);
      const lookupResult = await this.verifyMeter({
        meterNumber: sanitizedMeter,
        discoCode: request.discoCode,
        meterType: request.meterType,
      });

      if (!lookupResult.success || !lookupResult.providerSessionRef) {
        return {
          success: false,
          status: 'failed',
          amountKobo: request.amountKobo,
          internalReference: requestId,
          responseMessage:
            lookupResult.errorMessage || 'Failed to obtain active meter session from provider.',
          rawResponse: lookupResult.rawResponse,
        };
      }

      sessionReference = lookupResult.providerSessionRef;
      minVendNaira = lookupResult.minimumVendNaira;
      outstandingDebt = lookupResult.outstandingDebtNaira;

      // 2. Minimum Vend Check (Fintech Safety Pre-flight)
      if (minVendNaira && amountNaira < minVendNaira) {
        return {
          success: false,
          status: 'failed',
          amountKobo: request.amountKobo,
          internalReference: requestId,
          responseMessage: `Amount ₦${amountNaira.toLocaleString()} is below the DISCO minimum threshold of ₦${minVendNaira.toLocaleString()}.`,
        };
      }
    }

    if (!hasLiveKey) {
      if (process.env.NODE_ENV === 'production' || process.env.EXPO_PUBLIC_APP_ENV === 'production') {
        LoggerService.critical('squad-provider', 'squad.credentials.missing', {
          message: 'Squad utility credentials missing in production environment.',
          errorCode: 'PROVIDER_ERROR',
          internalTransactionId: requestId,
        });
        return {
          success: false,
          status: 'failed',
          amountKobo: request.amountKobo,
          internalReference: requestId,
          responseMessage: 'Electricity vending is currently unavailable. Please contact support.',
        };
      }

      const isDocMeter = sanitizedMeter === '45067198783';
      const isTestMeter = sanitizedMeter === '01429812456';

      // Strict Vending Guard: Reject vending on invalid meters
      if (!isDocMeter && !isTestMeter) {
        return {
          success: false,
          status: 'failed',
          amountKobo: request.amountKobo,
          internalReference: requestId,
          responseMessage: 'Electricity vending failed: The specified meter number is not recognized by the utility provider.',
        };
      }

      LoggerService.debug('squad-provider', 'squad.vend.sandbox_mode', {
        internalTransactionId: requestId,
        metadata: { meter: sanitizedMeter, amountNaira },
      });
      const mockToken = this.formatTokenString('26832663990919393911');
      const unitsKwh = parseFloat((amountNaira / 45.8).toFixed(2));
      return {
        success: true,
        status: 'successful',
        token: mockToken,
        unitsKwh,
        tariffPerKwhKobo: 4580,
        amountKobo: request.amountKobo,
        providerReference: `SQD-VAL-${Date.now()}`,
        internalReference: requestId,
        vatNaira: Math.round(amountNaira * 0.075 * 100) / 100,
        receiptNumber: `REC-${Date.now().toString().slice(-8)}`,
        tariffClass: 'C-Non MD',
        outstandingDebtNaira: outstandingDebt,
        responseMessage: 'Transaction Successful (Squad Sandbox)',
      };
    }

    // 3. Dispatch Purchase to Squad API
    if (hasLiveKey && SquadCircuitBreaker.getState() === 'OPEN') {
      return {
        success: false,
        status: 'failed',
        amountKobo: request.amountKobo,
        internalReference: requestId,
        responseMessage: 'Electricity vending is temporarily paused due to provider downtime. Please retry in a few moments.',
      };
    }

    const vendStartTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const endpoint = `${this.baseUrl}/vending/utilities/electricity`;
      LoggerService.info('squad-provider', 'squad.vend.dispatched', {
        internalTransactionId: requestId,
        providerReference: sessionReference,
        metadata: { amountNaira, meter: sanitizedMeter },
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          phone_number: request.customerPhoneNumber || '08012345678',
          amount: amountNaira,
          email: request.customerEmail || 'support@smartelectricity.ng',
          reference: sessionReference,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const vendDurationMs = Date.now() - vendStartTime;
      const res = await response.json();

      if (res.status === 200 && res.success && res.data) {
        SquadCircuitBreaker.recordSuccess('vend', vendDurationMs);
        const d = res.data;
        const meta = d.meta_json || {};

        const rawToken = meta.token || d.value_reference || '';
        const token = this.formatTokenString(rawToken);
        const unitsKwh = meta.total_units ? parseFloat(String(meta.total_units)) : undefined;
        const tariffPerKwhKobo = meta.tariff_rate
          ? Math.round(parseFloat(String(meta.tariff_rate)) * 100)
          : undefined;
        const vatNaira = meta.vat ? Math.abs(parseFloat(String(meta.vat))) : undefined;
        const receiptNumber = meta.receipt_number || undefined;
        const tariffClass = meta.tariff_class || undefined;

        SquadMonitoringService.recordExecution({
          operation: 'vend',
          durationMs: vendDurationMs,
          success: true,
          status: 'successful',
          reference: d.value_reference || d.reference || sessionReference,
          correlationId: requestId,
        });

        LoggerService.info('squad-provider', 'squad.vend.completed', {
          internalTransactionId: requestId,
          providerReference: d.value_reference || d.reference || sessionReference,
          durationMs: vendDurationMs,
          metadata: { unitsKwh, meter: sanitizedMeter },
        });

        return {
          success: true,
          status: 'successful',
          token,
          unitsKwh,
          tariffPerKwhKobo,
          amountKobo: request.amountKobo,
          providerReference: d.value_reference || d.reference || sessionReference,
          internalReference: requestId,
          vatNaira,
          receiptNumber,
          tariffClass,
          outstandingDebtNaira: outstandingDebt,
          responseMessage: res.message || 'Transaction Successful',
          rawResponse: res,
        };
      }

      if (res.status >= 500) {
        SquadCircuitBreaker.recordFailure('vend', new Error(res.message || 'Squad 5xx'), false, 'PROVIDER_DOWNTIME');
      }

      SquadMonitoringService.recordExecution({
        operation: 'vend',
        durationMs: vendDurationMs,
        success: false,
        status: String(res.status || 'failed'),
        errorMessage: res.message || 'Vending failed with provider',
        correlationId: requestId,
      });

      LoggerService.error('squad-provider', 'squad.vend.rejected', {
        internalTransactionId: requestId,
        durationMs: vendDurationMs,
        message: res.message,
        errorCode: 'PROVIDER_ERROR',
      });

      return {
        success: false,
        status: 'failed',
        amountKobo: request.amountKobo,
        internalReference: requestId,
        responseMessage: res.message || 'Electricity vending failed with provider.',
        rawResponse: res,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const vendDurationMs = Date.now() - vendStartTime;
      const isTimeout = err.name === 'AbortError';

      SquadCircuitBreaker.recordFailure('vend', err, isTimeout, isTimeout ? 'GATEWAY_TIMEOUT' : 'NETWORK_TEMPORARY');

      SquadMonitoringService.recordExecution({
        operation: 'vend',
        durationMs: vendDurationMs,
        success: false,
        isTimeout,
        status: isTimeout ? 'timeout' : 'error',
        errorMessage: err.message,
        correlationId: requestId,
      });

      LoggerService.error('squad-provider', 'squad.vend.exception', {
        internalTransactionId: requestId,
        durationMs: vendDurationMs,
        message: err.message,
        errorCode: isTimeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
      });

      // FINTECH SAFETY: Gateway timeout must never be marked as failed directly;
      // mark as 'unknown' for deterministic reconciliation.
      return {
        success: false,
        status: 'unknown',
        amountKobo: request.amountKobo,
        internalReference: requestId,
        responseMessage:
          isTimeout
            ? 'Gateway timeout waiting for utility response. Transaction awaiting reconciliation.'
            : `Network error connecting to provider: ${err?.message || 'Connection lost'}. Transaction awaiting reconciliation.`,
      };
    }
  }

  /**
   * Queries transaction status via Squad's /vending/transactions audit endpoint.
   */
  async queryTransactionStatus(request: QueryTransactionRequest): Promise<QueryTransactionResponse> {
    const hasLiveKey = Boolean(
      this.secretKey &&
      !this.secretKey.includes('xxxxxxxx') &&
      this.secretKey.trim().length > 10
    );

    if (hasLiveKey) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const queryRef = request.providerReference || request.internalReference;
        const endpoint = `${this.baseUrl}/vending/transactions?reference=${encodeURIComponent(queryRef)}`;

        const response = await fetch(endpoint, {
          method: 'GET',
          headers: this.getHeaders(),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const res = await response.json();

        if (res.status === 200 && res.success && res.data) {
          const d = Array.isArray(res.data) ? res.data[0] : res.data;
          const meta = d?.meta_json || {};
          const isSuccess = d?.status === 'success' || d?.status === 'successful';

          return {
            status: isSuccess ? 'successful' : 'processing',
            token: meta.token ? this.formatTokenString(meta.token) : undefined,
            unitsKwh: meta.total_units ? parseFloat(String(meta.total_units)) : undefined,
            amountKobo: d.amount ? Math.round(Number(d.amount) * 100) : undefined,
            tariffPerKwhKobo: meta.tariff_rate
              ? Math.round(parseFloat(String(meta.tariff_rate)) * 100)
              : undefined,
            providerReference: d.value_reference || d.reference,
            rawResponse: res,
          };
        }

        return {
          status: 'unknown',
          providerReference: request.providerReference,
          rawResponse: res,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.warn('[SquadProvider] Requery exception:', err);
        return {
          status: 'unknown',
          providerReference: request.providerReference,
          rawResponse: { error: err?.message },
        };
      }
    }

    return {
      status: 'successful',
      token: this.formatTokenString('26832663990919393911'),
      unitsKwh: 332.35,
      amountKobo: 1300000,
      providerReference: request.providerReference || 'SQD-VAL-MOCK',
    };
  }
}
