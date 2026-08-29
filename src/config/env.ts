/**
 * Client-safe environment configuration.
 * All properties exposed here are prefixed with EXPO_PUBLIC_ and bundled into the client build.
 */
export const Config = {
  appEnv: process.env.EXPO_PUBLIC_APP_ENV || 'development',
  supabase: {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://demo.supabase.co',
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'demo-anon-key',
  },
  paystack: {
    publicKey: process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY || 'pk_test_demo',
  },
  app: {
    currency: process.env.EXPO_PUBLIC_DEFAULT_CURRENCY || 'NGN',
    supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@smartelectricity.ng',
    isProduction: process.env.EXPO_PUBLIC_APP_ENV === 'production',
  },
} as const;
