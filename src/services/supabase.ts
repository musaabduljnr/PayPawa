import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Config } from '@/config/env';
import type { Database } from '@/types/database';

const isWeb = Platform.OS === 'web';
const isServer = typeof window === 'undefined';

/**
 * Universal safe storage adapter for Native, Web, and SSR Node environments
 */
const safeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (isWeb) {
        if (isServer) return null;
        return window.localStorage.getItem(key);
      }
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (isWeb) {
        if (!isServer) {
          window.localStorage.setItem(key, value);
        }
        return;
      }
      await AsyncStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (isWeb) {
        if (!isServer) {
          window.localStorage.removeItem(key);
        }
        return;
      }
      await AsyncStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

/**
 * Authoritative Supabase Client
 * - Configured with universal safeStorage for robust session persistence across app restarts.
 * - Safe for Expo Router static rendering and Web SSR.
 * - Auto-refreshes JWT tokens.
 * - Uses client-safe anon key.
 */
export const supabase = createClient<Database>(
  Config.supabase.url,
  Config.supabase.anonKey,
  {
    auth: {
      storage: safeStorage,
      autoRefreshToken: !isServer,
      persistSession: !isServer,
      detectSessionInUrl: isWeb && !isServer,
    },
  }
);
