import type { 
  Database, 
  AccountTypeEnum, 
  ApplianceTypeEnum, 
  UsageFrequencyEnum 
} from './database';

export type { AccountTypeEnum, ApplianceTypeEnum, UsageFrequencyEnum };

export type UserProfile = Database['public']['Tables']['profiles']['Row'];
export type UserProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type UserProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export type EnergyProfile = Database['public']['Tables']['energy_profiles']['Row'];
export type EnergyProfileInsert = Database['public']['Tables']['energy_profiles']['Insert'];
export type EnergyProfileUpdate = Database['public']['Tables']['energy_profiles']['Update'];

export type UserAppliance = Database['public']['Tables']['user_appliances']['Row'];
export type UserApplianceInsert = Database['public']['Tables']['user_appliances']['Insert'];

export interface SignUpParams {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  accountType?: AccountTypeEnum;
}

export interface SignInParams {
  email: string;
  password: string;
}

export interface AuthState {
  session: any | null;
  user: any | null;
  profile: UserProfile | null;
  energyProfile: EnergyProfile | null;
  appliances: UserAppliance[];
  isLoading: boolean;
  isAuthenticated: boolean;
  isOnboarded: boolean;
}

export interface ApplianceItemInput {
  applianceType: ApplianceTypeEnum | string;
  quantity: number;
  usageFrequency: UsageFrequencyEnum | string;
  weeklyHours?: number;
  estimatedDailyKwh?: number;
}
