import { supabase } from './supabase';
import { ElectricityProviderFactory } from './providers';
import type { Database } from '@/types/database';

export type MeterEntity = Database['public']['Tables']['meters']['Row'];

export interface AddMeterDto {
  meterNumber: string;
  discoCode: string;
  discoName: string;
  nickname: string;
  customerName?: string;
  address?: string;
}

export class MetersService {
  /**
   * Fetches all registered meters for a given user directly from Supabase.
   * Returns empty array if no meters exist or query fails (never injects fake fallback meters).
   */
  static async getMeters(userId: string): Promise<MeterEntity[]> {
    const { data, error } = await supabase
      .from('meters')
      .select('*')
      .eq('user_id', userId)
      .order('is_active', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data as MeterEntity[];
  }

  /**
   * Dispatches meter verification to the active ElectricityProvider backend.
   */
  static async verifyMeter(meterNumber: string, discoCode: string, meterType: 'prepaid' | 'postpaid' = 'prepaid') {
    const provider = ElectricityProviderFactory.getDefaultProvider();
    return await provider.verifyMeter({
      meterNumber,
      discoCode,
      meterType,
    });
  }

  /**
   * Adds and persists a new meter record for the user to Supabase.
   */
  static async addMeter(userId: string, dto: AddMeterDto): Promise<{ success: boolean; meter?: MeterEntity; error?: string }> {
    const isPostpaid = dto.discoName?.toLowerCase().includes('postpaid');
    const { data, error } = await supabase
      .from('meters')
      .insert({
        user_id: userId,
        meter_number: dto.meterNumber.replace(/\s/g, ''),
        disco_code: dto.discoCode.toLowerCase().replace(/[^a-z]/g, ''),
        disco_name: dto.discoName,
        meter_type: isPostpaid ? 'postpaid' : 'prepaid',
        nickname: dto.nickname || 'Meter',
        customer_name: dto.customerName || null,
        address: dto.address || null,
        is_active: true,
      })
      .select()
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'Failed to persist meter' };
    }

    return { success: true, meter: data as MeterEntity };
  }

  /**
   * Updates an existing meter's nickname in Supabase.
   */
  static async renameMeter(userId: string, meterId: string, newName: string) {
    const { error } = await supabase
      .from('meters')
      .update({ nickname: newName.trim(), updated_at: new Date().toISOString() })
      .eq('id', meterId)
      .eq('user_id', userId);

    return { success: !error, meterId, newName, error: error?.message };
  }

  /**
   * Removes a meter record from Supabase.
   */
  static async deleteMeter(userId: string, meterId: string) {
    const { error } = await supabase
      .from('meters')
      .delete()
      .eq('id', meterId)
      .eq('user_id', userId);

    return { success: !error, meterId, error: error?.message };
  }
}
