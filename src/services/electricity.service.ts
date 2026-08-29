import { supabase } from './supabase';
import { ElectricityProviderFactory } from './providers';
import { PurchaseService, InitiatePurchaseDto, PurchaseResult } from './purchase.service';
import { ReconciliationService } from './reconciliation.service';
import type { Database, ElectricityTxStatusEnum } from '@/types/database';

export type ElectricityTransactionEntity = Database['public']['Tables']['electricity_transactions']['Row'];

export interface PurchaseElectricityDto {
  userId: string;
  meterId?: string;
  meterNumber: string;
  discoCode: string;
  amountNaira: number;
  phone?: string;
  meterType?: 'prepaid' | 'postpaid';
  clientRequestId?: string;
}

export interface PurchaseElectricityResult {
  success: boolean;
  status: ElectricityTxStatusEnum;
  token?: string;
  unitsKwh?: number;
  reference: string;
  amountNaira: number;
  meterNumber: string;
  discoName: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface VerifyMeterDto {
  meterNumber: string;
  discoCode: string;
  meterType?: 'prepaid' | 'postpaid';
}

export interface VerifyMeterResult {
  success: boolean;
  customerName: string;
  address: string;
  meterNumber: string;
  discoCode: string;
  meterType: 'prepaid' | 'postpaid';
  tariffCode?: string;
  errorMessage?: string;
}

export class ElectricityService {
  /**
   * Validates a meter number with the utility provider.
   */
  static async verifyMeter(dto: VerifyMeterDto): Promise<VerifyMeterResult> {
    const provider = ElectricityProviderFactory.getDefaultProvider();
    const result = await provider.verifyMeter({
      meterNumber: dto.meterNumber,
      discoCode: dto.discoCode,
      meterType: dto.meterType || 'prepaid',
    });

    return {
      success: result.success,
      customerName: result.customerName,
      address: result.address,
      meterNumber: result.meterNumber,
      discoCode: result.discoCode,
      meterType: result.meterType,
      tariffCode: result.tariffCode,
      errorMessage: result.errorMessage,
    };
  }

  /**
   * Orchestrates the complete electricity purchase lifecycle via PurchaseService.
   */
  static async purchaseElectricity(dto: PurchaseElectricityDto): Promise<PurchaseElectricityResult> {
    const result: PurchaseResult = await PurchaseService.executePurchase({
      userId: dto.userId,
      meterId: dto.meterId,
      meterNumber: dto.meterNumber,
      meterType: dto.meterType || 'prepaid',
      discoCode: dto.discoCode,
      amountNaira: dto.amountNaira,
      customerPhone: dto.phone,
      clientRequestId: dto.clientRequestId,
    });

    return {
      success: result.success,
      status: result.status,
      token: result.token,
      unitsKwh: result.unitsKwh,
      reference: result.reference,
      amountNaira: result.amountNaira,
      meterNumber: result.meterNumber,
      discoName: result.discoName,
      completedAt: result.completedAt,
      errorMessage: result.errorMessage,
    };
  }

  /**
   * Authoritatively fetches electricity transaction history from Supabase.
   */
  static async getTransactions(userId: string) {
    const { data, error } = await supabase
      .from('electricity_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map((tx) => ({
      id: tx.id,
      title: 'Token Purchase',
      type: 'purchase' as const,
      date: new Date(tx.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      amount: tx.amount_kobo / 100,
      units: tx.units_kwh || undefined,
      token: tx.token || undefined,
      status:
        tx.status === 'successful'
          ? ('Completed' as const)
          : tx.status === 'processing' || tx.status === 'pending'
          ? ('Pending' as const)
          : ('Failed' as const),
      reference: tx.reference,
      meterNumber: tx.meter_number,
    }));
  }

  /**
   * Reconciles in-flight transactions.
   */
  static async reconcilePending(userId?: string) {
    return ReconciliationService.reconcilePendingTransactions(userId);
  }
}
