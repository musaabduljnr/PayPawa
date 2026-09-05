/**
 * ============================================================================
 * PAYPAWA: PHASE 11 NOTIFICATION & SMART ALERTS TYPES
 * ============================================================================
 */

export type NotificationCategory =
  | 'low_balance'
  | 'unusual_usage'
  | 'estimated_recharge_due'
  | 'purchase_success'
  | 'purchase_pending'
  | 'purchase_failed'
  | 'token_delivered'
  | 'wallet_funded'
  | 'wallet_funding_failed'
  | 'meter_added'
  | 'meter_verified'
  | 'ai_energy_insight'
  | 'system_announcement';

export type NotificationSeverity = 'info' | 'warning' | 'critical' | 'success';

export type NotificationDeliveryStatus = 'pending' | 'delivered' | 'failed';

export type NotificationChannel = 'in_app' | 'push' | 'email' | 'sms';

export interface NotificationPreferences {
  userId: string;
  lowBalanceEnabled: boolean;
  unusualUsageEnabled: boolean;
  rechargeReminderEnabled: boolean;
  purchaseUpdatesEnabled: boolean;
  walletFundingEnabled: boolean;
  aiInsightsEnabled: boolean;
  channelInApp: boolean;
  channelPush: boolean;
  channelEmail: boolean;
  channelSms: boolean;
  updatedAt?: string;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<NotificationPreferences, 'userId'> = {
  lowBalanceEnabled: true,
  unusualUsageEnabled: true,
  rechargeReminderEnabled: true,
  purchaseUpdatesEnabled: true,
  walletFundingEnabled: true,
  aiInsightsEnabled: true,
  channelInApp: true,
  channelPush: false,
  channelEmail: false,
  channelSms: false,
};

export interface AppNotification {
  id: string;
  userId?: string;
  meterId?: string | null;
  meterName?: string | null;
  type: string;
  category?: NotificationCategory;
  title: string;
  body: string;
  severity: NotificationSeverity;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
  expiresAt?: string | null;
  deliveryStatus?: NotificationDeliveryStatus;
  deliveryChannel?: NotificationChannel;
  deduplicationKey?: string | null;
  relatedTransactionId?: string | null;
  data?: Record<string, any> | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
}
