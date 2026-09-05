import {
  ElectricityProvider,
  DiscoInfo,
  VerifyMeterRequest,
  VerifyMeterResponse,
  VendTokenRequest,
  VendTokenResponse,
  QueryTransactionRequest,
  QueryTransactionResponse,
  VendingStatus,
} from './ElectricityProvider';
import { NIGERIAN_DISCOS } from './discoMapping';

export type MockProviderBehavior =
  | 'SUCCESS'
  | 'INVALID_METER'
  | 'INVALID_AMOUNT'
  | 'TIMEOUT'
  | 'HTTP_500'
  | 'MALFORMED_RESPONSE'
  | 'PENDING'
  | 'UNKNOWN'
  | 'SLOW_RESPONSE'
  | 'DUPLICATE_RESPONSE';

/**
 * Mock Electricity Provider for Automated Unit, Concurrency, Load & Resilience Testing.
 * Allows simulating real-world gateway anomalies without touching production VTpass quotas.
 */
export class MockElectricityProvider implements ElectricityProvider {
  readonly providerName = 'mock';

  private behavior: MockProviderBehavior = 'SUCCESS';
  private latencyMs: number = 0;
  private callCount: number = 0;
  private transactionHistory: Map<string, { status: VendingStatus; token?: string; unitsKwh?: number }> = new Map();

  constructor(initialBehavior: MockProviderBehavior = 'SUCCESS', latencyMs: number = 0) {
    this.behavior = initialBehavior;
    this.latencyMs = latencyMs;
  }

  setBehavior(behavior: MockProviderBehavior) {
    this.behavior = behavior;
  }

  setLatency(ms: number) {
    this.latencyMs = ms;
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset() {
    this.callCount = 0;
    this.behavior = 'SUCCESS';
    this.latencyMs = 0;
    this.transactionHistory.clear();
  }

  async getDiscos(): Promise<DiscoInfo[]> {
    return NIGERIAN_DISCOS;
  }

  async verifyMeter(request: VerifyMeterRequest): Promise<VerifyMeterResponse> {
    this.callCount++;
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    if (this.behavior === 'INVALID_METER' || request.meterNumber === '00000000000') {
      return {
        success: false,
        meterNumber: request.meterNumber,
        discoCode: request.discoCode,
        customerName: '',
        address: '',
        meterType: request.meterType,
        errorCode: 'INVALID_METER_NUMBER',
        errorMessage: 'The provided meter number was not recognized by the DISCO.',
      };
    }

    if (this.behavior === 'HTTP_500') {
      return {
        success: false,
        meterNumber: request.meterNumber,
        discoCode: request.discoCode,
        customerName: '',
        address: '',
        meterType: request.meterType,
        errorCode: 'PROVIDER_ERROR_500',
        errorMessage: 'Utility provider gateway error (HTTP 500). Please try again.',
      };
    }

    return {
      success: true,
      meterNumber: request.meterNumber,
      discoCode: request.discoCode,
      customerName: 'Musa Abubakar (Verified Test Customer)',
      address: '14 Crescent Way, Victoria Island, Lagos',
      meterType: request.meterType,
      tariffCode: 'A-Residential-Non-MD',
      rawResponse: { simulated: true, code: '000' },
    };
  }

  async vendToken(request: VendTokenRequest): Promise<VendTokenResponse> {
    this.callCount++;
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    const amountNaira = Math.round(request.amountKobo / 100);

    // 1. Check Mock Behaviors
    if (this.behavior === 'INVALID_METER' || request.meterNumber === '00000000000') {
      return {
        success: false,
        status: 'failed',
        amountKobo: request.amountKobo,
        internalReference: request.internalReference,
        responseMessage: 'Invalid meter number rejected by DISCO',
      };
    }

    if (this.behavior === 'INVALID_AMOUNT' || request.amountKobo < 50000) {
      return {
        success: false,
        status: 'failed',
        amountKobo: request.amountKobo,
        internalReference: request.internalReference,
        responseMessage: 'Purchase amount is below provider minimum threshold',
      };
    }

    if (this.behavior === 'HTTP_500') {
      return {
        success: false,
        status: 'failed',
        amountKobo: request.amountKobo,
        internalReference: request.internalReference,
        responseMessage: 'Provider upstream error HTTP 500: Service unavailable',
      };
    }

    if (this.behavior === 'TIMEOUT') {
      this.transactionHistory.set(request.internalReference, { status: 'unknown' });
      return {
        success: false,
        status: 'timeout',
        amountKobo: request.amountKobo,
        internalReference: request.internalReference,
        responseMessage: 'Provider connection timed out after 30s',
      };
    }

    if (this.behavior === 'PENDING') {
      this.transactionHistory.set(request.internalReference, { status: 'pending' });
      return {
        success: false,
        status: 'pending',
        amountKobo: request.amountKobo,
        internalReference: request.internalReference,
        providerReference: `MOCK-PRV-${request.internalReference}`,
        responseMessage: 'Transaction is pending confirmation with utility switch',
      };
    }

    if (this.behavior === 'UNKNOWN') {
      this.transactionHistory.set(request.internalReference, { status: 'unknown' });
      return {
        success: false,
        status: 'unknown',
        amountKobo: request.amountKobo,
        internalReference: request.internalReference,
        responseMessage: 'Gateway status is unknown. Do not retry immediately.',
      };
    }

    // Default SUCCESS path
    const unitsKwh = parseFloat((amountNaira / 206.8).toFixed(1));
    const tokenPart1 = Math.floor(1000 + Math.random() * 9000);
    const tokenPart2 = Math.floor(1000 + Math.random() * 9000);
    const tokenPart3 = Math.floor(1000 + Math.random() * 9000);
    const tokenPart4 = Math.floor(1000 + Math.random() * 9000);
    const tokenPart5 = Math.floor(1000 + Math.random() * 9000);
    const formattedToken = `${tokenPart1} ${tokenPart2} ${tokenPart3} ${tokenPart4} ${tokenPart5}`;
    const providerReference = `MOCK-VTP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    this.transactionHistory.set(request.internalReference, {
      status: 'successful',
      token: formattedToken,
      unitsKwh,
    });

    return {
      success: true,
      status: 'successful',
      token: formattedToken,
      unitsKwh,
      tariffPerKwhKobo: 20680,
      amountKobo: request.amountKobo,
      providerReference,
      internalReference: request.internalReference,
      responseMessage: 'Transaction Successful',
      rawResponse: { code: '000', content: { transactions: { status: 'delivered' } } },
    };
  }

  async queryTransactionStatus(request: QueryTransactionRequest): Promise<QueryTransactionResponse> {
    this.callCount++;
    const saved = this.transactionHistory.get(request.internalReference);

    if (saved) {
      return {
        status: saved.status,
        token: saved.token,
        unitsKwh: saved.unitsKwh,
        providerReference: request.providerReference || `MOCK-REQUERY-${request.internalReference}`,
        rawResponse: { queried: true, status: saved.status },
      };
    }

    // If query happens on an unknown transaction in SUCCESS mode, resolve it to successful
    const unitsKwh = 38.5;
    const token = '4820 9182 3491 8294 1029';
    return {
      status: 'successful',
      token,
      unitsKwh,
      providerReference: request.providerReference || `MOCK-REQUERY-${request.internalReference}`,
      rawResponse: { queried: true, code: '000' },
    };
  }
}
