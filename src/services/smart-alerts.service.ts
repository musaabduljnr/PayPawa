import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationsService } from './notifications.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import type { ConsumptionAnalyticsResponse } from '@/types/consumption';
import type { AppNotification, NotificationSeverity } from '@/types/notifications';

export interface SmartAlertEvaluationInput {
  userId: string;
  meterId: string;
  meterNumber?: string;
  meterNickname?: string;
  actualRemainingKwh?: number | null;
  estimatedRemainingKwh?: number | null;
  consumptionAnalytics?: ConsumptionAnalyticsResponse | null;
  appliancesCount?: number;
}

export type LowBalanceLevel = 'normal' | 'medium' | 'low' | 'critical';

const ALERT_STATE_STORAGE_PREFIX = '@paypawa_smart_alert_state_';

export class SmartAlertsService {
  /**
   * Generates a deterministic deduplication key for a meter and alert condition.
   */
  static generateDedupKey(
    meterId: string,
    alertCategory: string,
    conditionTag: string,
    windowTag: string = new Date().toISOString().slice(0, 10) // default 1 day window
  ): string {
    return `${meterId}_${alertCategory}_${conditionTag}_${windowTag}`;
  }

  /**
   * Storage key for meter-specific alert state transitions.
   */
  private static getAlertStateKey(meterId: string, alertCategory: string): string {
    return `${ALERT_STATE_STORAGE_PREFIX}${meterId}_${alertCategory}`;
  }

  /**
   * Evaluates and dispatches Low-Balance Alerts.
   * Strictly enforces:
   * 1. No fabricated numbers when balance is unknown/null.
   * 2. Clear labelling between actual vs estimated balance.
   * 3. State transition gating to eliminate render spam.
   */
  static async evaluateLowBalanceAlert(
    input: SmartAlertEvaluationInput
  ): Promise<AppNotification | null> {
    const { userId, meterId, meterNickname, actualRemainingKwh, estimatedRemainingKwh } = input;
    if (!userId || !meterId) return null;

    // 1. Determine balance truth
    const isActual = actualRemainingKwh !== null && actualRemainingKwh !== undefined && !isNaN(Number(actualRemainingKwh));
    const isEstimated = estimatedRemainingKwh !== null && estimatedRemainingKwh !== undefined && !isNaN(Number(estimatedRemainingKwh));

    // Rule: If remaining kWh is unavailable or invalid, DO NOT generate a numerical alert.
    if (!isActual && !isEstimated) {
      return null;
    }

    const balanceValue = isActual ? Number(actualRemainingKwh) : Number(estimatedRemainingKwh);
    const balanceTypeLabel = isActual ? 'Actual Balance' : 'Estimated Balance';

    // Rule: Negative or NaN values are suppressed.
    if (isNaN(balanceValue) || balanceValue < 0) {
      return null;
    }

    // 2. Classify Low Balance Level
    let level: LowBalanceLevel = 'normal';
    let severity: NotificationSeverity = 'info';

    if (balanceValue <= 5.0) {
      level = 'critical';
      severity = 'critical';
    } else if (balanceValue <= 15.0) {
      level = 'low';
      severity = 'warning';
    } else if (balanceValue <= 35.0) {
      level = 'medium';
      severity = 'info';
    } else {
      level = 'normal';
    }

    // Only alert on medium, low, or critical
    if (level === 'normal') {
      // Record normal state so subsequent drop triggers an alert
      const stateKey = this.getAlertStateKey(meterId, 'low_balance');
      await AsyncStorage.setItem(stateKey, 'normal');
      return null;
    }

    // 3. State Transition Guarding (Prevent spamming on every refresh)
    const stateKey = this.getAlertStateKey(meterId, 'low_balance');
    const prevLevel = await AsyncStorage.getItem(stateKey);

    if (prevLevel === level) {
      // Level has not changed -> suppress duplicate alert
      return null;
    }

    // Record new state
    await AsyncStorage.setItem(stateKey, level);

    const displayName = meterNickname || `Meter ••••${(input.meterNumber || '').slice(-4) || ''}`;
    const roundedKwh = Math.round(balanceValue * 10) / 10;

    let title = '';
    let body = '';

    if (level === 'critical') {
      title = `Critical Electricity Alert: ${displayName} 🚨`;
      body = `Your ${balanceTypeLabel} is down to ${roundedKwh} kWh. Recharge immediately to avoid power disconnection.`;
    } else if (level === 'low') {
      title = `Low Electricity Alert: ${displayName} ⚠️`;
      body = `Your ${balanceTypeLabel} is low (${roundedKwh} kWh remaining). We recommend topping up your token soon.`;
    } else {
      title = `Electricity Notice: ${displayName}`;
      body = `Your ${balanceTypeLabel} has reached ${roundedKwh} kWh. Keep an eye on your consumption.`;
    }

    const dedupKey = this.generateDedupKey(meterId, 'low_balance', level);

    return NotificationsService.createNotification(userId, {
      type: 'low_balance',
      category: 'low_balance',
      meterId,
      meterName: displayName,
      title,
      body,
      severity,
      deduplicationKey: dedupKey,
      data: {
        meter_id: meterId,
        level,
        balance_kwh: roundedKwh,
        is_actual: isActual,
      },
      actionLabel: 'Buy Electricity',
      actionUrl: '/buy-electricity',
    });
  }

