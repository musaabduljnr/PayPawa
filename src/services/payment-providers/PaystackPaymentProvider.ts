import {
  PaymentProvider,
  InitializePaymentRequest,
  InitializePaymentResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  WebhookVerificationResult,
} from './PaymentProvider';
import { supabase } from '../supabase';

export interface PaystackConfig {
  publicKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  baseUrl?: string;
}

export class PaystackPaymentProvider implements PaymentProvider {
  readonly providerName = 'paystack';
  private secretKey: string;
  private publicKey: string;
  private webhookSecret: string;
  private baseUrl: string;

  constructor(config?: PaystackConfig) {
    // Security Hardening: Never fall back to EXPO_PUBLIC_ prefixed secret keys in client bundles
    this.secretKey = config?.secretKey || process.env.PAYSTACK_SECRET_KEY || '';
    this.publicKey = config?.publicKey || process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY || '';
    this.webhookSecret = config?.webhookSecret || process.env.PAYSTACK_WEBHOOK_SECRET || this.secretKey;
    this.baseUrl = (config?.baseUrl || 'https://api.paystack.co').replace(/\/$/, '');
  }

  isConfigured(): boolean {
    return Boolean(
      (this.secretKey && 
       !this.secretKey.includes('sk_test_xxx') && 
       !this.secretKey.includes('sk_test_placeholder') &&
       this.secretKey !== '') ||
      supabase
    );
  }

  async initializePayment(request: InitializePaymentRequest): Promise<InitializePaymentResponse> {
    if (!this.isConfigured()) {
      return {
        success: false,
        providerReference: `PST-UNCONFIGURED-${Date.now()}`,
        internalReference: request.internalReference,
        responseMessage: 'Paystack secret key is not configured in server environment.',
      };
    }

    // 1. If no local secretKey is available, delegate to Supabase Edge Function gateway
    if (!this.secretKey) {
      try {
        const { data, error } = await supabase.functions.invoke('paystack-gateway', {
          body: { action: 'initialize', ...request },
        });

        if (error || !data || !data.success) {
          return {
            success: false,
            providerReference: '',
            internalReference: request.internalReference,
            responseMessage: data?.errorMessage || error?.message || 'Paystack gateway initialization failed.',
            rawResponse: data,
          };
        }

        return {
          success: true,
          providerReference: data.providerReference || request.internalReference,
          internalReference: request.internalReference,
          checkoutUrl: data.checkoutUrl,
          accessCode: data.accessCode,
          responseMessage: data.responseMessage || 'Paystack authorization initialized successfully.',
          rawResponse: data,
        };
      } catch (invokeErr: any) {
        return {
          success: false,
          providerReference: '',
          internalReference: request.internalReference,
          responseMessage: `Paystack gateway connection error: ${invokeErr.message}`,
        };
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const channels = request.paymentMethod === 'card'
        ? ['card']
        : request.paymentMethod === 'transfer'
        ? ['bank_transfer']
        : request.paymentMethod === 'ussd'
        ? ['ussd']
        : ['card', 'bank_transfer', 'ussd', 'qr'];

      const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reference: request.internalReference,
          amount: request.amountKobo,
          email: request.customerEmail,
          currency: 'NGN',
          callback_url: request.callbackUrl || 'https://standard.paystack.co/close',
          channels,
          metadata: {
            ...request.metadata,
            internal_reference: request.internalReference,
            customer_phone: request.customerPhone,
            customer_name: request.customerName,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok || !data.status) {
        return {
          success: false,
          providerReference: '',
          internalReference: request.internalReference,
          responseMessage: data.message || `Paystack initialization failed (HTTP ${response.status})`,
          rawResponse: data,
        };
      }

      return {
        success: true,
        providerReference: data.data.reference || request.internalReference,
        internalReference: request.internalReference,
        checkoutUrl: data.data.authorization_url,
        accessCode: data.data.access_code,
        responseMessage: 'Paystack authorization initialized successfully.',
        rawResponse: data,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      return {
        success: false,
        providerReference: '',
        internalReference: request.internalReference,
        responseMessage: err.name === 'AbortError'
          ? 'Paystack initialization timed out after 15s.'
          : `Paystack network error: ${err.message}`,
      };
    }
  }

  async verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'failed',
        amountKobo: 0,
        currency: 'NGN',
        providerReference: request.providerReference || request.internalReference,
        internalReference: request.internalReference,
        responseMessage: 'Paystack is not configured.',
      };
    }

