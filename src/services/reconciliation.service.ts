import { supabase } from './supabase';
import { ElectricityProviderFactory, ElectricityProvider } from './providers';
import type { Database } from '@/types/database';

type ElectricityTxRow = Database['public']['Tables']['electricity_transactions']['Row'];

export interface ReconciliationResult {
  transactionId: string;
  reference: string;
  previousStatus: string;
  currentStatus: string;
  resolved: boolean;
  token?: string;
  unitsKwh?: number;
  refunded?: boolean;
  message?: string;
}

/**
 * Transaction Reconciliation Service.
 * Safely resolves in-flight, timed-out, or ambiguous utility vending transactions.
 * Completely idempotent: can be triggered via background cron, webhook, or user refresh.
 */
export class ReconciliationService {
  /**
   * Reconciles a single transaction by internal reference or ID.
   */
  static async reconcileTransaction(
    referenceOrId: string,
    customProvider?: ElectricityProvider,
    client = supabase
  ): Promise<ReconciliationResult> {
    // 1. Fetch current transaction state
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(referenceOrId);
    let query = client.from('electricity_transactions').select('*');

    if (isUuid) {
      query = query.eq('id', referenceOrId);
    } else {
      query = query.eq('reference', referenceOrId);
    }

    const { data: tx, error: fetchError } = await query.single();

    if (fetchError || !tx) {
      return {
        transactionId: referenceOrId,
        reference: referenceOrId,
        previousStatus: 'unknown',
        currentStatus: 'not_found',
        resolved: false,
        message: 'Transaction record not found.',
      };
    }

    // 2. If already in a terminal state (successful or reversed), do not re-query
    if (tx.status === 'successful') {
      return {
        transactionId: tx.id,
        reference: tx.reference,
        previousStatus: tx.status,
        currentStatus: 'successful',
        resolved: true,
        token: tx.token || undefined,
        unitsKwh: tx.units_kwh || undefined,
        message: 'Transaction is already confirmed successful.',
      };
    }

    if (tx.status === 'reversed' || tx.status === 'failed') {
      return {
        transactionId: tx.id,
        reference: tx.reference,
        previousStatus: tx.status,
        currentStatus: tx.status,
        resolved: true,
        refunded: true,
        message: 'Transaction is already failed and refunded.',
      };
    }

    // 3. Query Utility Provider
    const provider = customProvider || ElectricityProviderFactory.getDefaultProvider();
    const queryResponse = await provider.queryTransactionStatus({
      internalReference: tx.reference,
      providerReference: tx.provider_transaction_id || undefined,
    });

    // 4. Act on query result
    if (queryResponse.status === 'successful' && queryResponse.token) {
      const unitsKwh = queryResponse.unitsKwh || parseFloat((tx.amount_kobo / 100 / 206.8).toFixed(1));
      const tariffPerKwhKobo = queryResponse.tariffPerKwhKobo || 20680;

      const { data: finalizeData, error: finalizeError } = await client.rpc('finalize_electricity_purchase_success', {
        p_transaction_id: tx.id,
        p_provider_tx_id: queryResponse.providerReference || tx.provider_transaction_id || null,
        p_token: queryResponse.token,
        p_units_kwh: unitsKwh,
        p_tariff_per_kwh_kobo: tariffPerKwhKobo,
      });

      if (finalizeError && finalizeError.code === 'PGRST202') {
        // Fallback to client-side updates:
        await client
          .from('electricity_transactions')
          .update({
            status: 'successful',
            token: queryResponse.token,
            units_kwh: unitsKwh,
            provider_transaction_id: queryResponse.providerReference || tx.provider_transaction_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tx.id);

        if (tx.meter_id) {
          try {
            await client.from('consumption_records').insert({
              user_id: tx.user_id,
              meter_id: tx.meter_id,
              date: new Date().toISOString().split('T')[0],
              units_consumed_kwh: unitsKwh,
              estimated_cost_kobo: tx.amount_kobo,
            });
          } catch {
            // ignore conflict
          }
        }
      }

      return {
        transactionId: tx.id,
        reference: tx.reference,
        previousStatus: tx.status,
        currentStatus: 'successful',
        resolved: true,
        token: queryResponse.token,
        unitsKwh,
        message: 'Reconciliation resolved transaction to SUCCESSFUL.',
      };
    }

    if (queryResponse.status === 'failed') {
      const { data: finalizeFailData, error: finalizeFailError } = await client.rpc('finalize_electricity_purchase_failure', {
        p_transaction_id: tx.id,
        p_failure_code: 'PROVIDER_ERROR',
        p_failure_message: 'Reconciliation resolved transaction to FAILED',
      });

      if (finalizeFailError && finalizeFailError.code === 'PGRST202') {
        // Fallback to old refund function:
        await (client.rpc as any)('refund_electricity_purchase', {
          p_user_id: tx.user_id,
          p_electricity_tx_id: tx.id,
          p_reason: 'Reconciliation resolved transaction to FAILED',
        });
      }

      return {
        transactionId: tx.id,
        reference: tx.reference,
        previousStatus: tx.status,
        currentStatus: 'reversed',
        resolved: true,
        refunded: true,
        message: 'Reconciliation resolved transaction to FAILED. Wallet refunded.',
      };
    }

    // Still pending / processing
    await client
      .from('electricity_transactions')
      .update({
        retry_count: (tx.retry_count || 0) + 1,
        last_polled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tx.id);

    return {
      transactionId: tx.id,
      reference: tx.reference,
      previousStatus: tx.status,
      currentStatus: 'pending',
      resolved: false,
      message: 'Transaction is still in-flight with provider.',
    };
  }

  /**
   * Scans and reconciles all pending/unknown transactions for a user or system-wide.
   */
  static async reconcilePendingTransactions(
    userId?: string,
    customProvider?: ElectricityProvider,
    client = supabase
  ): Promise<ReconciliationResult[]> {
    let query = client
      .from('electricity_transactions')
      .select('*')
      .in('status', ['pending', 'unknown', 'timeout', 'processing'])
      .order('created_at', { ascending: false })
      .limit(20);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: pendingTxs, error } = await query;
    if (error || !pendingTxs || pendingTxs.length === 0) {
      return [];
    }

    const results: ReconciliationResult[] = [];
    for (const tx of pendingTxs) {
      const res = await this.reconcileTransaction(tx.id, customProvider, client);
      results.push(res);
    }

    return results;
  }
}
