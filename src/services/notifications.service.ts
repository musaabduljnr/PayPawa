import { supabase } from './supabase';
import type { Database, NotificationTypeEnum } from '@/types/database';

export interface AppNotificationItem {
  id: string;
  type: NotificationTypeEnum;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export class NotificationsService {
  /**
   * Retrieves user notifications ordered by date.
   */
  static async getNotifications(userId: string): Promise<AppNotificationItem[]> {
    return [
      {
        id: 'n1',
        type: 'alert',
        title: 'High Usage Detected',
        body: 'Your electricity usage has been 32% higher than usual over the last 3 days. Consider reducing heavy appliance use.',
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      },
      {
        id: 'n2',
        type: 'purchase',
        title: 'Token Purchase Successful',
        body: 'Your ₦5,000 token purchase was successful. Token: 1234 5678 9012 3456 7890. 38 kWh credited.',
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      },
      {
        id: 'n3',
        type: 'funding',
        title: 'Wallet Funded',
        body: '₦20,000 has been added to your wallet. Your new balance is ₦45,250.',
        read: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      },
      {
        id: 'n4',
        type: 'info',
        title: 'Welcome to SmartElec! ⚡',
        body: 'Track your electricity usage, buy tokens, and manage multiple meters all in one place.',
        read: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
      },
    ];
  }

  static async markRead(notificationId: string) {
    return { success: true, notificationId };
  }

  static async markAllRead(userId: string) {
    return { success: true, userId };
  }
}
