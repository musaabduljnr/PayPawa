import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import {
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '@/types/notifications';

const PREFS_STORAGE_PREFIX = '@paypawa_notif_prefs_';

export class NotificationPreferencesService {
  /**
   * Retrieves notification preferences for a user.
   * Merges Supabase record with local AsyncStorage cache for instant offline responsiveness.
   */
  static async getPreferences(userId: string): Promise<NotificationPreferences> {
    if (!userId) {
      return { userId: '', ...DEFAULT_NOTIFICATION_PREFERENCES };
    }

    const defaultPrefs: NotificationPreferences = {
      userId,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    };

    try {
      // 1. Read from local storage first for instant load
      let cachedPrefs: NotificationPreferences | null = null;
      try {
        const raw = await AsyncStorage.getItem(`${PREFS_STORAGE_PREFIX}${userId}`);
        if (raw) {
          cachedPrefs = JSON.parse(raw);
        }
      } catch (err) {
        console.warn('[NotificationPreferencesService] Error reading cached preferences:', err);
      }

      // 2. Fetch authoritative preferences from Supabase
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (data && !error) {
        const remotePrefs: NotificationPreferences = {
          userId: data.user_id,
          lowBalanceEnabled: data.low_balance_enabled ?? true,
          unusualUsageEnabled: data.unusual_usage_enabled ?? true,
          rechargeReminderEnabled: data.recharge_reminder_enabled ?? true,
          purchaseUpdatesEnabled: data.purchase_updates_enabled ?? true,
          walletFundingEnabled: data.wallet_funding_enabled ?? true,
          aiInsightsEnabled: data.ai_insights_enabled ?? true,
          channelInApp: data.channel_in_app ?? true,
          channelPush: data.channel_push ?? false,
          channelEmail: data.channel_email ?? false,
          channelSms: data.channel_sms ?? false,
          updatedAt: data.updated_at,
        };

        // Cache locally for offline resilience
        await AsyncStorage.setItem(
          `${PREFS_STORAGE_PREFIX}${userId}`,
          JSON.stringify(remotePrefs)
        );

        return remotePrefs;
      }

      return cachedPrefs || defaultPrefs;
    } catch (e) {
      console.warn('[NotificationPreferencesService] Error loading preferences:', e);
      return defaultPrefs;
    }
  }

  /**
   * Updates user notification preferences in both Supabase and AsyncStorage.
   */
  static async updatePreferences(
    userId: string,
    partial: Partial<Omit<NotificationPreferences, 'userId'>>
  ): Promise<NotificationPreferences> {
    if (!userId) {
      throw new Error('User ID is required to update notification preferences');
    }

    const current = await this.getPreferences(userId);
    const updated: NotificationPreferences = {
      ...current,
      ...partial,
      updatedAt: new Date().toISOString(),
    };

    // 1. Persist locally immediately
    try {
      await AsyncStorage.setItem(
        `${PREFS_STORAGE_PREFIX}${userId}`,
        JSON.stringify(updated)
      );
    } catch (err) {
      console.warn('[NotificationPreferencesService] Error updating local preferences:', err);
    }

    // 2. Persist to Supabase
    try {
      await (supabase.from('notification_preferences') as any).upsert({
        user_id: userId,
        low_balance_enabled: updated.lowBalanceEnabled,
        unusual_usage_enabled: updated.unusualUsageEnabled,
        recharge_reminder_enabled: updated.rechargeReminderEnabled,
        purchase_updates_enabled: updated.purchaseUpdatesEnabled,
        wallet_funding_enabled: updated.walletFundingEnabled,
        ai_insights_enabled: updated.aiInsightsEnabled,
        channel_in_app: updated.channelInApp,
        channel_push: updated.channelPush,
        channel_email: updated.channelEmail,
        channel_sms: updated.channelSms,
        updated_at: updated.updatedAt,
      });
    } catch (e) {
      console.warn('[NotificationPreferencesService] Error updating Supabase preferences:', e);
    }

    return updated;
  }
}
