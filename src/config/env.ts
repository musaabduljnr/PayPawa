/**
 * Client-safe environment configuration.
 * All properties exposed here are prefixed with EXPO_PUBLIC_ and bundled into the client build.
 * Hardened with authoritative production fallbacks to ensure standalone APKs never point to unreachable dummy hosts.
 */

// Authoritative Live Project Credentials (client-safe, protected by Supabase RLS)
const PRODUCTION_SUPABASE_URL = 'https://ohaartcdjulywktqjzqp.supabase.co';
const PRODUCTION_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYWFydGNkanVseXdrdHFqenFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NTQ1ODIsImV4cCI6MjEwMzMzMDU4Mn0.yHiweBzFjowP7BbnLqRxh1Ytc61C91dZ0YK6ZBqM-mI';

export const Config = {
  appEnv: process.env.EXPO_PUBLIC_APP_ENV || 'production',
  supabase: {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL || PRODUCTION_SUPABASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || PRODUCTION_SUPABASE_ANON_KEY,
  },
  paystack: {
    publicKey: process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY || '',
  },
  squad: {
    baseUrl: process.env.EXPO_PUBLIC_SQUAD_BASE_URL || 'https://api-d.squadco.com',
  },
  app: {
    currency: process.env.EXPO_PUBLIC_DEFAULT_CURRENCY || 'NGN',
    supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@paypawa.ng',
    isProduction: (process.env.EXPO_PUBLIC_APP_ENV || 'production') === 'production',
  },
} as const;

// Startup validation to catch unconfigured environments early
if (__DEV__) {
  if (!Config.supabase.url || Config.supabase.url.includes('demo.supabase.co')) {
    console.error('[Config] CRITICAL: Invalid Supabase URL detected:', Config.supabase.url);
  }
}

