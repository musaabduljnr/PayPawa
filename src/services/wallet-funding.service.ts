import { supabase } from './supabase';
import {
  PaymentProviderFactory,
  PaymentProvider,
  PaymentMethodType,
} from './payment-providers';
import type { Database, PaymentMethodEnum } from '@/types/database';

export type PaymentAttemptRow = Database['public']['Tables']['payment_attempts']['Row'];

export interface InitializeFundingDto {
  userId: string;
  amountNaira: number;
  paymentMethod: PaymentMethodType;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  clientRequestId?: string;
  callbackUrl?: string;
}

export interface InitializeFundingResult {
  success: boolean;
  reference: string;
  paymentAttemptId?: string;
  amountNaira: number;
  amountKobo: number;
  paymentMethod: PaymentMethodType;
  checkoutUrl?: string;
  accessCode?: string;
  virtualAccount?: {
    accountNumber: string;
    bankName: string;
    accountName: string;
    expiresAt?: string;
  };
  ussdCode?: string;
  isDuplicate?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface VerifyFundingResult {
  success: boolean;
  status: 'successful' | 'failed' | 'pending' | 'unknown' | 'amount_mismatch';
  reference: string;
  amountNaira: number;
  amountKobo: number;
  newBalanceNaira?: number;
  newBalanceKobo?: number;
  walletTxId?: string;
  isDuplicate?: boolean;
  paidAt?: string;
  channel?: string;
  errorCode?: string;
  errorMessage?: string;
}

export class WalletFundingService {
  /**
   * Generates a collision-resistant internal reference format: WF-YYYYMMDD-XXXXXXXX
   */
  static generateInternalReference(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let rand = '';
    for (let i = 0; i < 8; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `WF-${dateStr}-${rand}`;
  }

  /**
   * Initializes an inbound wallet funding attempt.
   */
  static async initializeFunding(
    dto: InitializeFundingDto,
    customProvider?: PaymentProvider,
    client = supabase
  ): Promise<InitializeFundingResult> {
    // 1. Validation
    if (!dto.userId) {
      return {
        success: false,
        reference: '',
        amountNaira: dto.amountNaira,
        amountKobo: 0,
        paymentMethod: dto.paymentMethod,
        errorCode: 'UNAUTHENTICATED',
        errorMessage: 'User must be authenticated to initiate funding.',
      };
    }

    if (!Number.isFinite(dto.amountNaira) || dto.amountNaira < 500) {
      return {
        success: false,
        reference: '',
        amountNaira: dto.amountNaira,
        amountKobo: 0,
        paymentMethod: dto.paymentMethod,
        errorCode: 'INVALID_AMOUNT',
        errorMessage: 'Minimum wallet funding amount is ₦500.00.',
      };
    }

    if (dto.amountNaira > 1000000) {
      return {
        success: false,
        reference: '',
        amountNaira: dto.amountNaira,
        amountKobo: 0,
        paymentMethod: dto.paymentMethod,
        errorCode: 'LIMIT_EXCEEDED',
        errorMessage: 'Maximum single funding limit is ₦1,000,000.00.',
      };
    }

    const amountKobo = Math.round(dto.amountNaira * 100);
    const reference = this.generateInternalReference();
    const idempotencyKey = `FUND-${dto.userId}-${dto.clientRequestId || reference}`;

    // 2. Fetch or provision wallet account for user
    let { data: wallet } = await client
      .from('wallet_accounts')
      .select('*')
      .eq('user_id', dto.userId)
      .single();

    if (!wallet) {
      const { data: newWallet } = await client
        .from('wallet_accounts')
        .insert({
          user_id: dto.userId,
          balance_kobo: 0,
          currency: 'NGN',
          is_locked: false,
        })
        .select()
        .single();
      wallet = newWallet;
    }

    if (!wallet) {
      return {
        success: false,
        reference,
        amountNaira: dto.amountNaira,
        amountKobo,
        paymentMethod: dto.paymentMethod,
        errorCode: 'WALLET_ERROR',
        errorMessage: 'Unable to access or provision wallet account.',
      };
    }

    if (wallet.is_locked) {
      return {
        success: false,
        reference,
        amountNaira: dto.amountNaira,
        amountKobo,
        paymentMethod: dto.paymentMethod,
        errorCode: 'WALLET_LOCKED',
        errorMessage: 'Your wallet account is suspended. Please contact support.',
      };
    }

    // 3. Idempotency Check: if payment attempt with this key already exists
    const { data: existingAttempt } = await client
      .from('payment_attempts')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existingAttempt) {
      return {
        success: true,
        reference: existingAttempt.reference,
        paymentAttemptId: existingAttempt.id,
        amountNaira: Number(existingAttempt.amount_kobo) / 100,
        amountKobo: Number(existingAttempt.amount_kobo),
        paymentMethod: existingAttempt.method as PaymentMethodType,
        isDuplicate: true,
        checkoutUrl: (existingAttempt.metadata as any)?.checkout_url,
        virtualAccount: (existingAttempt.metadata as any)?.virtual_account,
        ussdCode: (existingAttempt.metadata as any)?.ussd_code,
      };
    }

    // 4. Create Payment Attempt Record in DB
    const provider = customProvider || PaymentProviderFactory.getDefaultProvider();
    const providerName = provider.providerName;

    const dbMethod: PaymentMethodEnum =
      dto.paymentMethod === 'transfer' ? 'bank_transfer' : (dto.paymentMethod as PaymentMethodEnum);

    const { data: createdAttempt, error: insertError } = await client
      .from('payment_attempts')
      .insert({
        user_id: dto.userId,
        wallet_id: wallet.id,
        reference,
        amount_kobo: amountKobo,
        method: dbMethod,
        status: 'initiated',
        provider: providerName,
        idempotency_key: idempotencyKey,
      })
      .select()
      .single();

    if (insertError || !createdAttempt) {
      return {
        success: false,
        reference,
        amountNaira: dto.amountNaira,
        amountKobo,
        paymentMethod: dto.paymentMethod,
        errorCode: 'DATABASE_ERROR',
        errorMessage: insertError?.message || 'Failed to create payment attempt record.',
      };
    }

    // 5. Initialize Payment with Gateway Provider
    const providerResponse = await provider.initializePayment({
      internalReference: reference,
      amountKobo,
      customerEmail: dto.customerEmail,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      paymentMethod: dto.paymentMethod,
      callbackUrl: dto.callbackUrl,
      idempotencyKey,
    });

    if (!providerResponse.success) {
      await client
        .from('payment_attempts')
        .update({
          status: 'failed',
          metadata: { failure_reason: providerResponse.responseMessage },
          updated_at: new Date().toISOString(),
        })
        .eq('id', createdAttempt.id);

      return {
        success: false,
        reference,
        paymentAttemptId: createdAttempt.id,
        amountNaira: dto.amountNaira,
        amountKobo,
        paymentMethod: dto.paymentMethod,
        errorCode: 'PROVIDER_INIT_FAILED',
        errorMessage: providerResponse.responseMessage || 'Unable to initialize checkout with payment provider.',
      };
    }

    // 6. Update payment attempt with provider details
    await client
      .from('payment_attempts')
      .update({
        provider_reference: providerResponse.providerReference || null,
        metadata: {
          checkout_url: providerResponse.checkoutUrl,
          access_code: providerResponse.accessCode,
          virtual_account: providerResponse.virtualAccount,
          ussd_code: providerResponse.ussdCode,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', createdAttempt.id);

    return {
      success: true,
      reference,
      paymentAttemptId: createdAttempt.id,
      amountNaira: dto.amountNaira,
      amountKobo,
      paymentMethod: dto.paymentMethod,
      checkoutUrl: providerResponse.checkoutUrl,
      accessCode: providerResponse.accessCode,
      virtualAccount: providerResponse.virtualAccount,
      ussdCode: providerResponse.ussdCode,
    };
  }

  /**
   * Verifies payment with provider and atomically credits the wallet.
   * Completely idempotent: calling multiple times will never double-credit.
   */
  static async verifyAndCreditPayment(
    referenceOrPaymentId: string,
    customProvider?: PaymentProvider,
    client = supabase
  ): Promise<VerifyFundingResult> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(referenceOrPaymentId);
    let query = client.from('payment_attempts').select('*');

    if (isUuid) {
      query = query.eq('id', referenceOrPaymentId);
    } else {
      query = query.eq('reference', referenceOrPaymentId);
    }

    const { data: paymentAttempt, error: fetchErr } = await query.single();

    if (fetchErr || !paymentAttempt) {
      return {
        success: false,
        status: 'unknown',
        reference: referenceOrPaymentId,
        amountNaira: 0,
        amountKobo: 0,
        errorCode: 'NOT_FOUND',
        errorMessage: 'Payment attempt record was not found.',
      };
    }

    const amountKobo = Number(paymentAttempt.amount_kobo);
    const amountNaira = amountKobo / 100;

    // 1. Idempotency Check: if already credited in DB
    if (paymentAttempt.status === 'successful') {
      const { data: walletData } = await client
        .from('wallet_accounts')
        .select('balance_kobo')
        .eq('id', paymentAttempt.wallet_id)
        .single();

      const currentBalanceKobo = walletData ? Number(walletData.balance_kobo) : amountKobo;

      return {
        success: true,
        status: 'successful',
        isDuplicate: true,
        reference: paymentAttempt.reference,
        amountNaira,
        amountKobo,
        newBalanceNaira: currentBalanceKobo / 100,
        newBalanceKobo: currentBalanceKobo,
      };
    }

    // 2. Query Payment Provider Gateway
    const provider = customProvider || PaymentProviderFactory.getProvider(paymentAttempt.provider);
    const verifyResponse = await provider.verifyPayment({
      internalReference: paymentAttempt.reference,
      providerReference: paymentAttempt.provider_reference || undefined,
    });

    if (verifyResponse.status !== 'successful') {
      const newStatus = verifyResponse.status === 'failed' ? 'failed' : 'pending';
      await client
        .from('payment_attempts')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentAttempt.id);

      return {
        success: false,
        status: newStatus,
        reference: paymentAttempt.reference,
        amountNaira,
        amountKobo,
        errorCode: 'PAYMENT_UNCONFIRMED',
        errorMessage: verifyResponse.responseMessage || 'Payment has not been confirmed by the provider.',
      };
    }

    // 3. Strict Financial Validation: Verify exact amount & currency
    if (verifyResponse.amountKobo !== amountKobo) {
      await client
        .from('payment_attempts')
        .update({
          status: 'amount_mismatch' as any,
          metadata: {
            expected_kobo: amountKobo,
            received_kobo: verifyResponse.amountKobo,
            mismatch_flag: true,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentAttempt.id);

      return {
        success: false,
        status: 'amount_mismatch',
        reference: paymentAttempt.reference,
        amountNaira,
        amountKobo,
        errorCode: 'AMOUNT_MISMATCH',
        errorMessage: `Payment amount mismatch: expected ₦${amountNaira} but received ₦${verifyResponse.amountKobo / 100}. Crediting halted for security audit.`,
      };
    }

    if (verifyResponse.currency !== 'NGN') {
      return {
        success: false,
        status: 'failed',
        reference: paymentAttempt.reference,
        amountNaira,
        amountKobo,
        errorCode: 'INVALID_CURRENCY',
        errorMessage: `Invalid payment currency: ${verifyResponse.currency}. Only NGN is supported.`,
      };
    }

    // 4. Atomic Wallet Credit via Stored Procedure
    const idempotencyKey = paymentAttempt.idempotency_key || `FUND-${paymentAttempt.user_id}-${paymentAttempt.reference}`;

    const { data: creditResult, error: creditErr } = await (client.rpc as any)(
      'credit_wallet_from_payment',
      {
        p_user_id: paymentAttempt.user_id,
        p_payment_attempt_id: paymentAttempt.id,
        p_idempotency_key: idempotencyKey,
      }
    );

    const credit = creditResult as any;
    if (creditErr || !credit || !credit.success) {
      return {
        success: false,
        status: 'failed',
        reference: paymentAttempt.reference,
        amountNaira,
        amountKobo,
        errorCode: 'CREDIT_FAILED',
        errorMessage: creditErr?.message || 'Database error executing wallet credit.',
      };
    }

    const newBalanceKobo = Number(credit.balance_kobo);

    return {
      success: true,
      status: 'successful',
      reference: paymentAttempt.reference,
      amountNaira,
      amountKobo,
      newBalanceNaira: newBalanceKobo / 100,
      newBalanceKobo,
      walletTxId: credit.transaction_id,
      paidAt: verifyResponse.paidAt,
      channel: verifyResponse.channel as string,
    };
  }

  /**
   * Processes an incoming payment webhook.
   */
  static async processWebhook(
    rawPayload: any,
    signatureHeader?: string,
    customProvider?: PaymentProvider,
    client = supabase
  ): Promise<VerifyFundingResult> {
    const provider = customProvider || PaymentProviderFactory.getDefaultProvider();
    const webhookRes = await provider.parseAndVerifyWebhook(rawPayload, signatureHeader);

    if (!webhookRes.isValid || !webhookRes.internalReference) {
      return {
        success: false,
        status: 'failed',
        reference: '',
        amountNaira: 0,
        amountKobo: 0,
        errorCode: 'INVALID_WEBHOOK_SIGNATURE',
        errorMessage: webhookRes.errorMessage || 'Invalid webhook signature or malformed payload.',
      };
    }

    // Execute authoritative verification and credit
    return this.verifyAndCreditPayment(webhookRes.internalReference, customProvider, client);
  }
}
