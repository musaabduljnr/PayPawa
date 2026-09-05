import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Line,
  G,
} from 'react-native-svg';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp, Transaction } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';
import type { PurchasingCadenceAnalytics, SpendingAnalytics } from '@/types/consumption';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ChartDataPoint {
  label: string;
  fullLabel: string;
  frequency: number;
  amount: number;
}

function generateSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const controlX = (current.x + next.x) / 2;
    d += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }
  return d;
}

function generateAreaPath(points: { x: number; y: number }[], bottomY: number): string {
  if (points.length === 0) return '';
  const linePath = generateSmoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
}

function PurchaseFrequencyLineChart({
  transactions,
  period,
  onPeriodChange,
  purchasing,
  spending,
  cadenceOverride,
  colors,
  isDark,
}: {
  transactions: Transaction[];
  period: 'W' | 'M' | 'Y';
  onPeriodChange: (p: 'W' | 'M' | 'Y') => void;
  purchasing?: PurchasingCadenceAnalytics | null;
  spending?: SpendingAnalytics | null;
  cadenceOverride?: string | null;
  colors: any;
  isDark: boolean;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const purchases = transactions.filter((t) => t.type === 'purchase' && t.status === 'Completed');
  const now = new Date();

  // Aggregate frequency and spend based on authentic transaction dates
  let dataPoints: ChartDataPoint[] = [];

  if (period === 'W') {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const fullDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const counts = Array(7).fill(0);
    const amounts = Array(7).fill(0);

    purchases.forEach((tx) => {
      const txTime = tx.createdAt ? new Date(tx.createdAt).getTime() : (tx.date ? new Date(tx.date).getTime() : NaN);
      const validDate = isNaN(txTime) ? now : new Date(txTime);
      const dayIdx = (validDate.getDay() + 6) % 7;
      counts[dayIdx] = (counts[dayIdx] || 0) + 1;
      amounts[dayIdx] = (amounts[dayIdx] || 0) + Math.abs(tx.amount || 0);
    });

    dataPoints = days.map((label, i) => ({
      label,
      fullLabel: fullDays[i],
      frequency: counts[i],
      amount: amounts[i],
    }));
  } else if (period === 'M') {
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
    const shortLabels = ['W1', 'W2', 'W3', 'W4', 'W5'];
    const counts = Array(5).fill(0);
    const amounts = Array(5).fill(0);

    purchases.forEach((tx) => {
      const txTime = tx.createdAt ? new Date(tx.createdAt).getTime() : (tx.date ? new Date(tx.date).getTime() : NaN);
      const validDate = isNaN(txTime) ? now : new Date(txTime);
      const diffDays = Math.floor((now.getTime() - validDate.getTime()) / (86400 * 1000));
      const weekIdx = Math.min(4, Math.max(0, 4 - Math.floor(diffDays / 7)));
      counts[weekIdx] = (counts[weekIdx] || 0) + 1;
      amounts[weekIdx] = (amounts[weekIdx] || 0) + Math.abs(tx.amount || 0);
    });

    dataPoints = shortLabels.map((label, i) => ({
      label,
      fullLabel: weeks[i],
      frequency: counts[i],
      amount: amounts[i],
    }));
  } else {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fullMonths = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const counts = Array(12).fill(0);
    const amounts = Array(12).fill(0);

    purchases.forEach((tx) => {
      const txTime = tx.createdAt ? new Date(tx.createdAt).getTime() : (tx.date ? new Date(tx.date).getTime() : NaN);
      const validDate = isNaN(txTime) ? now : new Date(txTime);
      const mIdx = validDate.getMonth();
      counts[mIdx] = (counts[mIdx] || 0) + 1;
      amounts[mIdx] = (amounts[mIdx] || 0) + Math.abs(tx.amount || 0);
    });

    dataPoints = months.map((label, i) => ({
      label,
      fullLabel: fullMonths[i],
      frequency: counts[i],
      amount: amounts[i],
    }));
  }

  const totalPeriodSpend = spending?.currentPeriodSpendNaira !== undefined && spending?.currentPeriodSpendNaira !== null
    ? spending.currentPeriodSpendNaira
    : dataPoints.reduce((s, p) => s + p.amount, 0);
  const totalPeriodPurchases = dataPoints.reduce((s, p) => s + p.frequency, 0);

  // SVG Dimension Math
  const chartWidth = Math.max(280, SCREEN_WIDTH - Spacing.containerMargin * 2 - Spacing.md * 2);
  const chartHeight = 145;
  const padLeft = 14;
  const padRight = 14;
  const padTop = 18;
  const padBottom = 24;
  const usableWidth = chartWidth - padLeft - padRight;
  const usableHeight = chartHeight - padTop - padBottom;

  const maxVal = Math.max(...dataPoints.map((d) => d.frequency), 1);

  const points = dataPoints.map((d, i) => {
    const x = padLeft + (i / Math.max(1, dataPoints.length - 1)) * usableWidth;
    const y = padTop + usableHeight - (d.frequency / maxVal) * usableHeight;
    return { x, y, data: d };
  });

  const linePath = generateSmoothPath(points);
  const areaPath = generateAreaPath(points, padTop + usableHeight);

  const activePoint = selectedIdx !== null && points[selectedIdx] ? points[selectedIdx] : points[points.length - 1];

  // Authoritative cadence representation with terminal states
  const cadenceShortText =
    purchasing?.medianIntervalDays !== null && purchasing?.medianIntervalDays !== undefined
      ? `~${purchasing.medianIntervalDays} days`
      : cadenceOverride || (purchasing?.totalPurchases === 0 || purchases.length === 0
      ? 'Awaiting recharge'
      : 'Need 2+ purchases');

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      {/* Header with Title and Timeframe Filter */}
      <View style={styles.chartHeaderRow}>
        <View style={{ flex: 1, marginRight: Spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialIcons name="show-chart" size={18} color={colors.secondaryDark} />
            <Text style={[styles.chartTitle, { color: colors.primary }]} numberOfLines={1}>
              Purchase Frequency
            </Text>
          </View>
          <Text style={[styles.chartSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {period === 'W' ? 'Recharges this week' : period === 'M' ? 'Recharges this month' : 'Recharges this year'}
          </Text>
        </View>

        <View style={[styles.periodFilter, { backgroundColor: colors.surfaceContainerHigh }]}>
          {(['W', 'M', 'Y'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[
                styles.periodBtn,
                period === p ? [styles.periodBtnActive, { backgroundColor: colors.surface }] : null,
              ]}
              onPress={() => {
                setSelectedIdx(null);
                onPeriodChange(p);
              }}
            >
              <Text
                style={[
                  styles.periodBtnText,
                  { color: period === p ? colors.primary : colors.textSecondary },
                ]}
              >
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Metric Highlights Banner (Strict 3-Column Aligned Grid) */}
      <View style={[styles.chartMetricRow, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
        <View style={styles.chartMetricItem}>
          <Text style={[styles.chartMetricLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            Recharges
          </Text>
          <Text style={[styles.chartMetricValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
            {totalPeriodPurchases} {totalPeriodPurchases === 1 ? 'time' : 'times'}
          </Text>
        </View>

        <View style={[styles.chartMetricDivider, { backgroundColor: colors.outlineVariant }]} />

        <View style={styles.chartMetricItem}>
          <Text style={[styles.chartMetricLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            Cadence
          </Text>
          <Text style={[styles.chartMetricValue, { color: colors.secondaryDark }]} numberOfLines={1} adjustsFontSizeToFit>
            {cadenceShortText}
          </Text>
        </View>

        <View style={[styles.chartMetricDivider, { backgroundColor: colors.outlineVariant }]} />

        <View style={styles.chartMetricItem}>
          <Text style={[styles.chartMetricLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            Spend
          </Text>
          <Text style={[styles.chartMetricValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
            ₦{totalPeriodSpend.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Active Selected Point Info Pill */}
      {activePoint && (
        <View style={[styles.activePointPill, { backgroundColor: colors.surfaceContainerHighest }]}>
          <Text style={[styles.activePointPillLabel, { color: colors.textSecondary }]}>
            {activePoint.data.fullLabel}:
          </Text>
          <Text style={[styles.activePointPillValue, { color: colors.primary }]}>
            {activePoint.data.frequency} {activePoint.data.frequency === 1 ? 'recharge' : 'recharges'} (₦{activePoint.data.amount.toLocaleString()})
          </Text>
        </View>
      )}

      {/* SVG Line Graph */}
      <View style={styles.svgContainer}>
        <Svg width={chartWidth} height={chartHeight}>
          <Defs>
            <LinearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.secondaryDark || '#ACF847'} stopOpacity={isDark ? "0.45" : "0.35"} />
              <Stop offset="100%" stopColor={colors.secondaryDark || '#ACF847'} stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          {/* Horizontal Grid Guides */}
          {[0.25, 0.5, 0.75, 1.0].map((ratio, idx) => {
            const gridY = padTop + usableHeight * (1 - ratio);
            return (
              <Line
                key={idx}
                x1={padLeft}
                y1={gridY}
                x2={chartWidth - padRight}
                y2={gridY}
                stroke={colors.outlineVariant}
                strokeDasharray="4 4"
                strokeWidth={1}
                opacity={0.5}
              />
            );
          })}

          {/* Area Fill */}
          <Path d={areaPath} fill="url(#lineGrad)" />

          {/* Smooth Line */}
          <Path
            d={linePath}
            fill="none"
            stroke={colors.secondaryDark || '#77c010'}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Point Markers */}
          {points.map((pt, i) => {
            const isSelected = selectedIdx === i;
            const isPeak = pt.data.frequency === maxVal && maxVal > 0;
            return (
              <G key={i} onPress={() => setSelectedIdx(i)}>
                {/* Hit target */}
                <Circle cx={pt.x} cy={pt.y} r={14} fill="transparent" />
                {/* Glow ring on selection or peak */}
                {(isSelected || isPeak) && (
                  <Circle
                    cx={pt.x}
                    cy={pt.y}
                    r={7}
                    fill={colors.secondaryDark}
                    opacity={0.3}
                  />
                )}
                {/* Point center */}
                <Circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isSelected ? 5 : isPeak ? 4.5 : 3.5}
                  fill={isSelected ? colors.primary : colors.secondaryDark}
                  stroke={colors.cardBg}
                  strokeWidth={2}
                />
              </G>
            );
          })}
        </Svg>

        {/* X-Axis Labels */}
        <View style={[styles.xAxisLabels, { paddingLeft: padLeft - 4, paddingRight: padRight - 4 }]}>
          {dataPoints.map((pt, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => setSelectedIdx(idx)}
              style={styles.xAxisLabelBtn}
            >
              <Text
                style={[
                  styles.xAxisLabelText,
                  {
                    color: selectedIdx === idx ? colors.primary : colors.textSecondary,
                    fontWeight: selectedIdx === idx ? '700' : '500',
                  },
                ]}
              >
                {pt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function InsightsScreen() {
  const {
    transactions,
    refreshTransactions,
    refreshWallet,
    consumptionAnalytics,
    aiAnalytics,
    aiEngineStatus,
    refreshAnalytics,
    recordMeterReading,
    applianceEstimates,
    appliances,
    energyProfile,
    activeMeter,
    askEnergyAssistant,
    suggestedQuestions,
    aiMessages,
    isAiLoading,
    recordAiFeedback,
    clearAiChat,
  } = useApp();
  const { colors, isDark } = useTheme();
  const [chartPeriod, setChartPeriod] = useState<'W' | 'M' | 'Y'>('W');
  const [customQuestion, setCustomQuestion] = useState('');
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);
  const [isReadingModalOpen, setIsReadingModalOpen] = useState(false);
  const [readingInput, setReadingInput] = useState('');
  const [readingStatus, setReadingStatus] = useState<string | null>(null);
  const [isSubmittingReading, setIsSubmittingReading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshTransactions?.();
      refreshWallet?.();
      refreshAnalytics?.(chartPeriod === 'W' ? '7d' : chartPeriod === 'M' ? '30d' : '1y');
    }, [refreshTransactions, refreshWallet, refreshAnalytics, chartPeriod])
  );

  // Meter-scoped successful transactions strictly matching active meter
  const activeTxs = activeMeter
    ? transactions.filter(
        (t) =>
          t.type === 'purchase' &&
          t.status === 'Completed' &&
          t.meterNumber &&
          (t.meterNumber.replace(/\s/g, '').includes(activeMeter.number.replace(/\s/g, '').slice(-4)) ||
           activeMeter.number.replace(/\s/g, '').includes(t.meterNumber.replace(/\s/g, '').slice(-4)))
      )
    : [];

  // ── Profile-anchored burn rate (same logic as home screen) ──────────────────
  // Avg daily usage is always from the user's energy profile setup, not analytics history.
  // This prevents the post-load flicker where analytics overrides with a different burn rate.
  const insightApplianceDailyKwh = appliances.reduce(
    (sum, a) => sum + (Number(a.estimated_daily_kwh) || 0),
    0
  );
  const insightDefaultDailyKwh = energyProfile?.account_type === 'business' ? 24.0 : (energyProfile?.account_type ? 8.5 : 0);
  const insightProfileDailyKwh = insightApplianceDailyKwh > 0 ? insightApplianceDailyKwh : insightDefaultDailyKwh;
  const insightEffectiveDailyKwh = insightProfileDailyKwh > 0 ? insightProfileDailyKwh : 5.0;

  // Compute remaining kWh from the local transaction ledger using the profile burn rate.
  // Sort oldest-first, then decay between each purchase and up to now.
  const sortedActiveTxs = [...activeTxs].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : (a.date ? new Date(a.date).getTime() : 0);
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : (b.date ? new Date(b.date).getTime() : 0);
    return ta - tb;
  });
  const insightTotalPurchasedUnits = sortedActiveTxs.reduce((sum, tx) => {
    const rawUnits = tx.units || (tx.amount ? Math.round((Math.abs(Number(tx.amount)) / 206.8) * 10) / 10 : 0);
    const u = !isNaN(Number(rawUnits)) && Number(rawUnits) > 0 ? Number(rawUnits) : 0;
    return sum + u;
  }, 0);
  let insightRunningBalance = 0;
  let insightLastTs = sortedActiveTxs.length > 0
    ? (sortedActiveTxs[0].createdAt ? new Date(sortedActiveTxs[0].createdAt).getTime() : Date.now())
    : Date.now();
  for (const tx of sortedActiveTxs) {
    const txTime = tx.createdAt ? new Date(tx.createdAt).getTime() : (tx.date ? new Date(tx.date).getTime() : insightLastTs);
    const delta = txTime >= insightLastTs ? Math.max(0, (txTime - insightLastTs) / 86400000) : 0;
    insightRunningBalance = Math.max(0, insightRunningBalance - insightEffectiveDailyKwh * delta);
    const rawUnits = tx.units || (tx.amount ? Math.round((Math.abs(Number(tx.amount)) / 206.8) * 10) / 10 : 0);
    const u = !isNaN(Number(rawUnits)) && Number(rawUnits) > 0 ? Number(rawUnits) : 0;
    insightRunningBalance += u;
    insightLastTs = txTime > 0 ? txTime : insightLastTs;
  }
  const insightFinalDelta = Math.max(0, (Date.now() - insightLastTs) / 86400000);
  insightRunningBalance = Math.max(0, insightRunningBalance - insightEffectiveDailyKwh * insightFinalDelta);
  const insightRemainingKwh = insightTotalPurchasedUnits > 0 ? Math.max(0, Math.round(insightRunningBalance)) : null;
  // Profile-consistent days remaining: remainingKwh / effectiveDailyKwh
  const insightDaysRemaining = insightRemainingKwh !== null && insightRemainingKwh > 0 && insightEffectiveDailyKwh > 0
    ? Math.max(1, Math.round(insightRemainingKwh / insightEffectiveDailyKwh))
    : null;

  const handleSendQuestion = async (qText: string) => {
    if (!qText || qText.trim().length === 0 || isAiLoading) return;
    setCustomQuestion('');
    await askEnergyAssistant(qText.trim(), {
      meterId: activeMeter?.id || null,
      period: chartPeriod === 'W' ? '7d' : chartPeriod === 'M' ? '30d' : '1y',
    });
  };

  const handleRecordReading = async () => {
    if (!activeMeter) {
      setReadingStatus('Please select an active meter first.');
      return;
    }
    const val = parseFloat(readingInput.trim());
    if (isNaN(val) || val < 0) {
      setReadingStatus('Please enter a valid positive kWh number.');
      return;
    }
    setIsSubmittingReading(true);
    setReadingStatus('Saving meter reading...');
    try {
      const result = await recordMeterReading(activeMeter.id, val);
      if (result.success) {
        setReadingStatus(
          result.isAnomalous
            ? `Reading saved! Note: ${result.anomalyReason}`
            : `Reading saved successfully (+${result.deltaKwh || 0} kWh delta).`
        );
        setReadingInput('');
        setTimeout(() => {
          setIsReadingModalOpen(false);
          setReadingStatus(null);
        }, 2200);
      } else {
        setReadingStatus(result.errorMessage || 'Failed to record meter reading.');
      }
    } catch (e: any) {
      setReadingStatus(e?.message || 'Error recording reading.');
    } finally {
      setIsSubmittingReading(false);
    }
  };

  const spending = consumptionAnalytics?.spending;
  const consumption = consumptionAnalytics?.consumption;
  const purchasing = consumptionAnalytics?.purchasing;
  const dataQuality = consumptionAnalytics?.dataQuality;

  // Decoupled, authoritative Purchase Cadence vs Estimated Days Remaining
  const derivedCadence = useMemo(() => {
    const totalCount = purchasing?.totalPurchases ?? activeTxs.length;
    const median = purchasing?.medianIntervalDays ?? null;

    let velocity = purchasing?.purchaseVelocity;
    if (!velocity || velocity.toLowerCase().includes('calculating')) {
      if (totalCount === 0) {
        velocity = 'Awaiting first recharge';
      } else if (totalCount === 1 || median === null) {
        velocity = 'Need 2+ purchases for cadence';
      } else {
        velocity = `Every ~${median} days`;
      }
    }

    // daysLeft is now derived from the profile burn rate ledger (insightDaysRemaining),
    // NOT from forecast.estimatedDaysRemainingRange which used the service's internal burn rate.
    let daysLeft: string;
    if (insightDaysRemaining !== null) {
      daysLeft = `~${insightDaysRemaining} ${insightDaysRemaining === 1 ? 'day' : 'days'}`;
    } else if (totalCount === 0) {
      daysLeft = 'Awaiting recharge';
    } else {
      daysLeft = 'Need 2+ purchases';
    }

    return {
      velocity,
      medianInterval: median,
      totalPurchases: totalCount,
      daysRemaining: daysLeft,
    };
  }, [purchasing, activeTxs, insightDaysRemaining]);

  const getUnitBadge = (src?: string | null) => {
    if (!src) return { text: 'EST', color: colors.textSecondary };
    if (src === 'PROVIDER') return { text: 'DISCO', color: colors.secondaryDark };
    if (src === 'METER' || src === 'USER_REPORTED' || src === 'IOT') return { text: 'ACTUAL', color: colors.secondaryDark };
    return { text: 'EST', color: colors.textSecondary };
  };

  const lineageQuality = dataQuality?.grade || (derivedCadence.totalPurchases === 0 ? 'NO DATA' : 'INSUFFICIENT');
  const lineageSource =
    consumption?.unitSource === 'PROVIDER'
      ? 'DISCO'
      : consumption?.unitSource === 'METER' || consumption?.unitSource === 'USER_REPORTED' || consumption?.unitSource === 'IOT'
      ? 'ACTUAL'
      : (derivedCadence.totalPurchases > 0 ? 'ACTUAL' : 'EST');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1, marginRight: Spacing.sm }}>
            <Text style={[styles.pageTitle, { color: colors.primary }]}>
              Consumption Intelligence
            </Text>
            <Text
              style={[styles.pageSubtitle, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {activeMeter ? `Scoped to ${activeMeter.name} (${activeMeter.disco})` : 'All registered meters'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.notifButton, { backgroundColor: colors.surfaceContainerHighest }]}
            onPress={() => setIsReadingModalOpen(!isReadingModalOpen)}
            accessibilityLabel="Toggle manual meter reading"
          >
            <MaterialIcons name="speed" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Data Quality & Lineage Indicator Banner */}
        <View
          style={[
            styles.lineageBanner,
            {
              backgroundColor: isDark ? colors.surfaceContainerLow : colors.surfaceContainerHighest,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <View style={styles.lineageLeft}>
            <MaterialIcons
              name={dataQuality?.grade === 'STRONG' || dataQuality?.grade === 'GOOD' ? 'verified' : 'info'}
              size={15}
              color={dataQuality?.grade === 'STRONG' ? colors.secondaryDark : colors.primary}
            />
            <Text style={[styles.lineageText, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
              Quality: {lineageQuality} • {lineageSource}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.logReadingBtn,
              {
                backgroundColor: colors.surfaceContainerHighest,
                borderColor: colors.outlineVariant,
                borderWidth: 1,
              },
            ]}
            onPress={() => setIsReadingModalOpen(!isReadingModalOpen)}
            activeOpacity={0.7}
          >
            <Text style={[styles.logReadingBtnText, { color: colors.primary }]}>
              {isReadingModalOpen ? 'Close' : 'Log Reading'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Manual Meter Reading Input Box (Interactive & Reliable) */}
        {isReadingModalOpen && (
          <View style={[styles.readingModalCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <MaterialIcons name="speed" size={17} color={colors.secondaryDark} />
                <Text style={[styles.readingModalTitle, { color: colors.primary }]} numberOfLines={1}>
                  Log Cumulative Meter Reading
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsReadingModalOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.readingModalBody, { color: colors.textSecondary }]}>
              Enter the exact cumulative kWh value displayed on your meter to calibrate usage evidence.
            </Text>
            <View style={styles.modalInputRow}>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.surfaceContainerHigh,
                    borderColor: colors.outlineVariant,
                    color: colors.primary,
                  },
                ]}
                placeholder="e.g. 14250.5"
                placeholderTextColor={colors.outline}
                keyboardType="decimal-pad"
                value={readingInput}
                onChangeText={setReadingInput}
                editable={!isSubmittingReading}
                returnKeyType="done"
                onSubmitEditing={handleRecordReading}
              />
              <TouchableOpacity
                disabled={!readingInput.trim() || isSubmittingReading}
                style={[
                  styles.modalSubmitBtn,
                  {
                    backgroundColor: readingInput.trim() ? colors.secondaryDark : colors.outlineVariant,
                    opacity: isSubmittingReading ? 0.7 : 1,
                  },
                ]}
                onPress={handleRecordReading}
                activeOpacity={0.8}
              >
                {isSubmittingReading ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={[styles.modalSubmitText, { color: '#000000' }]}>
                    Save Reading
                  </Text>
                )}
              </TouchableOpacity>
            </View>
            {readingStatus && (
              <Text style={[styles.modalStatusText, { color: colors.primary }]}>
                {readingStatus}
              </Text>
            )}
          </View>
        )}

        {/* Summary Bento Grid (No Overlaps, Clean Typography) */}
        <View style={styles.bentoContainer}>
          {/* Estimated Days Left (Wide Hero Card) */}
          <View style={[styles.bentoHeroCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={styles.bentoHeaderRow}>
              <Text style={[styles.bentoLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                Estimated Days Left
              </Text>
              <View style={[styles.estBadge, { backgroundColor: colors.surfaceContainerHighest }]}>
                <Text style={[styles.estBadgeText, { color: colors.textSecondary }]}>EST</Text>
              </View>
            </View>

            <Text
              style={[styles.bentoBigValue, { color: colors.primary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {derivedCadence.daysRemaining}
            </Text>

            <View style={[styles.bentoVelocityRow, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
              <MaterialIcons name="query-builder" size={13} color={colors.secondaryDark} />
              <Text style={[styles.bentoVelocityText, { color: colors.secondaryDark }]} numberOfLines={1}>
                Cadence: {derivedCadence.velocity}
              </Text>
            </View>
          </View>

          {/* Spend & Units 2-Column Row (Clean Vertical Layout - Never Truncated) */}
          <View style={styles.bentoRow}>
            {/* Period Spend */}
            <View style={[styles.bentoColCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
              <Text style={[styles.bentoLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                {chartPeriod === 'W' ? '7-Day Spend' : chartPeriod === 'M' ? 'Monthly Spend' : 'Annual Spend'}
              </Text>
              <Text style={[styles.bentoValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                ₦{(spending?.currentPeriodSpendNaira ?? (activeTxs.reduce((s, t) => s + (t.amount || 0), 0))).toLocaleString()}
              </Text>
              <View style={styles.bentoBadgeBottomRow}>
                <View style={[styles.estBadge, { backgroundColor: colors.surfaceContainerHighest }]}>
                  <Text style={[styles.estBadgeText, { color: colors.secondaryDark }]}>
                    ACTUAL
                  </Text>
                </View>
              </View>
            </View>

            {/* Units Vended */}
            <View style={[styles.bentoColCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
              <Text style={[styles.bentoLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                Units Vended
              </Text>
              <Text style={[styles.bentoValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                {consumption?.totalUnitsKwh !== null && consumption?.totalUnitsKwh !== undefined
                  ? `${consumption.totalUnitsKwh} kWh`
                  : activeTxs.some((t) => t.units)
                  ? `${activeTxs.reduce((s, t) => s + (t.units || 0), 0)} kWh`
                  : 'Awaiting data'}
              </Text>
              <View style={styles.bentoBadgeBottomRow}>
                <View style={[styles.estBadge, { backgroundColor: colors.surfaceContainerHighest }]}>
                  <Text style={[styles.estBadgeText, { color: getUnitBadge(consumption?.unitSource).color }]}>
                    {getUnitBadge(consumption?.unitSource).text}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Cadence Analysis Wide Card */}
          <View style={[styles.bentoHeroCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <Text style={[styles.bentoLabel, { color: colors.textSecondary }]}>
              Purchase Cadence & Interval
            </Text>
            <Text style={[styles.bentoCadenceValue, { color: colors.primary }]}>
              {derivedCadence.medianInterval !== null
                ? `Recharging every ~${derivedCadence.medianInterval} days across ${derivedCadence.totalPurchases} recorded purchases`
                : derivedCadence.totalPurchases === 0
                ? 'No purchases recorded yet for this meter'
                : 'Need 2+ purchases to calculate interval cadence'}
            </Text>
          </View>
        </View>

        {/* Purchase Frequency Line Graph */}
        <PurchaseFrequencyLineChart
          transactions={activeTxs}
          period={chartPeriod}
          onPeriodChange={setChartPeriod}
          purchasing={purchasing}
          spending={spending}
          cadenceOverride={derivedCadence.medianInterval !== null ? `~${derivedCadence.medianInterval} days` : null}
          colors={colors}
          isDark={isDark}
        />

        {/* Period Comparison Header & Row */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, Typography.headlineMd, { color: colors.primary }]}>
            Period Comparison
          </Text>
        </View>

        <View style={styles.comparisonRow}>
          <View style={[styles.comparisonCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={[styles.compIcon, { backgroundColor: spending?.direction === 'INCREASING' ? colors.errorBg : colors.surfaceContainerHigh }]}>
              <MaterialIcons
                name={spending?.direction === 'INCREASING' ? 'trending-up' : spending?.direction === 'DECREASING' ? 'trending-down' : 'trending-flat'}
                size={22}
                color={spending?.direction === 'INCREASING' ? colors.error : colors.secondaryDark}
              />
            </View>
            <Text style={[styles.compLabel, Typography.metricUnit, { color: colors.textSecondary }]}>Spending Shift</Text>
            <Text style={[styles.compValue, Typography.headlineMd, { color: spending?.direction === 'INCREASING' ? colors.error : colors.primary }]} numberOfLines={1}>
              {spending?.hasPreviousBaseline
                ? `${spending?.percentageChange > 0 ? '+' : ''}${spending?.percentageChange}%`
                : 'No prior baseline'}
            </Text>
          </View>

          <View style={[styles.comparisonCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={[styles.compIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
              <MaterialCommunityIcons name="lightning-bolt" size={22} color={colors.secondaryDark} />
            </View>
            <Text style={[styles.compLabel, Typography.metricUnit, { color: colors.textSecondary }]}>Data Evidence</Text>
            <Text style={[styles.compValue, Typography.headlineMd, { color: colors.primary }]} numberOfLines={1}>
              {dataQuality?.sampleSize || 0} purchases
            </Text>
          </View>
        </View>

        {/* Explainable Rule-Based Insight Banner */}
        <View style={[styles.insightCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <View style={[styles.insightIconWrapper, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
            <MaterialIcons name="lightbulb" size={22} color={colors.secondaryDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.insightTitle, Typography.headlineMd, { color: colors.primary }]}>
              Consumption Insight
            </Text>
            <Text style={[styles.insightBody, Typography.bodyMd, { color: colors.textSecondary }]}>
              {consumptionAnalytics?.explainableInsight || 'Building consumption history from verified transactions.'}
            </Text>
          </View>
        </View>

        {/* Appliance Decomposition Breakdown (Estimates from Profile) */}
        {applianceEstimates.length > 0 && (
          <View style={[styles.applianceCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={styles.applianceHeader}>
              <View style={{ flex: 1, marginRight: Spacing.sm }}>
                <Text style={[styles.applianceTitle, Typography.headlineMd, { color: colors.primary }]}>
                  Appliance Profile Contribution
                </Text>
                <Text style={[styles.applianceSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Estimated based on your self-reported profile
                </Text>
              </View>
              <View style={[styles.estBadge, { backgroundColor: colors.surfaceContainerHighest }]}>
                <Text style={[styles.estBadgeText, { color: colors.textSecondary }]}>ESTIMATED</Text>
              </View>
            </View>

            <View style={styles.applianceList}>
              {applianceEstimates.slice(0, 5).map((app) => (
                <View key={app.applianceId} style={styles.applianceRow}>
                  <View style={{ flex: 1, marginRight: Spacing.sm }}>
                    <Text style={[styles.appName, Typography.metricUnit, { color: colors.primary }]} numberOfLines={1}>
                      {app.name} ({app.quantity}x • {app.estimatedWattage}W)
                    </Text>
                    <Text style={[styles.appDetails, { color: colors.textSecondary }]}>
                      ~{app.dailyUsageHours}h/day • {app.estimatedDailyKwh} kWh/day
                    </Text>
                  </View>
                  <View style={styles.appPctBadge}>
                    <Text style={[styles.appPctText, Typography.labelCaps, { color: colors.secondaryDark }]}>
                      {app.relativeContributionPct}%
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={[styles.applianceCaveat, { color: colors.outline }]}>
              * Note: Breakdown is calculated from self-reported wattage and hours. Actual appliance sub-metering requires IoT telemetry.
            </Text>
          </View>
        )}

        {/* AI Energy Assistant (Interactive Grounded Conversational Interface) */}
        <View
          style={[
            styles.aiCard,
            {
              backgroundColor: colors.cardBg,
              borderColor: colors.cardBorder,
              borderWidth: 1,
            },
          ]}
        >
          <View style={[styles.aiCardDecor, { backgroundColor: colors.secondary }]} />
          <View style={styles.aiCardContent}>
            <View style={styles.aiHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <MaterialIcons name="auto-awesome" size={20} color={colors.secondaryDark} />
                <Text style={[styles.aiTitle, Typography.headlineMd, { color: colors.primary }]}>
                  AI Energy Assistant
                </Text>
              </View>
              {aiMessages.length > 0 && (
                <TouchableOpacity onPress={clearAiChat} style={[styles.clearChatBtn, { backgroundColor: colors.surfaceContainerHighest }]}>
                  <Text style={[styles.clearChatText, Typography.labelCaps, { color: colors.textSecondary }]}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.aiSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
              Grounded explanations for your electricity spending, consumption patterns, and cadence.
            </Text>

            {/* Suggested Question Pills (Dynamically Available) */}
            <View style={styles.suggestedContainer}>
              <Text style={[styles.suggestedHeader, Typography.labelCaps, { color: colors.textSecondary }]}>
                Suggested Questions
              </Text>
              <View style={styles.questionList}>
                {suggestedQuestions.map((q) => (
                  <TouchableOpacity
                    key={q.id}
                    disabled={!q.isAvailableForData || isAiLoading}
                    style={[
                      styles.questionBtn,
                      {
                        backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainerLow,
                        borderColor: colors.outlineVariant,
                        opacity: q.isAvailableForData ? 1 : 0.5,
                      },
                    ]}
                    onPress={() => handleSendQuestion(q.question)}
                  >
                    <View style={{ flex: 1, marginRight: Spacing.sm }}>
                      <Text style={[styles.questionText, Typography.metricUnit, { color: colors.primary }]}>
                        {q.question}
                      </Text>
                      {!q.isAvailableForData && q.unavailabilityReason && (
                        <Text style={[styles.unavailReasonText, { color: colors.outline }]}>
                          ({q.unavailabilityReason})
                        </Text>
                      )}
                    </View>
                    <MaterialIcons
                      name="arrow-forward"
                      size={16}
                      color={q.isAvailableForData ? colors.secondaryDark : colors.outline}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Conversation Messages Thread */}
            {aiMessages.length > 0 && (
              <View style={styles.conversationThread}>
                {aiMessages.map((msg) => (
                  <View
                    key={msg.id}
                    style={[
                      styles.messageBubble,
                      msg.role === 'user'
                        ? [styles.userBubble, { backgroundColor: colors.primary }]
                        : [styles.assistantBubble, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }],
                    ]}
                  >
                    {msg.role === 'assistant' && (
                      <View style={styles.assistantHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <MaterialIcons name="bolt" size={14} color={colors.secondaryDark} />
                          <Text style={[styles.assistantBadgeText, Typography.labelCaps, { color: colors.secondaryDark }]}>
                            Energy Assistant • {msg.confidence || 'GROUNDED'}
                          </Text>
                        </View>
                        {msg.structuredResponse?.dataQualityGrade && (
                          <Text style={[styles.dataQualityBadge, Typography.labelCaps, { color: colors.textSecondary }]}>
                            Quality: {msg.structuredResponse.dataQualityGrade}
                          </Text>
                        )}
                      </View>
                    )}

                    <Text
                      style={[
                        styles.messageText,
                        Typography.bodyMd,
                        { color: msg.role === 'user' ? '#ffffff' : colors.primary },
                      ]}
                    >
                      {msg.content}
                    </Text>

                    {/* Structured Evidence (Expandable) */}
                    {msg.evidence && msg.evidence.length > 0 && (
                      <View style={styles.evidenceBlock}>
                        <TouchableOpacity
                          style={styles.evidenceToggle}
                          onPress={() =>
                            setExpandedEvidenceId(expandedEvidenceId === msg.id ? null : msg.id)
                          }
                        >
                          <MaterialIcons
                            name={expandedEvidenceId === msg.id ? 'expand-less' : 'expand-more'}
                            size={16}
                            color={colors.secondaryDark}
                          />
                          <Text style={[styles.evidenceToggleText, Typography.labelCaps, { color: colors.secondaryDark }]}>
                            Why this insight? ({msg.evidence.length} evidence points)
                          </Text>
                        </TouchableOpacity>

                        {expandedEvidenceId === msg.id && (
                          <View style={[styles.evidenceList, { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : colors.surface }]}>
                            {msg.evidence.map((ev, i) => (
                              <View key={i} style={styles.evidenceItemRow}>
                                <Text style={{ color: colors.secondaryDark, fontSize: 12 }}>•</Text>
                                <Text style={[styles.evidenceItemText, Typography.bodyMd, { color: colors.textSecondary }]}>
                                  {ev}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}

                    {/* Actionable Recommendations */}
                    {msg.recommendations && msg.recommendations.length > 0 && (
                      <View style={styles.recommendationBlock}>
                        <Text style={[styles.recTitle, Typography.labelCaps, { color: colors.primary }]}>
                          Optimization Tips:
                        </Text>
                        {msg.recommendations.map((rec, i) => (
                          <View key={i} style={styles.recItemRow}>
                            <MaterialIcons name="check-circle-outline" size={14} color={colors.secondaryDark} />
                            <Text style={[styles.recText, Typography.bodyMd, { color: colors.primary }]}>{rec}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Limitations & Caveats */}
                    {msg.limitations && msg.limitations.length > 0 && (
                      <Text style={[styles.limitationsText, { color: colors.outline }]}>
                        * {msg.limitations[0]}
                      </Text>
                    )}

                    {/* Feedback Rating (Thumbs up / down) */}
                    {msg.role === 'assistant' && (
                      <View style={styles.feedbackRow}>
                        <Text style={[styles.feedbackLabel, Typography.labelCaps, { color: colors.outline }]}>
                          Was this helpful?
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.feedbackBtn,
                            msg.isHelpful === true && { backgroundColor: colors.successBg },
                          ]}
                          onPress={() => recordAiFeedback(msg.id, true)}
                        >
                          <MaterialIcons
                            name="thumb-up"
                            size={14}
                            color={msg.isHelpful === true ? colors.secondaryDark : colors.outline}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.feedbackBtn,
                            msg.isHelpful === false && { backgroundColor: colors.errorBg },
                          ]}
                          onPress={() => recordAiFeedback(msg.id, false, 'User marked not helpful')}
                        >
                          <MaterialIcons
                            name="thumb-down"
                            size={14}
                            color={msg.isHelpful === false ? colors.error : colors.outline}
                          />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* AI Loading State Indicator */}
            {isAiLoading && (
              <View style={[styles.loadingBubble, { backgroundColor: colors.surfaceContainerHigh }]}>
                <ActivityIndicator size="small" color={colors.secondaryDark} />
                <Text style={[styles.loadingText, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Analyzing your energy data & calculating cadence...
                </Text>
              </View>
            )}

            {/* Custom Question Input Row */}
            <View style={[styles.customInputRow, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }]}>
              <TextInput
                style={[styles.customInput, Typography.bodyMd, { color: colors.primary }]}
                placeholder="Ask about your electricity spending or usage..."
                placeholderTextColor={colors.outline}
                value={customQuestion}
                onChangeText={setCustomQuestion}
                onSubmitEditing={() => handleSendQuestion(customQuestion)}
                editable={!isAiLoading}
              />
              <TouchableOpacity
                disabled={!customQuestion.trim() || isAiLoading}
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: customQuestion.trim() ? colors.secondaryDark : colors.outlineVariant,
                  },
                ]}
                onPress={() => handleSendQuestion(customQuestion)}
              >
                <MaterialIcons
                  name="send"
                  size={16}
                  color={customQuestion.trim() ? '#000000' : colors.outline}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.containerMargin,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  pageSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  notifButton: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Spacing.containerMargin,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginBottom: Spacing.md,
  },
  lineageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 10,
  },
  lineageText: {
    fontSize: 10,
    fontWeight: '700',
    flex: 1,
  },
  logReadingBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logReadingBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
  readingModalCard: {
    marginHorizontal: Spacing.containerMargin,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    gap: 6,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  readingModalTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  readingModalBody: {
    fontSize: 12,
    lineHeight: 16,
  },
  modalInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 4,
  },
  modalInput: {
    flex: 1,
    borderRadius: Rounded.default,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Rounded.default,
  },
  modalSubmitText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalStatusText: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  bentoContainer: {
    paddingHorizontal: Spacing.containerMargin,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  bentoHeroCard: {
    width: '100%',
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  bentoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    gap: 6,
  },
  bentoVelocityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Rounded.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  bentoVelocityText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  bentoLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    flex: 1,
  },
  bentoBigValue: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  bentoRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  bentoColCard: {
    flex: 1,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
  },
  bentoColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 4,
  },
  bentoValue: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  bentoBadgeBottomRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bentoCadenceValue: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  estBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chartCard: {
    marginHorizontal: Spacing.containerMargin,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  chartSubtitle: {
    marginTop: 2,
    fontSize: 11,
  },
  periodFilter: {
    flexDirection: 'row',
    borderRadius: Rounded.full,
    padding: 2,
  },
  periodBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Rounded.full,
  },
  periodBtnActive: {},
  periodBtnText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  chartMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Rounded.default,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginVertical: Spacing.sm,
  },
  chartMetricItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  chartMetricLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  chartMetricValue: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  chartMetricDivider: {
    width: 1,
    height: 18,
  },
  activePointPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Rounded.full,
    marginBottom: 4,
  },
  activePointPillLabel: {
    fontSize: 11,
  },
  activePointPillValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  svgContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  xAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 4,
  },
  xAxisLabelBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  xAxisLabelText: {
    fontSize: 10,
    fontWeight: '600',
  },
  sectionHeader: {
    paddingHorizontal: Spacing.containerMargin,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  comparisonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.containerMargin,
    marginBottom: Spacing.lg,
  },
  comparisonCard: {
    flex: 1,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  compIcon: {
    width: 38,
    height: 38,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  compLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  compValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  insightCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginHorizontal: Spacing.containerMargin,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    alignItems: 'flex-start',
  },
  insightIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: Rounded.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  insightTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  insightBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  applianceCard: {
    marginHorizontal: Spacing.containerMargin,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  applianceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  applianceTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  applianceSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  applianceList: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  applianceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  appName: {
    fontSize: 13,
    fontWeight: '600',
  },
  appDetails: {
    fontSize: 11,
    marginTop: 1,
  },
  appPctBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Rounded.sm,
    backgroundColor: 'rgba(172, 248, 71, 0.12)',
  },
  appPctText: {
    fontSize: 12,
    fontWeight: '700',
  },
  applianceCaveat: {
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
  },
  aiCard: {
    marginHorizontal: Spacing.containerMargin,
    borderRadius: Rounded.lg,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  aiCardDecor: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 150,
    height: 150,
    borderRadius: Rounded.full,
    opacity: 0.12,
  },
  aiCardContent: {
    padding: Spacing.md,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 4,
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  clearChatBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Rounded.sm,
  },
  clearChatText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  aiSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: Spacing.md,
  },
  suggestedContainer: {
    marginTop: 2,
  },
  suggestedHeader: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  questionList: {
    gap: Spacing.xs,
  },
  questionBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Rounded.default,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  questionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  unavailReasonText: {
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 2,
  },
  conversationThread: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  messageBubble: {
    borderRadius: 14,
    padding: Spacing.md,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    borderBottomRightRadius: 2,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    width: '100%',
    borderWidth: 1,
    borderBottomLeftRadius: 2,
  },
  assistantHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  assistantBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dataQualityBadge: {
    fontSize: 10,
    fontWeight: '600',
  },
  messageText: {
    fontSize: 13,
    lineHeight: 19,
  },
  evidenceBlock: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  evidenceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  evidenceToggleText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  evidenceList: {
    borderRadius: Rounded.sm,
    padding: Spacing.sm,
    marginTop: 4,
    gap: 4,
  },
  evidenceItemRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 2,
  },
  evidenceItemText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  recommendationBlock: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  recTitle: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  recItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  recText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  limitationsText: {
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  feedbackLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  feedbackBtn: {
    padding: 6,
    borderRadius: Rounded.sm,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.md,
    borderRadius: 14,
    padding: Spacing.md,
  },
  loadingText: {
    fontSize: 12,
    flex: 1,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Rounded.full,
    borderWidth: 1,
    paddingLeft: Spacing.md,
    paddingRight: 4,
    paddingVertical: 4,
    marginTop: Spacing.md,
  },
  customInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
