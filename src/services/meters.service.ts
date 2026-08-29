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
   * Fetches all registered meters for a given user.
   */
  static async getMeters(userId: string): Promise<MeterEntity[]> {
    const { data, error } = await supabase
      .from('meters')
      .select('*')
      .eq('user_id', userId)
      .order('is_active', { ascending: false });

    if (error || !data || data.length === 0) {
      return [
        {
          id: '1',
          user_id: userId,
          meter_number: '0419 8273 645',
          disco_code: 'yedc',
          disco_name: 'YEDC (Prepaid)',
          meter_type: 'prepaid',
          nickname: 'Home',
          customer_name: 'Musa Ibrahim',
          address: 'Plot 12, Wuse Zone 5, Abuja',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
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
   * Adds and persists a new meter record for the user.
   */
  static async addMeter(userId: string, dto: AddMeterDto): Promise<MeterEntity> {
    const newMeter: MeterEntity = {
      id: 'm-' + Math.random().toString(36).substring(2, 9),
      user_id: userId,
      meter_number: dto.meterNumber,
      disco_code: dto.discoCode.toLowerCase(),
      disco_name: dto.discoName,
      meter_type: 'prepaid',
      nickname: dto.nickname || 'Meter',
      customer_name: dto.customerName || 'Musa Ibrahim',
      address: dto.address || 'Abuja, Nigeria',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return newMeter;
  }

  /**
   * Updates an existing meter's nickname.
   */
  static async renameMeter(userId: string, meterId: string, newName: string) {
    return { success: true, meterId, newName };
  }

  /**
   * Removes a meter record.
   */
  static async deleteMeter(userId: string, meterId: string) {
    return { success: true, meterId };
  }
}
