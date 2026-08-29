/**
 * ============================================================================
 * ELECTRICITY UTILITY PROVIDER ABSTRACTION INTERFACE
 * ============================================================================
 * Defines the contract that all external electricity vending backends
 * (e.g. VTpass, BuyPower, CoralPay, Direct DISCO APIs) must fulfill.
 */

export type MeterType = 'prepaid' | 'postpaid';

export interface DiscoInfo {
  code: string;           // e.g. 'yedc', 'aedc', 'ekedc'
  name: string;           // e.g. 'Yola Electricity Distribution Company'
  shortName: string;      // e.g. 'YEDC'
  serviceID: string;      // Provider specific service identifier
  minAmountKobo: number;  // Minimum purchase amount in Kobo
  maxAmountKobo: number;  // Maximum purchase amount in Kobo
  isAvailable: boolean;
}

export interface VerifyMeterRequest {
  meterNumber: string;
  discoCode: string;
  meterType: MeterType;
}

export interface VerifyMeterResponse {
  success: boolean;
  meterNumber: string;
  discoCode: string;
  customerName: string;
  address: string;
  meterType: MeterType;
  tariffCode?: string;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: Record<string, any>;
}

export interface VendTokenRequest {
  meterNumber: string;
  discoCode: string;
  amountKobo: number;
  meterType: MeterType;
  customerPhoneNumber?: string;
  customerEmail?: string;
  idempotencyKey: string;
  internalReference: string;
}

export type VendingStatus = 'successful' | 'processing' | 'pending' | 'failed' | 'timeout' | 'unknown';

export interface VendTokenResponse {
  success: boolean;
  status: VendingStatus;
  token?: string;                  // 20-digit standard STS token: XXXX XXXX XXXX XXXX XXXX
  unitsKwh?: number;               // Kilowatt-hours delivered
  tariffPerKwhKobo?: number;       // Rate in Kobo
  amountKobo: number;              // Total amount paid
  providerReference?: string;      // External provider transaction ID
  internalReference: string;       // App internal reference ID
  responseMessage?: string;
  rawResponse?: Record<string, any>;
}

export interface QueryTransactionRequest {
  internalReference: string;
  providerReference?: string;
}

export interface QueryTransactionResponse {
  status: VendingStatus;
  token?: string;
  unitsKwh?: number;
  amountKobo?: number;
  tariffPerKwhKobo?: number;
  providerReference?: string;
  rawResponse?: Record<string, any>;
}

export interface ElectricityProvider {
  readonly providerName: string;

  /**
   * Fetches active distribution companies and current API service status.
   */
  getDiscos(): Promise<DiscoInfo[]>;

  /**
   * Verifies the meter number with the DISCO and resolves customer metadata.
   */
  verifyMeter(request: VerifyMeterRequest): Promise<VerifyMeterResponse>;

  /**
   * Dispatches a token vending request to the utility gateway.
   */
  vendToken(request: VendTokenRequest): Promise<VendTokenResponse>;

  /**
   * Queries the status of an in-flight or timed-out transaction.
   */
  queryTransactionStatus(request: QueryTransactionRequest): Promise<QueryTransactionResponse>;
}
