import { supabase } from './supabase';
import { ElectricityProviderFactory, ElectricityProvider } from './providers';
import type { Database, ElectricityTxStatusEnum } from '@/types/database';

export type ElectricityTxRow = Database['public']['Tables']['electricity_transactions']['Row'];

export interface InitiatePurchaseDto {
  userId: string;
  meterId?: string;
  meterNumber: string;
  meterType?: 'prepaid' | 'postpaid';
  discoCode: string;
  discoName?: string;
  amountNaira: number;
  customerPhone?: string;
  customerEmail?: string;
  clientRequestId?: string;
}

export interface PurchaseResult {
  success: boolean;
  status: ElectricityTxStatusEnum;
  isDuplicate?: boolean;
  transactionId?: string;
  reference: string;
  token?: string;
  unitsKwh?: number;
  tariffPerKwhKobo?: number;
  amountNaira: number;
  serviceFeeNaira: number;
  totalChargeNaira: number;
  meterNumber: string;
  discoCode: string;
  discoName: string;
  customerName?: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface PrePurchaseQuote {
  amountNaira: number;
  serviceFeeNaira: number;
  totalChargeNaira: number;
  meterNumber: string;
  maskedMeterNumber: string;
  discoCode: string;
  discoName: string;
  estimatedUnitsKwh: number;
}

/**
 * Server-Authoritative Electricity Purchase and STS Token Vending Engine.
 * Handles validation, idempotency, wallet debiting, provider dispatch, and automatic refunding.
 */
export class PurchaseService {
  // In-flight mutex to block rapid double-taps before network round-trips
  private static inFlightPurchases: Set<string> = new Set();

  /**
   * Generates a collision-resistant internal reference format: SE-YYYYMMDD-XXXXXXXX
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
    return `SE-${dateStr}-${rand}`;
  }

  /**
   * Generates a pre-purchase quote with transparent breakdown of face value and fees.
   */
  static getPrePurchaseQuote(amountNaira: number, meterNumber: string, discoCode: string): PrePurchaseQuote {
    const sanitizedAmount = Math.max(0, Math.floor(amountNaira));
    const serviceFeeNaira = 0; // Promotional zero fee
    const totalChargeNaira = sanitizedAmount + serviceFeeNaira;
    const cleanMeter = meterNumber.replace(/\s/g, '');
    const maskedMeterNumber = cleanMeter.length > 4 ? `••••${cleanMeter.slice(-4)}` : cleanMeter;
    const estimatedUnitsKwh = parseFloat((sanitizedAmount / 206.8).toFixed(1));

    return {
      amountNaira: sanitizedAmount,
      serviceFeeNaira,
      totalChargeNaira,
      meterNumber: cleanMeter,
      maskedMeterNumber,
      discoCode,
      discoName: discoCode.toUpperCase(),
      estimatedUnitsKwh,
    };
  }

