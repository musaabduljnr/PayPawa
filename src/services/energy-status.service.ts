import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ColorPalette } from '@/constants/theme';
import type { AppNotification } from '@/context/AppContext';

export type EnergyStatusLevel = 'healthy' | 'medium' | 'low';

export interface EnergyStatusThresholds {
  readonly healthyMinPercent: number; // > 50%
  readonly mediumMinPercent: number;  // > 20% and <= 50%
  readonly lowMaxPercent: number;     // <= 20%
}

export const DEFAULT_ENERGY_STATUS_THRESHOLDS: EnergyStatusThresholds = {
  healthyMinPercent: 50,
  mediumMinPercent: 20,
  lowMaxPercent: 20,
} as const;

export interface EnergyStatusResult {
  status: EnergyStatusLevel | null;
  isAvailable: boolean;
  color: string;
  label: 'Healthy' | 'Medium' | 'Low' | 'Unavailable';
  accessibilityLabel: string;
  clampedPercentage: number;
}

export interface StatusTransitionNotification {
  type: AppNotification['type'];
  title: string;
  body: string;
  fromStatus: EnergyStatusLevel;
  toStatus: EnergyStatusLevel;
}

export class EnergyStatusService {
  /**
   * Authoritative deterministic energy status calculation.
   * Maps remaining percentage and KWh to status level and visual indicator color.
   */
  static getEnergyStatus(
    remainingPercentage: number | null | undefined,
    kwhLeft: number | null | undefined,
    colors: ColorPalette,
    thresholds: EnergyStatusThresholds = DEFAULT_ENERGY_STATUS_THRESHOLDS,
    daysRemaining?: number | null | undefined
  ): EnergyStatusResult {
    const isKwhAvailable = kwhLeft !== null && kwhLeft !== undefined && !isNaN(Number(kwhLeft));
    const isPercentAvailable = remainingPercentage !== null && remainingPercentage !== undefined && !isNaN(Number(remainingPercentage));

    if (!isKwhAvailable || !isPercentAvailable) {
      return {
        status: null,
        isAvailable: false,
        color: colors.outlineVariant,
        label: 'Unavailable',
        accessibilityLabel: 'Electricity status unavailable',
        clampedPercentage: 0,
      };
    }

    const clampedPercentage = Math.min(100, Math.max(0, Number(remainingPercentage)));

    // If exact duration in days is provided, use duration-guided classification
    if (daysRemaining !== null && daysRemaining !== undefined && !isNaN(Number(daysRemaining))) {
      const days = Number(daysRemaining);
      if (days > 7 || clampedPercentage > thresholds.healthyMinPercent) {
        return {
          status: 'healthy',
          isAvailable: true,
          color: colors.secondary,
          label: 'Healthy',
          accessibilityLabel: `Healthy: ${Math.round(clampedPercentage)}% remaining (${Math.round(Number(kwhLeft))} kWh, ~${Math.round(days)} days)`,
          clampedPercentage,
        };
      } else if (days > 2 || clampedPercentage > thresholds.mediumMinPercent) {
        return {
          status: 'medium',
          isAvailable: true,
          color: '#eab308',
          label: 'Medium',
          accessibilityLabel: `Caution: ${Math.round(clampedPercentage)}% remaining (${Math.round(Number(kwhLeft))} kWh, ~${Math.round(days)} days)`,
          clampedPercentage,
        };
      } else {
        return {
          status: 'low',
          isAvailable: true,
          color: colors.error || '#ef4444',
          label: 'Low',
          accessibilityLabel: `Low: ${Math.round(clampedPercentage)}% remaining (${Math.round(Number(kwhLeft))} kWh, ~${Math.round(days)} days)`,
          clampedPercentage,
        };
      }
    }

    // GREEN: remaining percentage > 50%
    if (clampedPercentage > thresholds.healthyMinPercent) {
      return {
        status: 'healthy',
        isAvailable: true,
        color: colors.secondary, // Green active arc
        label: 'Healthy',
        accessibilityLabel: `Healthy: ${Math.round(clampedPercentage)}% remaining (${Math.round(Number(kwhLeft))} kWh)`,
        clampedPercentage,
      };
    }

    // YELLOW: remaining percentage > 20% AND <= 50%
    if (clampedPercentage > thresholds.mediumMinPercent && clampedPercentage <= thresholds.healthyMinPercent) {
      return {
        status: 'medium',
        isAvailable: true,
        color: '#eab308', // Amber / Warning yellow active arc
        label: 'Medium',
        accessibilityLabel: `Caution: ${Math.round(clampedPercentage)}% remaining (${Math.round(Number(kwhLeft))} kWh)`,
        clampedPercentage,
      };
    }

    // RED: remaining percentage <= 20%
    return {
      status: 'low',
      isAvailable: true,
      color: colors.error || '#ef4444', // Red / Critical active arc
      label: 'Low',
      accessibilityLabel: `Low: ${Math.round(clampedPercentage)}% remaining (${Math.round(Number(kwhLeft))} kWh)`,
      clampedPercentage,
    };
  }

