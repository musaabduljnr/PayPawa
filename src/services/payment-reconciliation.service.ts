import { supabase } from './supabase';
import { WalletFundingService } from './wallet-funding.service';
import { PaymentProviderFactory, PaymentProvider } from './payment-providers';

export interface PaymentReconciliationItem {
  reference: string;
  paymentAttemptId: string;
  previousStatus: string;
  currentStatus: string;
  amountNaira: number;
  resolved: boolean;
  credited: boolean;
  message: string;
}

export interface LedgerAuditReport {
  userId: string;
  walletId: string;
  currentWalletBalanceNaira: number;
  ledgerCalculatedBalanceNaira: number;
  isReconciled: boolean;
  discrepancyNaira: number;
  totalCreditsNaira: number;
  totalDebitsNaira: number;
  totalRefundsNaira: number;
  totalTransactionsCount: number;
  unresolvedPaymentsCount: number;
  anomalies: string[];
}

export class PaymentReconciliationService {
  /**
   * Reconciles all pending/initiated/unknown payment attempts.
   */
  static async reconcilePendingPayments(
    userId?: string,
    customProvider?: PaymentProvider,
    client = supabase
  ): Promise<PaymentReconciliationItem[]> {
    let query = client
      .from('payment_attempts')
      .select('*')
      .in('status', ['initiated', 'pending'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: attempts, error } = await query;
    if (error || !attempts || attempts.length === 0) {
      return [];
    }

    const results: PaymentReconciliationItem[] = [];

    for (const attempt of attempts) {
      const prevStatus = attempt.status;
      const verifyResult = await WalletFundingService.verifyAndCreditPayment(
        attempt.id,
        customProvider,
        client
      );

      results.push({
        reference: attempt.reference,
        paymentAttemptId: attempt.id,
        previousStatus: prevStatus,
        currentStatus: verifyResult.status,
        amountNaira: Number(attempt.amount_kobo) / 100,
        resolved: verifyResult.status === 'successful' || verifyResult.status === 'failed',
        credited: verifyResult.status === 'successful',
        message: verifyResult.errorMessage || 'Payment successfully resolved.',
      });
    }

    return results;
  }

  /**
   * Performs an authoritative arithmetic audit comparing ledger transactions against wallet balance.
   */
  static async auditUserLedger(userId: string, client = supabase): Promise<LedgerAuditReport> {
    // 1. Fetch wallet
    const { data: wallet } = await client
      .from('wallet_accounts')
      .select('*')
      .eq('user_id', userId)
      .single();

    const currentWalletBalanceNaira = wallet ? Number(wallet.balance_kobo) / 100 : 0;
    const walletId = wallet?.id || '';

    // 2. Fetch all immutable ledger entries
    const { data: ledgerEntries } = await client
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    let netLedgerKobo = 0;
    let totalCreditsKobo = 0;
    let totalDebitsKobo = 0;
    let totalRefundsKobo = 0;
    const anomalies: string[] = [];

    if (ledgerEntries && ledgerEntries.length > 0) {
      for (const entry of ledgerEntries) {
        const amt = Number(entry.amount_kobo);
        netLedgerKobo += amt;

        if (entry.type === 'funding' || entry.type === 'adjustment') {
          totalCreditsKobo += Math.abs(amt);
        } else if (entry.type === 'purchase_debit' || entry.type === 'reversal_debit') {
          totalDebitsKobo += Math.abs(amt);
        } else if (entry.type === 'refund_credit') {
          totalRefundsKobo += Math.abs(amt);
        }

        // Check sequential balance integrity if balance_after_kobo is tracked
        if (Number(entry.balance_after_kobo) < 0) {
          anomalies.push(`Negative balance recorded at ledger entry ${entry.reference}: ₦${Number(entry.balance_after_kobo) / 100}`);
        }
      }
    }

    const calculatedBalanceKobo = netLedgerKobo;
    const calculatedBalanceNaira = calculatedBalanceKobo / 100;
    const discrepancyNaira = Math.abs(currentWalletBalanceNaira - calculatedBalanceNaira);
    const isReconciled = discrepancyNaira === 0;

    if (!isReconciled) {
      anomalies.push(
        `Wallet balance (₦${currentWalletBalanceNaira}) does not match ledger sum (₦${calculatedBalanceNaira}). Discrepancy: ₦${discrepancyNaira}`
      );
    }

    // 3. Count unresolved payments
    const { count: unresolvedCount } = await client
      .from('payment_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['initiated', 'pending']);

    return {
      userId,
      walletId,
      currentWalletBalanceNaira,
      ledgerCalculatedBalanceNaira: calculatedBalanceNaira,
      isReconciled,
      discrepancyNaira,
      totalCreditsNaira: totalCreditsKobo / 100,
      totalDebitsNaira: totalDebitsKobo / 100,
      totalRefundsNaira: totalRefundsKobo / 100,
      totalTransactionsCount: ledgerEntries?.length || 0,
      unresolvedPaymentsCount: unresolvedCount || 0,
      anomalies,
    };
  }
}