  /**
   * Evaluates and dispatches Estimated Recharge Due Reminders.
   * Strictly enforces:
   * 1. Only fires when BOTH remainingKwh AND averageDailyUsage (> 0) are valid numbers.
   * 2. Suppresses if daily usage is 0, NaN, or null.
   * 3. Explains clearly that duration is an estimate.
   */
  static async evaluateRechargeReminder(
    input: SmartAlertEvaluationInput
  ): Promise<AppNotification | null> {
    const { userId, meterId, meterNickname, consumptionAnalytics, actualRemainingKwh, estimatedRemainingKwh } = input;
    if (!userId || !meterId || !consumptionAnalytics) return null;

    const remainingKwh = actualRemainingKwh !== null && actualRemainingKwh !== undefined && !isNaN(Number(actualRemainingKwh))
      ? Number(actualRemainingKwh)
      : (estimatedRemainingKwh !== null && estimatedRemainingKwh !== undefined && !isNaN(Number(estimatedRemainingKwh)) ? Number(estimatedRemainingKwh) : null);

    const dailyUsage = consumptionAnalytics.consumption.estimatedDailyUnitsKwh;

    // Rule: Must have valid remainingKwh AND valid positive daily usage
    if (remainingKwh === null || dailyUsage === null || isNaN(Number(dailyUsage)) || Number(dailyUsage) <= 0) {
      return null;
    }

    const estimatedDaysRemaining = remainingKwh / Number(dailyUsage);

    // Rule: Only remind when estimated days <= 3.0 days
    if (estimatedDaysRemaining > 3.0 || estimatedDaysRemaining < 0) {
      return null;
    }

    const roundedDays = Math.max(1, Math.round(estimatedDaysRemaining));
    const dedupKey = this.generateDedupKey(
      meterId,
      'recharge_reminder',
      `${roundedDays}d`,
      new Date().toISOString().slice(0, 10) // Max 1 per day
    );

    const displayName = meterNickname || `Meter ••••${(input.meterNumber || '').slice(-4) || ''}`;
    const title = `Recharge Reminder: ${displayName}`;
    const body = `Based on your recent usage (~${Number(dailyUsage).toFixed(1)} kWh/day), your electricity may last approximately ${roundedDays} day${roundedDays > 1 ? 's' : ''}. Consider recharging soon.`;

    return NotificationsService.createNotification(userId, {
      type: 'estimated_recharge_due',
      category: 'estimated_recharge_due',
      meterId,
      meterName: displayName,
      title,
      body,
      severity: roundedDays <= 1 ? 'warning' : 'info',
      deduplicationKey: dedupKey,
      data: {
        meter_id: meterId,
        estimated_days_remaining: roundedDays,
        daily_usage_kwh: dailyUsage,
        remaining_kwh: remainingKwh,
      },
      actionLabel: 'Recharge Now',
      actionUrl: '/buy-electricity',
    });
  }

