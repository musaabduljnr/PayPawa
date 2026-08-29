import {
  PaymentProvider,
  InitializePaymentRequest,
  InitializePaymentResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  WebhookVerificationResult,
} from './PaymentProvider';

export type MockPaymentBehavior =
  | 'SUCCESS'
  | 'FAILED'
  | 'PENDING'
  | 'TIMEOUT'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'MALFORMED_RESPONSE';

export class MockPaymentProvider implements PaymentProvider {
  readonly providerName = 'mock';
  private behavior: MockPaymentBehavior;
  private transactionStore: Map<
    string,
    {
      internalReference: string;
      providerReference: string;
      amountKobo: number;
      currency: string;
      status: 'successful' | 'failed' | 'pending';
      channel: string;
    }
  > = new Map();

  constructor(behavior: MockPaymentBehavior = 'SUCCESS') {
    this.behavior = behavior;
  }

  setBehavior(b: MockPaymentBehavior) {
    this.behavior = b;
  }

  async initializePayment(request: InitializePaymentRequest): Promise<InitializePaymentResponse> {
    if (this.behavior === 'TIMEOUT') {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        success: false,
        providerReference: `MOCK-PST-TIMEOUT-${Date.now()}`,
        internalReference: request.internalReference,
        responseMessage: 'Payment provider connection timed out.',
      };
    }

    if (this.behavior === 'FAILED') {
      return {
        success: false,
        providerReference: `MOCK-PST-FAIL-${Date.now()}`,
        internalReference: request.internalReference,
        responseMessage: 'Payment initialization rejected by payment gateway.',
      };
    }

    const providerReference = `MOCK-PST-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const status = this.behavior === 'PENDING' ? 'pending' : 'successful';

    this.transactionStore.set(request.internalReference, {
      internalReference: request.internalReference,
      providerReference,
      amountKobo: request.amountKobo,
      currency: 'NGN',
      status,
      channel: request.paymentMethod || 'card',
    });

    const isTransfer = request.paymentMethod === 'transfer';
    const isUssd = request.paymentMethod === 'ussd';

    return {
      success: true,
      providerReference,
      internalReference: request.internalReference,
      checkoutUrl: `https://checkout.smart-electricity.app/pay/${request.internalReference}`,
      accessCode: `ACC_${Math.floor(100000 + Math.random() * 900000)}`,
      virtualAccount: isTransfer
        ? {
            accountNumber: '9902 4819 5032',
            bankName: 'Wema Bank / SmartPay',
            accountName: request.customerName || 'Smart Electricity / Customer',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          }
        : undefined,
      ussdCode: isUssd ? '*737*50*5000*82#' : undefined,
      responseMessage: 'Payment initialized successfully.',
      rawResponse: { status: 'success', data: { reference: providerReference } },
    };
  }

  async verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    if (this.behavior === 'TIMEOUT') {
      return {
        success: false,
        status: 'unknown',
        amountKobo: 0,
        currency: 'NGN',
        providerReference: request.providerReference || request.internalReference,
        internalReference: request.internalReference,
        responseMessage: 'Verification timed out.',
      };
    }

    if (this.behavior === 'FAILED') {
      return {
        success: false,
        status: 'failed',
        amountKobo: 500000,
        currency: 'NGN',
        providerReference: request.providerReference || request.internalReference,
        internalReference: request.internalReference,
        responseMessage: 'Payment failed with bank issuer.',
      };
    }

    if (this.behavior === 'PENDING') {
      return {
        success: false,
        status: 'pending',
        amountKobo: 500000,
        currency: 'NGN',
        providerReference: request.providerReference || request.internalReference,
        internalReference: request.internalReference,
        responseMessage: 'Payment is awaiting settlement.',
      };
    }

    if (this.behavior === 'AMOUNT_MISMATCH') {
      return {
        success: true,
        status: 'successful',
        amountKobo: 50000000, // ₦500,000 instead of ₦5,000
        currency: 'NGN',
        providerReference: request.providerReference || request.internalReference,
        internalReference: request.internalReference,
        responseMessage: 'Amount mismatch simulated.',
      };
    }

    if (this.behavior === 'CURRENCY_MISMATCH') {
      return {
        success: true,
        status: 'successful',
        amountKobo: 500000,
        currency: 'USD', // Non-NGN
        providerReference: request.providerReference || request.internalReference,
        internalReference: request.internalReference,
        responseMessage: 'Foreign currency simulated.',
      };
    }

    const saved = this.transactionStore.get(request.internalReference);
    const amountKobo = saved?.amountKobo || 500000;
    const providerReference = saved?.providerReference || `MOCK-PST-${Date.now()}`;

    return {
      success: true,
      status: 'successful',
      amountKobo,
      currency: 'NGN',
      paidAt: new Date().toISOString(),
      channel: saved?.channel || 'card',
      providerReference,
      internalReference: request.internalReference,
      responseMessage: 'Transaction verified successful.',
      rawResponse: { status: 'success', data: { amount: amountKobo, reference: providerReference } },
    };
  }

  async parseAndVerifyWebhook(rawPayload: any, signatureHeader?: string): Promise<WebhookVerificationResult> {
    const payloadObj = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

    if (this.behavior === 'MALFORMED_RESPONSE') {
      return { isValid: false, errorMessage: 'Malformed payload simulation' };
    }

    const event = payloadObj.event || 'charge.success';
    const data = payloadObj.data || {};

    let amountKobo = data.amount || 500000;
    let currency = data.currency || 'NGN';

    if (this.behavior === 'AMOUNT_MISMATCH') {
      amountKobo = 50000000; // ₦500,000 mismatch
    }
    if (this.behavior === 'CURRENCY_MISMATCH') {
      currency = 'USD';
    }

    return {
      isValid: true,
      event,
      internalReference: data.reference || data.internal_reference || 'WF-MOCK-REF',
      providerReference: data.reference || `PST-${Date.now()}`,
      amountKobo,
      currency,
      status: 'successful',
      channel: data.channel || 'card',
      rawPayload: payloadObj,
    };
  }

  /**
   * Helper to simulate an authentic webhook payload from Paystack.
   */
  generateWebhookPayload(internalReference: string, amountKobo: number, providerReference?: string) {
    return {
      event: 'charge.success',
      data: {
        id: Math.floor(1000000 + Math.random() * 9000000),
        reference: internalReference,
        amount: amountKobo,
        currency: 'NGN',
        status: 'success',
        gateway_response: 'Successful',
        channel: 'card',
        paid_at: new Date().toISOString(),
        metadata: {
          internal_reference: internalReference,
        },
      },
    };
  }
}