  /**
   * Orchestrates the complete purchase transaction lifecycle.
   */
  static async executePurchase(
    dto: InitiatePurchaseDto,
    customProvider?: ElectricityProvider,
    client = supabase
  ): Promise<PurchaseResult> {
    // 1. Validate Input Data
    if (!dto.userId) {
      return {
        success: false,
        status: 'failed',
        reference: '',
        amountNaira: dto.amountNaira,
        serviceFeeNaira: 0,
        totalChargeNaira: dto.amountNaira,
        meterNumber: dto.meterNumber,
        discoCode: dto.discoCode,
        discoName: dto.discoName || dto.discoCode.toUpperCase(),
        errorCode: 'UNAUTHENTICATED',
        errorMessage: 'User must be authenticated to perform electricity purchase.',
      };
    }

    const sanitizedMeter = (dto.meterNumber || '').replace(/\s/g, '');
    if (!sanitizedMeter || sanitizedMeter.length < 8) {
      return {
        success: false,
        status: 'failed',
        reference: '',
        amountNaira: dto.amountNaira,
        serviceFeeNaira: 0,
        totalChargeNaira: dto.amountNaira,
        meterNumber: dto.meterNumber,
        discoCode: dto.discoCode,
        discoName: dto.discoName || dto.discoCode.toUpperCase(),
        errorCode: 'INVALID_METER_NUMBER',
        errorMessage: 'Meter number must be between 8 and 13 digits.',
      };
    }

    if (!Number.isFinite(dto.amountNaira) || dto.amountNaira < 500) {
      return {
        success: false,
        status: 'failed',
        reference: '',
        amountNaira: dto.amountNaira,
        serviceFeeNaira: 0,
        totalChargeNaira: dto.amountNaira,
        meterNumber: sanitizedMeter,
        discoCode: dto.discoCode,
        discoName: dto.discoName || dto.discoCode.toUpperCase(),
        errorCode: 'INVALID_AMOUNT',
        errorMessage: 'Minimum purchase amount is ₦500.00.',
      };
    }

    if (dto.amountNaira > 500000) {
      return {
        success: false,
        status: 'failed',
        reference: '',
        amountNaira: dto.amountNaira,
        serviceFeeNaira: 0,
        totalChargeNaira: dto.amountNaira,
        meterNumber: sanitizedMeter,
        discoCode: dto.discoCode,
        discoName: dto.discoName || dto.discoCode.toUpperCase(),
        errorCode: 'LIMIT_EXCEEDED',
        errorMessage: 'Maximum single purchase limit is ₦500,000.00.',
      };
    }

    // 2. Verify Meter Ownership if meterId is provided
    if (dto.meterId) {
      const { data: meterRow } = await client
        .from('meters')
        .select('id, user_id')
        .eq('id', dto.meterId)
        .eq('user_id', dto.userId)
        .single();

      if (!meterRow) {
        return {
          success: false,
          status: 'failed',
          reference: '',
          amountNaira: dto.amountNaira,
          serviceFeeNaira: 0,
          totalChargeNaira: dto.amountNaira,
          meterNumber: sanitizedMeter,
          discoCode: dto.discoCode,
          discoName: dto.discoName || dto.discoCode.toUpperCase(),
          errorCode: 'UNAUTHORIZED_METER',
          errorMessage: 'The specified meter is not registered under your account.',
        };
      }
    }

    const amountKobo = Math.round(dto.amountNaira * 100);
    const serviceFeeKobo = 0; // Current promotional rate
    const totalChargeKobo = amountKobo + serviceFeeKobo;

    const reference = this.generateInternalReference();
    const idempotencyKey = `ELEC-${dto.userId}-${dto.clientRequestId || reference}`;

    // 3. Client-side Rapid Double-Tap Lock Check
    const lockKey = `${dto.userId}:${sanitizedMeter}:${amountKobo}`;
    if (this.inFlightPurchases.has(lockKey)) {
      return {
        success: false,
        status: 'processing',
        reference,
        amountNaira: dto.amountNaira,
        serviceFeeNaira: 0,
        totalChargeNaira: dto.amountNaira,
        meterNumber: sanitizedMeter,
        discoCode: dto.discoCode,
        discoName: dto.discoName || dto.discoCode.toUpperCase(),
        errorCode: 'CONCURRENT_REQUEST',
        errorMessage: 'A purchase is already being processed for this meter. Please wait.',
      };
    }

    this.inFlightPurchases.add(lockKey);

    try {
      let transactionId: string;
      
      // Try executing atomically with the execute_electricity_purchase_init RPC first
      const { data: initRpcResult, error: initRpcError } = await client.rpc('execute_electricity_purchase_init', {
        p_user_id: dto.userId,
        p_meter_id: dto.meterId || null,
        p_meter_number: sanitizedMeter,
        p_meter_type: dto.meterType || 'prepaid',
        p_disco_code: dto.discoCode.toLowerCase(),
        p_disco_name: dto.discoName || dto.discoCode.toUpperCase(),
        p_amount_kobo: amountKobo,
        p_service_fee_kobo: serviceFeeKobo,
        p_reference: reference,
        p_idempotency_key: idempotencyKey,
        p_provider_name: customProvider ? customProvider.providerName : 'vtpass'
      });

      if (initRpcError && initRpcError.code === 'PGRST202') {
        // Fallback to client-side logic:
        // 4. Idempotency Check: if transaction already exists for this idempotency key
        const { data: existingTx } = await client
          .from('electricity_transactions')
          .select('*')
          .eq('idempotency_key', idempotencyKey)
          .single();

        if (existingTx) {
          return {
            success: existingTx.status === 'successful',
            status: existingTx.status,
            isDuplicate: true,
            transactionId: existingTx.id,
            reference: existingTx.reference,
            token: existingTx.token || undefined,
            unitsKwh: existingTx.units_kwh || undefined,
            amountNaira: dto.amountNaira,
            serviceFeeNaira: 0,
            totalChargeNaira: dto.amountNaira,
            meterNumber: sanitizedMeter,
            discoCode: dto.discoCode,
            discoName: dto.discoName || dto.discoCode.toUpperCase(),
          };
        }

        // 5. Ensure Wallet Account exists
        let { data: wallet } = await client
          .from('wallet_accounts')
          .select('*')
          .eq('user_id', dto.userId)
          .single();

        if (!wallet) {
          const { data: newWallet } = await client
            .from('wallet_accounts')
            .insert({ user_id: dto.userId, balance_kobo: 0, currency: 'NGN', is_locked: false })
            .select()
            .single();
          wallet = newWallet;
        }

        if (!wallet) {
          return {
            success: false,
            status: 'failed',
            reference,
            amountNaira: dto.amountNaira,
            serviceFeeNaira: 0,
            totalChargeNaira: dto.amountNaira,
            meterNumber: sanitizedMeter,
            discoCode: dto.discoCode,
            discoName: dto.discoName || dto.discoCode.toUpperCase(),
            errorCode: 'WALLET_ERROR',
            errorMessage: 'Unable to access wallet account.',
          };
        }

        if (wallet.is_locked) {
          return {
            success: false,
            status: 'failed',
            reference,
            amountNaira: dto.amountNaira,
            serviceFeeNaira: 0,
            totalChargeNaira: dto.amountNaira,
            meterNumber: sanitizedMeter,
            discoCode: dto.discoCode,
            discoName: dto.discoName || dto.discoCode.toUpperCase(),
            errorCode: 'WALLET_LOCKED',
            errorMessage: 'Your wallet account is locked. Please contact support.',
          };
        }

        if (wallet.balance_kobo < totalChargeKobo) {
          return {
            success: false,
            status: 'failed',
            reference,
            amountNaira: dto.amountNaira,
            serviceFeeNaira: 0,
            totalChargeNaira: dto.amountNaira,
            meterNumber: sanitizedMeter,
            discoCode: dto.discoCode,
            discoName: dto.discoName || dto.discoCode.toUpperCase(),
            errorCode: 'INSUFFICIENT_FUNDS',
            errorMessage: 'Insufficient wallet balance for this purchase.',
          };
        }

        // 6. Insert transaction in 'processing' state
        const { data: createdTx, error: txError } = await client
          .from('electricity_transactions')
          .insert({
            user_id: dto.userId,
            wallet_id: wallet.id,
            meter_id: dto.meterId || null,
            meter_number: sanitizedMeter,
            disco_code: dto.discoCode.toLowerCase(),
            amount_kobo: amountKobo,
            status: 'processing',
            reference,
            provider_name: customProvider ? customProvider.providerName : 'vtpass',
            idempotency_key: idempotencyKey,
          })
          .select()
          .single();

        if (txError || !createdTx) {
          // If unique constraint violation on idempotency_key, fetch existing
          const { data: duplicateTx } = await client
            .from('electricity_transactions')
            .select('*')
            .eq('idempotency_key', idempotencyKey)
            .single();

          if (duplicateTx) {
            return {
              success: duplicateTx.status === 'successful',
              status: duplicateTx.status,
              isDuplicate: true,
              transactionId: duplicateTx.id,
              reference: duplicateTx.reference,
              token: duplicateTx.token || undefined,
              unitsKwh: duplicateTx.units_kwh || undefined,
              amountNaira: dto.amountNaira,
              serviceFeeNaira: 0,
              totalChargeNaira: dto.amountNaira,
              meterNumber: sanitizedMeter,
              discoCode: dto.discoCode,
              discoName: dto.discoName || dto.discoCode.toUpperCase(),
            };
          }

          return {
            success: false,
            status: 'failed',
            reference,
            amountNaira: dto.amountNaira,
            serviceFeeNaira: 0,
            totalChargeNaira: dto.amountNaira,
            meterNumber: sanitizedMeter,
            discoCode: dto.discoCode,
            discoName: dto.discoName || dto.discoCode.toUpperCase(),
            errorCode: 'DATABASE_ERROR',
            errorMessage: txError?.message || 'Unable to create electricity transaction.',
          };
        }

        transactionId = createdTx.id;

        // 7. Atomic Wallet Debit via Stored Procedure
        const { data: debitResult, error: debitError } = await (client.rpc as any)(
          'debit_wallet_for_electricity',
          {
            p_user_id: dto.userId,
            p_amount_kobo: totalChargeKobo,
            p_electricity_tx_id: transactionId,
            p_idempotency_key: idempotencyKey,
          }
        );

        const debit = debitResult as any;
        if (debitError || !debit || !debit.success) {
          await client.from('electricity_transactions').delete().eq('id', transactionId);
          return {
            success: false,
            status: 'failed',
            reference,
            amountNaira: dto.amountNaira,
            serviceFeeNaira: 0,
            totalChargeNaira: dto.amountNaira,
            meterNumber: sanitizedMeter,
            discoCode: dto.discoCode,
            discoName: dto.discoName || dto.discoCode.toUpperCase(),
            errorCode: debit?.error || 'DEBIT_FAILED',
            errorMessage: debit?.error === 'INSUFFICIENT_BALANCE' ? 'Insufficient wallet balance' : 'Wallet debit failed.',
          };
        }
      } else {
        // Handle RPC response
        if (initRpcError) {
          return {
            success: false,
            status: 'failed',
            reference,
            amountNaira: dto.amountNaira,
            serviceFeeNaira: 0,
            totalChargeNaira: dto.amountNaira,
            meterNumber: sanitizedMeter,
            discoCode: dto.discoCode,
            discoName: dto.discoName || dto.discoCode.toUpperCase(),
            errorCode: 'DATABASE_ERROR',
            errorMessage: initRpcError.message || 'Database initialization failed.',
          };
        }

        const res = initRpcResult as any;
        if (!res.success) {
          return {
            success: false,
            status: 'failed',
            reference,
            amountNaira: dto.amountNaira,
            serviceFeeNaira: 0,
            totalChargeNaira: dto.amountNaira,
            meterNumber: sanitizedMeter,
            discoCode: dto.discoCode,
            discoName: dto.discoName || dto.discoCode.toUpperCase(),
            errorCode: res.error_code || 'INIT_FAILED',
            errorMessage: res.error_message || 'Purchase initialization failed.',
          };
        }

        if (res.is_duplicate) {
          return {
            success: res.status === 'successful',
            status: res.status,
            isDuplicate: true,
            transactionId: res.transaction_id,
            reference: res.reference,
            token: res.token || undefined,
            unitsKwh: res.units_kwh || undefined,
            amountNaira: dto.amountNaira,
            serviceFeeNaira: 0,
            totalChargeNaira: dto.amountNaira,
            meterNumber: sanitizedMeter,
            discoCode: dto.discoCode,
            discoName: dto.discoName || dto.discoCode.toUpperCase(),
          };
        }

        transactionId = res.transaction_id;
      }

      // 8. Call Electricity Provider Gateway
      const provider = customProvider || ElectricityProviderFactory.getDefaultProvider();
      let vendResult;

      try {
        vendResult = await provider.vendToken({
          meterNumber: sanitizedMeter,
          discoCode: dto.discoCode,
          amountKobo,
          meterType: dto.meterType || 'prepaid',
          customerPhoneNumber: dto.customerPhone,
          customerEmail: dto.customerEmail,
          idempotencyKey,
          internalReference: reference,
        });
      } catch (providerErr: any) {
        console.error('[PurchaseService] Unhandled provider exception:', providerErr);
        vendResult = {
          success: false,
          status: 'unknown' as const,
          amountKobo,
          internalReference: reference,
          responseMessage: `Provider gateway unreachable: ${providerErr?.message}`,
        };
      }

      // 9. Settle Transaction Result
      if (vendResult.success && vendResult.status === 'successful' && vendResult.token) {
        const unitsKwh = vendResult.unitsKwh || parseFloat((dto.amountNaira / 206.8).toFixed(1));
        const tariffPerKwhKobo = vendResult.tariffPerKwhKobo || 20680;

        const { data: finalizeData, error: finalizeError } = await client.rpc('finalize_electricity_purchase_success', {
          p_transaction_id: transactionId,
          p_provider_tx_id: vendResult.providerReference || null,
          p_token: vendResult.token,
          p_units_kwh: unitsKwh,
          p_tariff_per_kwh_kobo: tariffPerKwhKobo,
        });

        if (finalizeError && finalizeError.code === 'PGRST202') {
          // Fallback to client-side updates:
          await client
            .from('electricity_transactions')
            .update({
              status: 'successful',
              provider_transaction_id: vendResult.providerReference || null,
              token: vendResult.token,
              units_kwh: unitsKwh,
              tariff_per_kwh_kobo: tariffPerKwhKobo,
              updated_at: new Date().toISOString(),
            })
            .eq('id', transactionId);

          // Record consumption
          if (dto.meterId) {
            try {
              await client.from('consumption_records').insert({
                user_id: dto.userId,
                meter_id: dto.meterId,
                date: new Date().toISOString().split('T')[0],
                units_consumed_kwh: unitsKwh,
                estimated_cost_kobo: amountKobo,
              });
            } catch {
              // ignore conflict
            }
          }

          // Send notification
          await client.from('notifications').insert({
            user_id: dto.userId,
            type: 'purchase',
            title: 'Electricity Token Vended!',
            body: `Token: ${vendResult.token} (${unitsKwh} kWh)`,
            data: {
              transaction_id: transactionId,
              token: vendResult.token,
              units_kwh: unitsKwh,
              reference,
            },
          });
        }

        return {
          success: true,
          status: 'successful',
          transactionId,
          reference,
          token: vendResult.token,
          unitsKwh,
          tariffPerKwhKobo: tariffPerKwhKobo,
          amountNaira: dto.amountNaira,
          serviceFeeNaira: 0,
          totalChargeNaira: dto.amountNaira,
          meterNumber: sanitizedMeter,
          discoCode: dto.discoCode,
          discoName: dto.discoName || dto.discoCode.toUpperCase(),
          completedAt: new Date().toISOString(),
        };
      }

      if (vendResult.status === 'failed') {
        // FAILED: Execute automatic wallet refund via Stored Procedure
        const { data: finalizeFailData, error: finalizeFailError } = await client.rpc('finalize_electricity_purchase_failure', {
          p_transaction_id: transactionId,
          p_failure_code: 'PROVIDER_ERROR',
          p_failure_message: vendResult.responseMessage || 'Vending failed with provider',
        });

        if (finalizeFailError && finalizeFailError.code === 'PGRST202') {
          // Fallback to old refund function:
          await (client.rpc as any)('refund_electricity_purchase', {
            p_user_id: dto.userId,
            p_electricity_tx_id: transactionId,
            p_reason: vendResult.responseMessage || 'Vending failed with provider',
          });
        }

        return {
          success: false,
          status: 'failed',
          transactionId,
          reference,
          amountNaira: dto.amountNaira,
          serviceFeeNaira: 0,
          totalChargeNaira: dto.amountNaira,
          meterNumber: sanitizedMeter,
          discoCode: dto.discoCode,
          discoName: dto.discoName || dto.discoCode.toUpperCase(),
          errorCode: 'PROVIDER_ERROR',
          errorMessage: vendResult.responseMessage || 'Electricity vending could not be completed. Your wallet balance has been refunded.',
        };
      }

      // PENDING / TIMEOUT / UNKNOWN: Do NOT refund yet. Keep transaction in-flight for reconciliation
      const terminalStatus = vendResult.status === 'pending' ? 'pending' : 'unknown';
      await client
        .from('electricity_transactions')
        .update({
          status: terminalStatus,
          error_message: vendResult.responseMessage || 'Transaction pending confirmation from utility switch.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transactionId);

      return {
        success: false,
        status: terminalStatus,
        transactionId,
        reference,
        amountNaira: dto.amountNaira,
        serviceFeeNaira: 0,
        totalChargeNaira: dto.amountNaira,
        meterNumber: sanitizedMeter,
        discoCode: dto.discoCode,
        discoName: dto.discoName || dto.discoCode.toUpperCase(),
        errorMessage: 'Transaction is currently processing with the utility gateway. We are confirming the status.',
      };
    } finally {
      this.inFlightPurchases.delete(lockKey);
    }
  }

  /**
   * Retrieves a single transaction receipt by reference.
   */
  static async getTransactionReceipt(reference: string, userId?: string, client = supabase) {
    let query = client.from('electricity_transactions').select('*').eq('reference', reference);
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query.single();
    if (error || !data) {
      return null;
    }
    return data as ElectricityTxRow;
  }
}
