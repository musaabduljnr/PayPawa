export type PaymentMethodType = 'card' | 'transfer' | 'ussd' | 'qr';

export interface InitializePaymentRequest {
  internalReference: string;
  amountKobo: number;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: PaymentMethodType;
  callbackUrl?: string;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}

export interface InitializePaymentResponse {
  success: boolean;
  providerReference: string;
  internalReference: string;
  checkoutUrl?: string;
  accessCode?: string;
  virtualAccount?: {
    accountNumber: string;
    bankName: string;
    accountName: string;
    expiresAt?: string;
  };
  ussdCode?: string;
  responseMessage: string;
  rawResponse?: any;
}

export interface VerifyPaymentRequest {
  internalReference: string;
  providerReference?: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  status: 'successful' | 'failed' | 'pending' | 'unknown';
  amountKobo: number;
  currency: string;
  paidAt?: string;
  channel?: PaymentMethodType | string;
  providerReference: string;
  internalReference: string;
  responseMessage: string;
  rawResponse?: any;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  event?: string;
  internalReference?: string;
  providerReference?: string;
  amountKobo?: number;
  currency?: string;
  status?: 'successful' | 'failed' | 'pending';
  channel?: string;
  rawPayload?: any;
  errorMessage?: string;
}

/**
 * Standard Payment Provider interface for Nigerian payment gateways (Paystack, Flutterwave, Monnify).
 */
export interface PaymentProvider {
  readonly providerName: string;
  initializePayment(request: InitializePaymentRequest): Promise<InitializePaymentResponse>;
  verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse>;
  parseAndVerifyWebhook(rawPayload: any, signatureHeader?: string): Promise<WebhookVerificationResult>;
}