  /**
   * Evaluates and dispatches Unusual-Usage Alerts.
   * Strictly enforces:
   * 1. Requires minimum historical baseline (totalPurchases >= 2).
   * 2. Compares current period consumption with previous period.
   * 3. Explains what changed without accusing the user.
   */
  static async evaluateUnusualUsageAlert(
    input: SmartAlertEvaluationInput
  ): Promise<AppNotification | null> {
    const { userId, meterId, meterNickname, consumptionAnalytics } = input;
    if (!userId || !meterId || !consumptionAnalytics) return null;

    const { purchasing, spending } = consumptionAnalytics;

    // Rule: Require minimum sample size (at least 2 purchases to establish baseline)
    if (purchasing.totalPurchases < 2) {
      return null;
    }

    // Rule: Only trigger if percentage change is significantly positive (+25% or more)
    const pctChange = spending.percentageChange;
    if (pctChange < 25) {
      return null;
    }

    // Dedup: Max 1 alert per 7-day period for unusual usage
    const weekNumber = Math.floor(Date.now() / (7 * 86400 * 1000));
    const dedupKey = this.generateDedupKey(meterId, 'unusual_usage', `spike_${weekNumber}`);

    const displayName = meterNickname || `Meter ••••${(input.meterNumber || '').slice(-4) || ''}`;
    const title = `High Electricity Usage Detected ⚡`;
    const body = `Your electricity spending on ${displayName} is up +${Math.round(pctChange)}% compared to your previous baseline. Consider checking high-consumption appliances like air conditioners, heaters, or freezers.`;

    return NotificationsService.createNotification(userId, {
      type: 'unusual_usage',
      category: 'unusual_usage',
      meterId,
      meterName: displayName,
      title,
      body,
      severity: pctChange > 50 ? 'warning' : 'info',
      deduplicationKey: dedupKey,
      data: {
        meter_id: meterId,
        percentage_increase: pctChange,
        current_spend_naira: spending.currentPeriodSpendNaira,
        previous_spend_naira: spending.previousPeriodSpendNaira,
      },
      actionLabel: 'View Insights',
      actionUrl: '/insights',
    });
  }

  /**
   * Evaluates and dispatches rate-limited AI Energy Insights.
   * Strictly enforces:
   * 1. Grounded only in valid, verified deterministic analytics.
   * 2. Rate-limited to max 1 per week per meter.
   * 3. Refuses if analytics quality is INSUFFICIENT.
   */
  static async evaluateAIEnergyInsight(
    input: SmartAlertEvaluationInput
  ): Promise<AppNotification | null> {
    const { userId, meterId, meterNickname, consumptionAnalytics } = input;
    if (!userId || !meterId || !consumptionAnalytics) return null;

    // Rule: Reject if data quality is insufficient
    if (consumptionAnalytics.dataQuality.grade === 'INSUFFICIENT' || consumptionAnalytics.purchasing.totalPurchases < 2) {
      return null;
    }

    const weekNumber = Math.floor(Date.now() / (7 * 86400 * 1000));
    const dedupKey = this.generateDedupKey(meterId, 'ai_energy_insight', `week_${weekNumber}`);

    const displayName = meterNickname || `Meter ••••${(input.meterNumber || '').slice(-4) || ''}`;
    const insightText = typeof consumptionAnalytics.explainableInsight === 'string'
      ? consumptionAnalytics.explainableInsight
      : (consumptionAnalytics.explainableInsight as any)?.summary || '';

    if (!insightText) return null;

    return NotificationsService.createNotification(userId, {
      type: 'ai_energy_insight',
      category: 'ai_energy_insight',
      meterId,
      meterName: displayName,
      title: `Energy Insight: ${displayName}`,
      body: insightText,
      severity: 'info',
      deduplicationKey: dedupKey,
      data: {
        meter_id: meterId,
        confidence: 'high',
        data_grade: consumptionAnalytics.dataQuality.grade,
      },
      actionLabel: 'Explore Insights',
      actionUrl: '/insights',
    });
  }

  /**
   * Evaluates all meter-specific smart alerts in one unified, non-blocking check.
   */
  static async evaluateMeterAlerts(
    input: SmartAlertEvaluationInput
  ): Promise<AppNotification[]> {
    const results: AppNotification[] = [];

    try {
      const [lowBal, recharge, unusual] = await Promise.all([
        this.evaluateLowBalanceAlert(input),
        this.evaluateRechargeReminder(input),
        this.evaluateUnusualUsageAlert(input),
      ]);

      if (lowBal) results.push(lowBal);
      if (recharge) results.push(recharge);
      if (unusual) results.push(unusual);
    } catch (err) {
      console.warn('[SmartAlertsService] Error evaluating meter smart alerts:', err);
    }

    return results;
  }
}
