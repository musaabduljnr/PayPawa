import { supabase } from './supabase';
import { LoggerService } from './logger.service';
import { ReconciliationService } from './reconciliation.service';

export interface WalletLedgerIntegrityResult {
  walletId: string;
  userId: string;
  storedBalanceKobo: number;
  ledgerSumKobo: number;
  driftKobo: number;
  isConsistent: boolean;
  lastTxTimestamp?: string | null;
  totalLedgerEntries: number;
}

export interface StuckPurchaseRecord {
  transactionId: string;
  reference: string;
  providerTransactionId?: string | null;
  userId: string;
  meterNumber: string;
  discoCode: string;
  amountKobo: number;
  status: string;
  idempotencyKey: string;
  createdAt: string;
  elapsedMinutes: number;
}

export class DisasterRecoveryService {
  /**
   * Scans wallets to detect drift between cached balance_kobo and authoritative ledger sum.
   */
  static async checkLedgerIntegrity(walletId?: string): Promise<WalletLedgerIntegrityResult[]> {
    try {
      const { data, error } = await (supabase.rpc as any)('verify_wallet_ledger_integrity', {
        p_wallet_id: walletId || null,
      });

      if (error) {
        LoggerService.error('disaster-recovery', 'ledger.integrity_check_failed', {
          errorCode: 'DATABASE_ERROR',
          message: error.message,
        });
        return [];
      }

      const results: WalletLedgerIntegrityResult[] = (data || []).map((row: any) => ({
        walletId: row.wallet_id,
        userId: row.user_id,
        storedBalanceKobo: Number(row.stored_balance_kobo || 0),
        ledgerSumKobo: Number(row.ledger_sum_kobo || 0),
        driftKobo: Number(row.drift_kobo || 0),
        isConsistent: Boolean(row.is_consistent),
        lastTxTimestamp: row.last_tx_timestamp || null,
        totalLedgerEntries: Number(row.total_ledger_entries || 0),
      }));

      const inconsistentWallets = results.filter((w) => !w.isConsistent);
      if (inconsistentWallets.length > 0) {
        LoggerService.critical('disaster-recovery', 'ledger.inconsistency_detected', {
          message: `Detected ${inconsistentWallets.length} wallet accounts with ledger drift!`,
          metadata: {
            drifts: inconsistentWallets.map((w) => ({
              walletId: w.walletId,
              driftKobo: w.driftKobo,
            })),
          },
        });
      }

      return results;
    } catch (err: any) {
      LoggerService.error('disaster-recovery', 'ledger.integrity_exception', {
        errorCode: 'INTERNAL_ERROR',
        message: err?.message,
      });
      return [];
    }
  }

  /**
   * Controlled financial recovery: restores wallet balance to match authoritative ledger sum.
   * Requires administrative permissions and writes an immutable audit log.
   */
  static async reconcileWalletBalance(
    walletId: string,
    reason: string,
    incidentRef: string
  ): Promise<{ success: boolean; message: string; driftKobo?: number }> {
    try {
      LoggerService.info('disaster-recovery', 'ledger.reconcile_initiated', {
        metadata: { walletId, incidentRef, reason },
      });

      const { data, error } = await (supabase.rpc as any)('reconcile_wallet_balance_from_ledger', {
        p_wallet_id: walletId,
        p_reason: reason,
        p_incident_ref: incidentRef,
      });

      if (error) {
        LoggerService.error('disaster-recovery', 'ledger.reconcile_failed', {
          errorCode: 'DATABASE_ERROR',
          message: error.message,
        });
        return { success: false, message: error.message };
      }

      return {
        success: data?.success ?? true,
        message: data?.message || 'Reconciled successfully',
        driftKobo: data?.drift_kobo,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Unknown error' };
    }
  }

  /**
   * Identifies in-flight or stuck SquadCo purchases requiring recovery.
   */
  static async getUnreconciledPurchases(olderThanMinutes = 5): Promise<StuckPurchaseRecord[]> {
    try {
      const { data, error } = await (supabase.rpc as any)('get_unreconciled_squad_transactions', {
        p_older_than_minutes: olderThanMinutes,
        p_limit: 50,
      });

      if (error) {
        LoggerService.error('disaster-recovery', 'squad.fetch_unreconciled_failed', {
          errorCode: 'DATABASE_ERROR',
          message: error.message,
        });
        return [];
      }

      return (data || []).map((row: any) => ({
        transactionId: row.transaction_id,
        reference: row.reference,
        providerTransactionId: row.provider_transaction_id,
        userId: row.user_id,
        meterNumber: row.meter_number,
        discoCode: row.disco_code,
        amountKobo: Number(row.amount_kobo || 0),
        status: row.status,
        idempotencyKey: row.idempotency_key,
        createdAt: row.created_at,
        elapsedMinutes: Number(row.elapsed_minutes || 0),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Reconciles an individual stuck transaction using ReconciliationService.
   */
  static async recoverStuckPurchase(transactionId: string) {
    return ReconciliationService.reconcileTransaction(transactionId);
  }
}