  /**
   * Generates notification payload strictly on valid status transitions.
   * Returns null if no transition occurred or transition doesn't warrant notification.
   */
  static getTransitionNotification(
    fromStatus: EnergyStatusLevel | null,
    toStatus: EnergyStatusLevel | null
  ): StatusTransitionNotification | null {
    if (!fromStatus || !toStatus || fromStatus === toStatus) {
      return null;
    }

    // GREEN -> YELLOW
    if (fromStatus === 'healthy' && toStatus === 'medium') {
      return {
        type: 'info',
        title: 'Electricity Level Decreasing ⚡',
        body: 'Your electricity level is getting lower. Consider planning your next recharge.',
        fromStatus,
        toStatus,
      };
    }

    // YELLOW -> RED
    if (fromStatus === 'medium' && toStatus === 'low') {
      return {
        type: 'alert',
        title: 'Low Electricity Warning ⚠️',
        body: 'Your electricity is running low. Consider recharging soon to avoid running out.',
        fromStatus,
        toStatus,
      };
    }

    // RED -> GREEN
    if (fromStatus === 'low' && toStatus === 'healthy') {
      return {
        type: 'purchase',
        title: 'Meter Recharged Successfully ⚡',
        body: 'Your electricity has been recharged. Your meter is back to a healthy level.',
        fromStatus,
        toStatus,
      };
    }

    // GREEN -> RED (Rapid drop / high load)
    if (fromStatus === 'healthy' && toStatus === 'low') {
      return {
        type: 'alert',
        title: 'Low Electricity Warning ⚠️',
        body: 'Your electricity level is low. Consider recharging soon.',
        fromStatus,
        toStatus,
      };
    }

    // RED -> MEDIUM (Partial recharge)
    if (fromStatus === 'low' && toStatus === 'medium') {
      return {
        type: 'info',
        title: 'Electricity Partially Recharged',
        body: 'Your meter balance is in the caution range. Consider recharging further for a full buffer.',
        fromStatus,
        toStatus,
      };
    }

    return null;
  }

  /**
   * Storage key for meter status persistence.
   */
  private static getStorageKey(meterId: string): string {
    return `@paypawa_meter_status_${meterId}`;
  }

  /**
   * Evaluates status transition for a meter, persists state across app restarts,
   * and fires notification only on genuine state changes (prevents spam on re-renders).
   */
  static async handleMeterStatusTransition(
    meterId: string,
    currentStatus: EnergyStatusLevel | null,
    notifyFn: (notif: { type: AppNotification['type']; title: string; body: string }) => void
  ): Promise<StatusTransitionNotification | null> {
    if (!meterId || !currentStatus) return null;

    try {
      const storageKey = this.getStorageKey(meterId);
      const prevStored = await AsyncStorage.getItem(storageKey);

      if (!prevStored) {
        // Initial recording on fresh install or new meter - store without spamming notification
        await AsyncStorage.setItem(storageKey, currentStatus);
        return null;
      }

      const prevStatus = prevStored as EnergyStatusLevel;

      if (prevStatus === currentStatus) {
        // No change -> No notification
        return null;
      }

      // Status transitioned -> generate notification
      const transitionNotif = this.getTransitionNotification(prevStatus, currentStatus);

      // Persist the new status
      await AsyncStorage.setItem(storageKey, currentStatus);

      if (transitionNotif) {
        notifyFn({
          type: transitionNotif.type,
          title: transitionNotif.title,
          body: transitionNotif.body,
        });
      }

      return transitionNotif;
    } catch (err) {
      console.warn('[EnergyStatusService] Error managing meter status transition:', err);
      return null;
    }
  }
}
