import { supabase } from './supabase';
import type { 
  EnergyProfile, 
  EnergyProfileInsert, 
  EnergyProfileUpdate,
  UserAppliance, 
  UserApplianceInsert,
  ApplianceItemInput,
  AccountTypeEnum
} from '@/types/auth';

export class EnergyService {
  /**
   * Reference power rating in watts for typical Nigerian appliances.
   * Used strictly for generating baseline initial estimates.
   */
  private static APPLIANCE_WATTAGE_REF: Record<string, number> = {
    light_bulb: 15,          // Energy-saving LED bulb
    television: 100,         // Modern LED TV
    refrigerator: 150,       // Medium efficiency fridge
    freezer: 200,            // Deep chest freezer
    fan: 60,                 // Standing or ceiling fan
    air_conditioner: 1500,   // 1.5 HP Inverter / Split AC
    electric_cooker: 2000,   // Electric hotplate / Induction
    microwave: 1000,         // Standard microwave
    water_heater: 1500,      // Storage water heater
    pumping_machine: 750,    // 1 HP water pump
    pressing_iron: 1000,     // Dry / steam iron
    washing_machine: 500,    // Top / front load washer
    other: 200,
  };

  /**
   * Translates frequency into approximate daily operating hours.
   */
  private static FREQUENCY_HOURS_REF: Record<string, number> = {
    rarely: 0.5,
    occasionally: 2.0,
    daily: 6.0,
    multiple_daily: 12.0,
  };

  /**
   * Calculates estimated daily kWh based on appliance type, quantity, and frequency.
   * IMPORTANT: This is strictly an estimate to guide user awareness, not real meter data.
   */
  static calculateEstimatedDailyKwh(
    applianceType: string,
    quantity: number,
    frequency: string,
    customWeeklyHours?: number
  ): number {
    const watts = this.APPLIANCE_WATTAGE_REF[applianceType] || 100;
    const dailyHours = customWeeklyHours 
      ? customWeeklyHours / 7 
      : (this.FREQUENCY_HOURS_REF[frequency] || 4.0);

    // kWh = (Watts * Hours * Quantity) / 1000
    const rawKwh = (watts * dailyHours * Math.max(1, quantity)) / 1000;
    return parseFloat(rawKwh.toFixed(2));
  }

  /**
   * Retrieves the energy profile for a user.
   */
  static async getEnergyProfile(userId: string): Promise<EnergyProfile | null> {
    try {
      const { data, error } = await supabase
        .from('energy_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) return null;
      return data as EnergyProfile;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves all appliances registered by the user.
   */
  static async getUserAppliances(userId: string): Promise<UserAppliance[]> {
    try {
      const { data, error } = await supabase
        .from('user_appliances')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error || !data) return [];
      return data as UserAppliance[];
    } catch {
      return [];
    }
  }

  /**
   * Saves or updates the complete energy onboarding profile and user appliances.
   * Also updates profiles.onboarding_completed = true.
   */
  static async saveCompleteEnergyProfile(
    userId: string,
    profileData: {
      accountType: AccountTypeEnum;
      occupantsCount: number;
      buildingType?: string;
      primaryCookingSource?: string;
      hasSolar?: boolean;
      hasGenerator?: boolean;
    },
    appliances: ApplianceItemInput[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Upsert Energy Profile
      const { error: profileError } = await supabase
        .from('energy_profiles')
        .upsert(
          {
            user_id: userId,
            account_type: profileData.accountType,
            occupants_count: profileData.occupantsCount,
            building_type: profileData.buildingType || 'flat',
            primary_cooking_source: profileData.primaryCookingSource || 'gas_electric',
            has_solar: !!profileData.hasSolar,
            has_generator: !!profileData.hasGenerator,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (profileError) {
        console.warn('[EnergyService.saveEnergyProfile] Profile error:', profileError);
        throw profileError;
      }

      // 2. Refresh Appliances: Remove old records and insert new structured items
      if (appliances.length > 0) {
        await supabase
          .from('user_appliances')
          .delete()
          .eq('user_id', userId);

        const applianceRows: UserApplianceInsert[] = appliances.map((item) => {
          const dailyKwh = this.calculateEstimatedDailyKwh(
            item.applianceType,
            item.quantity,
            item.usageFrequency,
            item.weeklyHours
          );

          return {
            user_id: userId,
            appliance_type: item.applianceType,
            quantity: item.quantity,
            usage_frequency: item.usageFrequency,
            weekly_hours: item.weeklyHours || 0,
            estimated_daily_kwh: dailyKwh,
          };
        });

        const { error: applianceError } = await supabase
          .from('user_appliances')
          .insert(applianceRows);

        if (applianceError) {
          console.warn('[EnergyService.saveEnergyProfile] Appliance error:', applianceError);
          throw applianceError;
        }
      }

      // 3. Mark Onboarding as Completed in public.profiles
      const { error: markError } = await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          is_onboarded: true,
          account_type: profileData.accountType,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (markError) {
        console.warn('[EnergyService.saveEnergyProfile] Profile mark error:', markError);
        throw markError;
      }

      return { success: true };
    } catch (err: any) {
      console.warn('[EnergyService.saveCompleteEnergyProfile] Failed:', err);
      return {
        success: false,
        error: err?.message || 'Failed to save energy profile. Please try again.',
      };
    }
  }
}
