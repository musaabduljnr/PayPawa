import { supabase } from './supabase';
import { WalletFundingService } from './wallet-funding.service';
import type { Database } from '@/types/database';
import type { PaymentMethodType } from './payment-providers';

export interface WalletInfo {
  id: string;
  userId: string;
  balanceKobo: number | null;
  balanceNaira: number | null;
  currency: string;
  isLocked: boolean;
  status: 'AVAILABLE' | 'ERROR' | 'UNAVAILABLE';
  errorMessage?: string;
}

export type WalletAccountRow = Database['public']['Tables']['wallet_accounts']['Row'];

export class WalletService {
  /**
   * Retrieves the authoritative wallet balance for a user from Supabase.
   * Differentiates between actual zero balance, missing record, and query failure.
   */
  static async getWallet(userId: string, client = supabase): Promise<WalletInfo> {
    try {
      const { data, error } = await client
        .from('wallet_accounts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        return {
          id: '',
          userId,
          balanceKobo: null,
          balanceNaira: null,
          currency: 'NGN',
          isLocked: false,
          status: 'ERROR',
          errorMessage: error.message,
        };
      }

      if (!data) {
        return {
          id: '',
          userId,
          balanceKobo: null,
          balanceNaira: null,
          currency: 'NGN',
          isLocked: false,
          status: 'UNAVAILABLE',
          errorMessage: 'Wallet record not found.',
        };
      }

      const row = data as WalletAccountRow;
      return {
        id: row.id,
        userId: row.user_id,
        balanceKobo: Number(row.balance_kobo),
        balanceNaira: Number(row.balance_kobo) / 100,
        currency: row.currency || 'NGN',
        isLocked: !!row.is_locked,
        status: 'AVAILABLE',
      };
    } catch (e: any) {
      return {
        id: '',
        userId,
        balanceKobo: null,
        balanceNaira: null,
        currency: 'NGN',
        isLocked: false,
        status: 'ERROR',
        errorMessage: e?.message || 'Database connection error',
      };
    }
  }

  /**
   * Initializes an inbound funding attempt via WalletFundingService.
   */
  static async initializeFunding(
    userId: string,
    amountNaira: number,
    method: PaymentMethodType = 'card',
    customerEmail?: string,
    customerName?: string,
    customerPhone?: string,
    clientRequestId?: string
  ) {
    return WalletFundingService.initializeFunding({
      userId,
      amountNaira,
      paymentMethod: method,
      customerEmail: customerEmail || 'customer@smart-electricity.app',
      customerName,
      customerPhone,
      clientRequestId,
    });
  }

  /**
   * Verifies and credits payment authoritatively.
   */
  static async creditWalletFromPayment(
    referenceOrPaymentId: string
  ) {
    return WalletFundingService.verifyAndCreditPayment(referenceOrPaymentId);
  }
}
