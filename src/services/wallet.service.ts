import { supabase } from './supabase';
import { WalletFundingService } from './wallet-funding.service';
import type { Database, PaymentMethodEnum } from '@/types/database';
import type { PaymentMethodType } from './payment-providers';

export interface WalletInfo {
  id: string;
  userId: string;
  balanceKobo: number;
  balanceNaira: number;
  currency: string;
  isLocked: boolean;
}

export type WalletAccountRow = Database['public']['Tables']['wallet_accounts']['Row'];

export class WalletService {
  /**
   * Retrieves the authoritative wallet balance for a user from Supabase.
   */
  static async getWallet(userId: string, client = supabase): Promise<WalletInfo> {
    const { data, error } = await client
      .from('wallet_accounts')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return {
        id: '',
        userId,
        balanceKobo: 0,
        balanceNaira: 0,
        currency: 'NGN',
        isLocked: false,
      };
    }

    const row = data as WalletAccountRow;
    return {
      id: row.id,
      userId: row.user_id,
      balanceKobo: Number(row.balance_kobo),
      balanceNaira: Number(row.balance_kobo) / 100,
      currency: row.currency,
      isLocked: row.is_locked,
    };
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