    // 1. If no local secretKey is available, delegate to Supabase Edge Function gateway
    if (!this.secretKey) {
      try {
        const { data, error } = await supabase.functions.invoke('paystack-gateway', {
          body: {
            action: 'verify',
            reference: request.providerReference || request.internalReference,
          },
        });

        if (error || !data || !data.success) {
          return {
            success: false,
            status: data?.status || 'unknown',
            amountKobo: data?.amountKobo || 0,
            currency: 'NGN',
            providerReference: request.providerReference || request.internalReference,
            internalReference: request.internalReference,
            responseMessage: data?.errorMessage || error?.message || 'Paystack verification failed.',
            rawResponse: data,
          };
        }

        return {
          success: true,
          status: data.status,
          amountKobo: data.amountKobo,
          currency: data.currency || 'NGN',
          paidAt: data.paidAt,
          channel: data.channel,
          providerReference: data.providerReference,
          internalReference: data.internalReference,
          responseMessage: data.responseMessage || 'Payment verified',
          rawResponse: data,
        };
      } catch (invokeErr: any) {
        return {
          success: false,
          status: 'unknown',
          amountKobo: 0,
          currency: 'NGN',
          providerReference: request.providerReference || request.internalReference,
          internalReference: request.internalReference,
          responseMessage: `Paystack gateway verification error: ${invokeErr.message}`,
        };
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const refToQuery = encodeURIComponent(request.providerReference || request.internalReference);
      const response = await fetch(`${this.baseUrl}/transaction/verify/${refToQuery}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok || !data.status) {
        return {
          success: false,
          status: 'unknown',
          amountKobo: 0,
          currency: 'NGN',
          providerReference: request.providerReference || request.internalReference,
          internalReference: request.internalReference,
          responseMessage: data.message || `Paystack verification failed (HTTP ${response.status})`,
          rawResponse: data,
        };
      }

      const tx = data.data;
      const isSuccessful = tx.status === 'success';
      const isFailed = tx.status === 'failed' || tx.status === 'reversed';
      const status = isSuccessful ? 'successful' : isFailed ? 'failed' : 'pending';

      return {
        success: isSuccessful,
        status,
        amountKobo: tx.amount,
        currency: tx.currency,
        paidAt: tx.paid_at || tx.paidAt,
        channel: tx.channel,
        providerReference: tx.reference,
        internalReference: tx.metadata?.internal_reference || request.internalReference,
        responseMessage: tx.gateway_response || data.message || 'Payment verified',
        rawResponse: data,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      return {
        success: false,
        status: 'unknown',
        amountKobo: 0,
        currency: 'NGN',
        providerReference: request.providerReference || request.internalReference,
        internalReference: request.internalReference,
        responseMessage: err.name === 'AbortError'
          ? 'Paystack verification timed out after 15s.'
          : `Paystack verification network exception: ${err.message}`,
      };
    }
  }

  async parseAndVerifyWebhook(rawPayload: any, signatureHeader?: string): Promise<WebhookVerificationResult> {
    if (!rawPayload) {
      return { isValid: false, errorMessage: 'Empty webhook payload' };
    }

    const payloadObj = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    const event = payloadObj.event;
    const tx = payloadObj.data;

    if (!event || !tx) {
      return { isValid: false, errorMessage: 'Invalid Paystack webhook format' };
    }

    if (!signatureHeader) {
      return { isValid: false, errorMessage: 'Missing x-paystack-signature header' };
    }

    const payloadStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
    const cryptoObj = globalThis.crypto;

    if (!cryptoObj || !cryptoObj.subtle) {
      return { isValid: false, errorMessage: 'Cryptography API not available' };
    }

    let isValidSignature = false;
    
    // Candidates: webhookSecret (if valid) and secretKey as primary fallback
    const candidateSecrets: string[] = [];
    if (this.webhookSecret && !this.webhookSecret.includes('whsec_xxx') && !this.webhookSecret.includes('whsec_placeholder')) {
      candidateSecrets.push(this.webhookSecret);
    }
    if (this.secretKey && !candidateSecrets.includes(this.secretKey)) {
      candidateSecrets.push(this.secretKey);
    }

    if (candidateSecrets.length === 0) {
      return { isValid: false, errorMessage: 'No valid webhook signing secret configured' };
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(payloadStr);

    for (const secret of candidateSecrets) {
      try {
        const keyData = encoder.encode(secret);
        const cryptoKey = await cryptoObj.subtle.importKey(
          'raw',
          keyData,
          { name: 'HMAC', hash: 'SHA-512' },
          false,
          ['sign']
        );

        const signatureBuffer = await cryptoObj.subtle.sign(
          'HMAC',
          cryptoKey,
          data
        );

        const hashArray = Array.from(new Uint8Array(signatureBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (hashHex === signatureHeader) {
          isValidSignature = true;
          break;
        }
      } catch (cryptoErr: any) {
        // continue
      }
    }

    if (!isValidSignature) {
      return { isValid: false, errorMessage: 'Invalid cryptographic signature match' };
    }

    // Status mapping
    const isSuccessful = event === 'charge.success' && tx.status === 'success';
    const isFailed = tx.status === 'failed';
    const status = isSuccessful ? 'successful' : isFailed ? 'failed' : 'pending';

    return {
      isValid: true,
      event,
      internalReference: tx.metadata?.internal_reference || tx.reference,
      providerReference: tx.reference,
      amountKobo: tx.amount,
      currency: tx.currency,
      status,
      channel: tx.channel,
      rawPayload: payloadObj,
    };
  }
}
