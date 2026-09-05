import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { NotificationPreferencesService } from './notification-preferences.service';
import type {
  AppNotification,
  NotificationCategory,
  NotificationSeverity,
  NotificationDeliveryStatus,
  NotificationChannel,
} from '@/types/notifications';

const READ_NOTIFS_PREFIX = '@smart_elec_read_notifs_';
const DEDUP_KEYS_PREFIX = '@smart_elec_dedup_keys_';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateNotificationInput {
  type: string;
  category?: NotificationCategory;
  meterId?: string | null;
  meterName?: string | null;
  title: string;
  body: string;
  severity?: NotificationSeverity;
  deduplicationKey?: string | null;
  relatedTransactionId?: string | null;
  data?: Record<string, any> | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
}

export class NotificationsService {
  /**
   * Retrieves the set of locally marked-as-read notification IDs for a user.
   */
  static async getLocallyReadIds(userId: string): Promise<Set<string>> {
    if (!userId) return new Set();
    try {
      const raw = await AsyncStorage.getItem(`${READ_NOTIFS_PREFIX}${userId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return new Set(parsed);
        }
      }
    } catch (e) {
      console.warn('[NotificationsService] Error reading cached read notification IDs:', e);
    }
    return new Set();
  }

  /**
   * Caches a notification ID as read locally in AsyncStorage.
   */
  static async saveLocallyReadId(userId: string, notificationId: string): Promise<void> {
    if (!userId || !notificationId) return;
    try {
      const readSet = await this.getLocallyReadIds(userId);
      readSet.add(notificationId);
      await AsyncStorage.setItem(
        `${READ_NOTIFS_PREFIX}${userId}`,
        JSON.stringify(Array.from(readSet))
      );
    } catch (e) {
      console.warn('[NotificationsService] Error persisting read notification ID locally:', e);
    }
  }

  /**
   * Caches multiple notification IDs as read locally in AsyncStorage.
   */
  static async saveLocallyReadIds(userId: string, notificationIds: string[]): Promise<void> {
    if (!userId || !notificationIds || notificationIds.length === 0) return;
    try {
      const readSet = await this.getLocallyReadIds(userId);
      for (const id of notificationIds) {
        readSet.add(id);
      }
      await AsyncStorage.setItem(
        `${READ_NOTIFS_PREFIX}${userId}`,
        JSON.stringify(Array.from(readSet))
      );
    } catch (e) {
      console.warn('[NotificationsService] Error persisting multiple read notification IDs locally:', e);
    }
  }

  /**
   * Checks if a deduplication key was already dispatched recently in local storage.
   */
  private static async isLocallyDeduplicated(userId: string, dedupKey: string): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(`${DEDUP_KEYS_PREFIX}${userId}`);
      if (raw) {
        const keys = JSON.parse(raw);
        if (Array.isArray(keys) && keys.includes(dedupKey)) {
          return true;
        }
      }
    } catch (e) {
      console.warn('[NotificationsService] Dedup check error:', e);
    }
    return false;
  }

  /**
   * Records a deduplication key in local storage.
   */
  private static async recordLocalDedupKey(userId: string, dedupKey: string): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(`${DEDUP_KEYS_PREFIX}${userId}`);
      let keys: string[] = [];
      if (raw) {
        keys = JSON.parse(raw);
        if (!Array.isArray(keys)) keys = [];
      }
      keys.push(dedupKey);
      // Keep last 200 keys to avoid unlimited growth
      if (keys.length > 200) keys = keys.slice(-200);
      await AsyncStorage.setItem(`${DEDUP_KEYS_PREFIX}${userId}`, JSON.stringify(keys));
    } catch (e) {
      console.warn('[NotificationsService] Error recording dedup key:', e);
    }
  }

  /**
   * Retrieves user notifications ordered by date with strict meter isolation.
   * When meterId is provided:
   * Returns notifications specifically for that meter PLUS account-wide notifications (meter_id IS NULL).
   * Notifications for another meter are strictly excluded!
   */
  static async getNotifications(
    userId: string,
    meterId?: string | null
  ): Promise<AppNotification[]> {
    if (!userId) return [];

    try {
      const [readSet, { data, error }] = await Promise.all([
        this.getLocallyReadIds(userId),
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      ]);

      if (error) {
        console.warn('[NotificationsService] Error fetching notifications from Supabase:', error);
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Map and filter with strict meter isolation
      const results: AppNotification[] = [];

      for (const n of data) {
        const rowMeterId = n.meter_id || null;

        // Meter Isolation Rule:
        // If a specific meterId is active, only include rows that match rowMeterId OR are account-wide (rowMeterId === null).
        // Notifications for a different meter are NEVER included.
        if (meterId && rowMeterId && rowMeterId !== meterId) {
          continue;
        }

        const isRead = Boolean(n.is_read) || readSet.has(n.id);

        const payload = (n.data && typeof n.data === 'object' && !Array.isArray(n.data) ? n.data : {}) as Record<string, any>;

        results.push({
          id: n.id,
          userId: n.user_id,
          meterId: rowMeterId,
          meterName: payload.meter_name || null,
          type: n.type,
          category: payload.category || (n.type as NotificationCategory),
          title: n.title,
          body: n.body,
          severity: (n.severity as NotificationSeverity) || 'info',
          read: isRead,
          readAt: n.read_at || (isRead ? n.updated_at || n.created_at : null),
          createdAt: n.created_at,
          expiresAt: n.expires_at || null,
          deliveryStatus: (n.delivery_status as NotificationDeliveryStatus) || 'delivered',
          deliveryChannel: (n.delivery_channel as NotificationChannel) || 'in_app',
          deduplicationKey: n.deduplication_key || null,
          relatedTransactionId: n.related_transaction_id || null,
          data: payload || null,
          actionLabel: payload.action_label || null,
          actionUrl: payload.action_url || null,
        });
      }

      return results;
    } catch (err) {
      console.warn('[NotificationsService] Failed to load notifications:', err);
      return [];
    }
  }

  /**
   * Dispatches a notification to Supabase and local cache.
   * Respects user notification category preferences and deduplication keys.
   */
  static async createNotification(
    userId: string,
    input: CreateNotificationInput
  ): Promise<AppNotification | null> {
    if (!userId) return null;

    // 1. Check user preferences before dispatching
    const prefs = await NotificationPreferencesService.getPreferences(userId);
    const cat = input.category || (input.type as NotificationCategory);

    if (cat === 'low_balance' && !prefs.lowBalanceEnabled) {
      return null;
    }
    if (cat === 'unusual_usage' && !prefs.unusualUsageEnabled) {
      return null;
    }
    if (cat === 'estimated_recharge_due' && !prefs.rechargeReminderEnabled) {
      return null;
    }
    if (['purchase_success', 'purchase_failed', 'purchase_pending', 'token_delivered'].includes(cat) && !prefs.purchaseUpdatesEnabled) {
      return null;
    }
    if (['wallet_funded', 'wallet_funding_failed'].includes(cat) && !prefs.walletFundingEnabled) {
      return null;
    }
    if (cat === 'ai_energy_insight' && !prefs.aiInsightsEnabled) {
      return null;
    }

    // 2. Deduplication check
    if (input.deduplicationKey) {
      const isDedup = await this.isLocallyDeduplicated(userId, input.deduplicationKey);
      if (isDedup) {
        return null;
      }
      await this.recordLocalDedupKey(userId, input.deduplicationKey);
    }

    // 3. Normalize database type to legacy enum
    let dbType = 'info';
    if (['purchase_success', 'token_delivered', 'purchase', 'token'].includes(input.type)) {
      dbType = 'purchase';
    } else if (['wallet_funded', 'funding', 'payment'].includes(input.type)) {
      dbType = 'funding';
    } else if (['low_balance', 'unusual_usage', 'alert'].includes(input.type)) {
      dbType = 'alert';
    } else if (input.type === 'billing') {
      dbType = 'billing';
    } else {
      dbType = 'info';
    }

    const payloadData = {
      ...(input.data || {}),
      category: cat,
      meter_name: input.meterName,
      action_label: input.actionLabel,
      action_url: input.actionUrl,
    };

    const newNotif: AppNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      userId,
      meterId: input.meterId || null,
      meterName: input.meterName || null,
      type: input.type,
      category: cat,
      title: input.title,
      body: input.body,
      severity: input.severity || 'info',
      read: false,
      createdAt: new Date().toISOString(),
      deliveryStatus: 'delivered',
      deliveryChannel: 'in_app',
      deduplicationKey: input.deduplicationKey || null,
      relatedTransactionId: input.relatedTransactionId || null,
      data: payloadData,
      actionLabel: input.actionLabel || null,
      actionUrl: input.actionUrl || null,
    };

    // 4. Persist to Supabase
    try {
      const { data, error } = await (supabase
        .from('notifications') as any)
        .insert({
          user_id: userId,
          meter_id: input.meterId || null,
          type: dbType as any,
          title: input.title,
          body: input.body,
          severity: input.severity || 'info',
          deduplication_key: input.deduplicationKey || null,
          related_transaction_id: input.relatedTransactionId || null,
          is_read: false,
          delivery_status: 'delivered',
          delivery_channel: 'in_app',
          data: payloadData,
        })
        .select('id')
        .single();

      if (!error && data?.id) {
        newNotif.id = data.id;
      }
    } catch (e) {
      console.warn('[NotificationsService] Error inserting notification into Supabase:', e);
    }

    return newNotif;
  }

  /**
   * Marks a specific notification as read in both Supabase and AsyncStorage.
   */
  static async markRead(notificationId: string, userId?: string): Promise<{ success: boolean }> {
    if (!notificationId) return { success: false };

    if (userId) {
      await this.saveLocallyReadId(userId, notificationId);
    }

    if (UUID_REGEX.test(notificationId)) {
      try {
        let query = (supabase
          .from('notifications') as any)
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('id', notificationId);

        if (userId) {
          query = query.eq('user_id', userId);
        }

        await query;
      } catch (e) {
        console.warn('[NotificationsService] Supabase markRead error:', e);
      }
    }

    return { success: true };
  }

  /**
   * Marks all notifications as read for a user (and optionally filtered to active meter).
   */
  static async markAllRead(
    userId: string,
    notificationIds?: string[],
    meterId?: string | null
  ): Promise<{ success: boolean }> {
    if (!userId) return { success: false };

    if (notificationIds && notificationIds.length > 0) {
      await this.saveLocallyReadIds(userId, notificationIds);
    }

    try {
      let query = (supabase
        .from('notifications') as any)
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (meterId) {
        // Only mark notifications for this meter or account-wide
        query = query.or(`meter_id.is.null,meter_id.eq.${meterId}`);
      }

      await query;
    } catch (e) {
      console.warn('[NotificationsService] Failed to mark all notifications read in Supabase:', e);
    }

    return { success: true };
  }
}
