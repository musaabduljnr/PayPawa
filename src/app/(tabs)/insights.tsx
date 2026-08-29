import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AI_RESPONSES: Record<string, string> = {
  "Why did my electricity finish faster?":
    "Over the last 3 days your average daily usage jumped to 11.2 kWh — compared to your usual 8.5 kWh. Heavy appliances like air conditioning, electric irons, or water heaters could be the main culprits. Try reducing peak-hour usage to stretch your balance further.",
  "When will I need another token?":
    "Based on your current pace of 11.2 kWh/day, you have approximately 3-4 days left on your current balance. I'd recommend purchasing another token soon to avoid any interruptions.",
  "How can I reduce my spending?":
    "Great question! Here are 3 quick wins:\n1. Unplug standby devices — they account for up to 10% of usage.\n2. Switch to LED bulbs if you haven't already.\n3. Use heavy appliances during off-peak hours (late night / early morning).",
};

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
  colors,
  isDark,
}: {
  transactions: Transaction[];
  period: 'W' | 'M' | 'Y';
  onPeriodChange: (p: 'W' | 'M' | 'Y') => void;
  colors: any;
  isDark: boolean;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const purchases = transactions.filter((t) => t.type === 'purchase');
  const now = new Date();

  // Aggregate frequency and spend based on selected timeframe
  let dataPoints: ChartDataPoint[] = [];
  let avgIntervalText = 'Every ~4.5 days';

  if (period === 'W') {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const fullDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const counts = Array(7).fill(0);
    const amounts = Array(7).fill(0);

    const currentDayIdx = (now.getDay() + 6) % 7;
    purchases.forEach((tx) => {
      counts[currentDayIdx] = (counts[currentDayIdx] || 0) + 1;
      amounts[currentDayIdx] = (amounts[currentDayIdx] || 0) + Math.abs(tx.amount);
    });

    const hasData = counts.some((c) => c > 0);
    const fallbackFreq = [1, 0, 2, 0, 1, 0, 1];
    const fallbackAmounts = [5000, 0, 10000, 0, 5000, 0, 5000];

    dataPoints = days.map((label, i) => ({
      label,
      fullLabel: fullDays[i],
      frequency: hasData ? counts[i] : fallbackFreq[i],
      amount: hasData ? amounts[i] : fallbackAmounts[i],
    }));
    avgIntervalText = 'Every ~2.3 days';
  } else if (period === 'M') {
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
    const shortLabels = ['W1', 'W2', 'W3', 'W4', 'W5'];
    const counts = [1, 2, 1, 3, 1];
    const amounts = [5000, 10000, 5000, 15000, 5000];

    if (purchases.length > 0) {
      const activeSpend = purchases.reduce((s, t) => s + Math.abs(t.amount), 0);
      amounts[3] = activeSpend;
      counts[3] = purchases.length;
    }

    dataPoints = shortLabels.map((label, i) => ({
      label,
      fullLabel: weeks[i],
      frequency: counts[i],
      amount: amounts[i],
    }));
    avgIntervalText = 'Every ~5.1 days';
  } else {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fullMonths = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const counts = [3, 2, 4, 3, 5, 4, 3, 4, 2, 3, 4, 3];
    const amounts = [15000, 10000, 20000, 15000, 25000, 20000, 15000, 20000, 10000, 15000, 20000, 15000];

    const currentMonthIdx = now.getMonth();
    if (purchases.length > 0) {
      const activeSpend = purchases.reduce((s, t) => s + Math.abs(t.amount), 0);
      amounts[currentMonthIdx] = activeSpend;
      counts[currentMonthIdx] = purchases.length;
    }

    dataPoints = months.map((label, i) => ({
      label,
      fullLabel: fullMonths[i],
      frequency: counts[i],
      amount: amounts[i],
    }));
    avgIntervalText = 'Every ~6.8 days';
  }

  const totalPeriodSpend = dataPoints.reduce((s, p) => s + p.amount, 0);
  const totalPeriodPurchases = dataPoints.reduce((s, p) => s + p.frequency, 0);

  // SVG Dimension Math
  const chartWidth = SCREEN_WIDTH - Spacing.containerMargin * 2 - Spacing.md * 2;
  const chartHeight = 150;
  const padLeft = 16;
  const padRight = 16;
  const padTop = 22;
  const padBottom = 26;
  const usableWidth = chartWidth - padLeft - padRight;
  const usableHeight = chartHeight - padTop - padBottom;

  const maxVal = Math.max(...dataPoints.map((d) => d.frequency), 1);

  const points = dataPoints.map((d, i) => {
    const x = padLeft + (i / (dataPoints.length - 1)) * usableWidth;
    const y = padTop + usableHeight - (d.frequency / maxVal) * usableHeight;
    return { x, y, data: d };
  });

  const linePath = generateSmoothPath(points);
  const areaPath = generateAreaPath(points, padTop + usableHeight);

  const activePoint = selectedIdx !== null && points[selectedIdx] ? points[selectedIdx] : points[points.length - 1];

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      {/* Header with Title and Timeframe Filter */}
      <View style={styles.chartHeader}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialIcons name="show-chart" size={20} color={colors.secondaryDark} />
            <Text style={[styles.chartTitle, Typography.headlineMd, { color: colors.primary }]}>
              Purchase Frequency
            </Text>
          </View>
          <Text style={[styles.chartSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
            Electricity recharges in {period === 'W' ? 'this week' : period === 'M' ? 'this month' : 'this year'}
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
                  Typography.labelCaps,
                  { color: period === p ? colors.primary : colors.textSecondary },
                ]}
              >
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Metric Highlights Banner */}
      <View style={[styles.chartMetricRow, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
        <View style={styles.chartMetricItem}>
          <Text style={[styles.chartMetricLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
            Recharges
          </Text>
          <Text style={[styles.chartMetricValue, Typography.metricUnit, { color: colors.primary }]}>
            {totalPeriodPurchases} {totalPeriodPurchases === 1 ? 'time' : 'times'}
          </Text>
        </View>

        <View style={[styles.chartMetricDivider, { backgroundColor: colors.outlineVariant }]} />

        <View style={styles.chartMetricItem}>
          <Text style={[styles.chartMetricLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
            Cadence
          </Text>
          <Text style={[styles.chartMetricValue, Typography.metricUnit, { color: colors.secondaryDark }]}>
            {avgIntervalText}
          </Text>
        </View>

        <View style={[styles.chartMetricDivider, { backgroundColor: colors.outlineVariant }]} />

        <View style={styles.chartMetricItem}>
          <Text style={[styles.chartMetricLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
            Total Spend
          </Text>
          <Text style={[styles.chartMetricValue, Typography.metricUnit, { color: colors.primary }]}>
            ₦{totalPeriodSpend.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Active Selected Point Info Pill */}
      {activePoint && (
        <View style={[styles.activePointPill, { backgroundColor: colors.surfaceContainerHighest }]}>
          <Text style={[styles.activePointPillLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
            {activePoint.data.fullLabel}:
          </Text>
          <Text style={[styles.activePointPillValue, Typography.metricUnit, { color: colors.primary }]}>
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
                opacity={0.6}
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
        <View style={[styles.xAxisLabels, { paddingLeft: padLeft - 6, paddingRight: padRight - 6 }]}>
          {dataPoints.map((pt, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => setSelectedIdx(idx)}
              style={styles.xAxisLabelBtn}
            >
              <Text
                style={[
                  styles.xAxisLabelText,
                  Typography.labelCaps,
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
  const { transactions, refreshTransactions, refreshWallet, appliances, energyProfile, activeMeter } = useApp();
  const { colors, isDark } = useTheme();
  const [chartPeriod, setChartPeriod] = useState<'W' | 'M' | 'Y'>('W');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [selectedQ, setSelectedQ] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refreshTransactions?.();
      refreshWallet?.();
    }, [refreshTransactions, refreshWallet])
  );

  const totalSpend = transactions
    .filter((t) => t.type === 'purchase')
    .reduce((acc, t) => acc + Math.abs(t.amount), 0);

  const totalUnits = transactions
    .filter((t) => t.type === 'purchase')
    .reduce((acc, t) => acc + (t.units || Math.round((Math.abs(t.amount) / 206.8) * 10) / 10), 0);

  // Dynamic appliance baseline calculation
  const applianceDailyKwh = appliances.reduce(
    (sum, a) => sum + (Number(a.estimated_daily_kwh) || 0),
    0
  );
  const defaultDailyKwh = energyProfile?.account_type === 'business' ? 24.0 : 8.5;
  const dailyBaselineKwh = applianceDailyKwh > 0 ? applianceDailyKwh : defaultDailyKwh;

  const avgDaily = totalUnits > 0 ? (totalUnits / 30).toFixed(1) : dailyBaselineKwh.toFixed(1);

  // Remaining days calculation
  const purchaseTxs = transactions.filter((t) => t.type === 'purchase');
  const latestPurchase =
    purchaseTxs.find(
      (t) =>
        !t.meterNumber ||
        (activeMeter &&
          t.meterNumber.replace(/\s/g, '').includes(activeMeter.number.replace(/\s/g, '').slice(-4)))
    ) || purchaseTxs[0];

  const totalPurchasedUnits =
    latestPurchase?.units ||
    (latestPurchase?.amount ? Math.round((Math.abs(latestPurchase.amount) / 206.8) * 10) / 10 : 0);
  const remainingKwh = totalPurchasedUnits > 0 ? Math.max(0, Math.round(totalPurchasedUnits)) : 0;
  const daysRemaining =
    remainingKwh > 0 && dailyBaselineKwh > 0 ? Math.max(1, Math.round(remainingKwh / dailyBaselineKwh)) : 0;

  const handleQuestion = (q: string) => {
    setSelectedQ(q);
    setTimeout(() => setAiResponse(AI_RESPONSES[q] || "I'm still learning! Check back soon."), 800);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.pageTitle, Typography.headlineLgMobile, { color: colors.primary }]}>Your Energy</Text>
            <Text style={[styles.pageSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>Monthly insights</Text>
          </View>
          <TouchableOpacity style={[styles.notifButton, { backgroundColor: colors.surfaceContainerHighest }]}>
            <MaterialIcons name="insights" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Summary Bento Grid */}
        <View style={styles.bentoGrid}>
          {/* Days Left - Wide Card */}
          <View style={[styles.bentoCard, styles.bentoWide, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bentoLabel, Typography.metricUnit, { color: colors.textSecondary }]}>Estimated Days Left</Text>
              <View style={styles.bentoValueRow}>
                <Text style={[styles.bentoBigValue, Typography.displayMetrics, { color: colors.primary }]}>{daysRemaining}</Text>
                <Text style={[styles.bentoBigUnit, Typography.bodyMd, { color: colors.textSecondary }]}>days</Text>
              </View>
            </View>
            <View style={styles.bentoTrend}>
              <MaterialIcons name="trending-up" size={14} color={colors.secondaryDark} />
              <Text style={[styles.bentoTrendText, Typography.labelCaps, { color: colors.secondaryDark }]} numberOfLines={2}>
                Based on{`\n`}appliance profile
              </Text>
            </View>
          </View>

          {/* Monthly Spend */}
          <View style={[styles.bentoCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <Text style={[styles.bentoLabel, Typography.metricUnit, { color: colors.textSecondary }]}>Monthly Spend</Text>
            <Text style={[styles.bentoValue, Typography.headlineMd, { color: colors.primary }]}>
              ₦{totalSpend.toLocaleString()}
            </Text>
          </View>

          {/* Units Used */}
          <View style={[styles.bentoCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <Text style={[styles.bentoLabel, Typography.metricUnit, { color: colors.textSecondary }]}>Units Used</Text>
            <Text style={[styles.bentoValue, Typography.headlineMd, { color: colors.primary }]}>{totalUnits.toFixed(0)} kWh</Text>
          </View>

          {/* Daily Avg */}
          <View style={[styles.bentoCard, styles.bentoWide, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <Text style={[styles.bentoLabel, Typography.metricUnit, { color: colors.textSecondary }]}>Daily Average</Text>
            <Text style={[styles.bentoValue, Typography.headlineMd, { color: colors.primary }]}>{avgDaily} kWh</Text>
          </View>
        </View>

        {/* Recalibrated Purchase Frequency Line Graph */}
        <PurchaseFrequencyLineChart
          transactions={transactions}
          period={chartPeriod}
          onPeriodChange={setChartPeriod}
          colors={colors}
          isDark={isDark}
        />

        {/* Comparison Cards */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, Typography.headlineMd, { color: colors.primary }]}>vs Last Month</Text>
        </View>
        <View style={styles.comparisonRow}>
          <View style={[styles.comparisonCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={[styles.compIcon, { backgroundColor: colors.errorBg }]}>
              <MaterialIcons name="trending-up" size={22} color={colors.error} />
            </View>
            <Text style={[styles.compLabel, Typography.metricUnit, { color: colors.textSecondary }]}>Spending</Text>
            <Text style={[styles.compValue, Typography.headlineMd, { color: colors.error }]}>+12%</Text>
          </View>
          <View style={[styles.comparisonCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={[styles.compIcon, { backgroundColor: colors.errorBg }]}>
              <MaterialCommunityIcons name="lightning-bolt" size={22} color={colors.error} />
            </View>
            <Text style={[styles.compLabel, Typography.metricUnit, { color: colors.textSecondary }]}>Units</Text>
            <Text style={[styles.compValue, Typography.headlineMd, { color: colors.error }]}>+8%</Text>
          </View>
        </View>

        {/* Insight Panel */}
        <View style={[styles.insightCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <View style={[styles.insightIconWrapper, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
            <MaterialIcons name="lightbulb" size={22} color={colors.secondaryDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.insightTitle, Typography.headlineMd, { color: colors.primary }]}>
              Your electricity is being consumed faster
            </Text>
            <Text style={[styles.insightBody, Typography.bodyMd, { color: colors.textSecondary }]}>
              Over the last 3 days, your average usage jumped to 11.2 kWh/day compared to your normal{' '}
              {avgDaily} kWh/day. This will reduce your estimated days remaining.
            </Text>
          </View>
        </View>

        {/* AI Assistant */}
        <View
          style={[
            styles.aiCard,
            {
              backgroundColor: isDark ? colors.cardBg : colors.primary,
              borderColor: isDark ? colors.outlineVariant : 'transparent',
              borderWidth: isDark ? 1 : 0,
            },
          ]}
        >
          <View style={[styles.aiCardDecor, { backgroundColor: colors.secondary }]} />
          <View style={styles.aiCardContent}>
            <View style={styles.aiHeader}>
              <MaterialIcons name="auto-awesome" size={22} color={colors.secondary} />
              <Text style={[styles.aiTitle, Typography.headlineMd, { color: isDark ? colors.primary : '#ffffff' }]}>
                Energy Assistant
              </Text>
            </View>
            <Text
              style={[
                styles.aiSubtitle,
                Typography.bodyMd,
                { color: isDark ? colors.textSecondary : 'rgba(255,255,255,0.7)' },
              ]}
            >
              Ask me anything about your current usage or future estimations.
            </Text>

            {/* Preset Questions */}
            <View style={styles.questionList}>
              {Object.keys(AI_RESPONSES).map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[
                    styles.questionBtn,
                    {
                      backgroundColor: isDark
                        ? colors.surfaceContainerHigh
                        : 'rgba(255,255,255,0.08)',
                      borderColor: isDark
                        ? colors.outlineVariant
                        : 'rgba(255,255,255,0.12)',
                    },
                    selectedQ === q
                      ? [
                          styles.questionBtnActive,
                          {
                            backgroundColor: isDark
                              ? colors.surfaceContainerHighest
                              : 'rgba(255,255,255,0.15)',
                            borderColor: colors.secondary,
                          },
                        ]
                      : null,
                  ]}
                  onPress={() => handleQuestion(q)}
                >
                  <Text
                    style={[
                      styles.questionText,
                      Typography.metricUnit,
                      { color: isDark ? colors.text : '#ffffff' },
                    ]}
                  >
                    {q}
                  </Text>
                  <MaterialIcons name="arrow-forward" size={16} color={colors.secondary} />
                </TouchableOpacity>
              ))}
            </View>

            {/* AI Response */}
            {aiResponse && (
              <View
                style={[
                  styles.aiResponse,
                  {
                    backgroundColor: isDark
                      ? colors.surfaceContainerHigh
                      : 'rgba(255,255,255,0.08)',
                    borderColor: isDark ? colors.outlineVariant : 'transparent',
                    borderWidth: isDark ? 1 : 0,
                  },
                ]}
              >
                <View style={[styles.aiResponseIcon, { backgroundColor: colors.secondary }]}>
                  <MaterialIcons name="auto-awesome" size={16} color={colors.primary} />
                </View>
                <Text
                  style={[
                    styles.aiResponseText,
                    Typography.bodyMd,
                    { color: isDark ? colors.text : '#ffffff' },
                  ]}
                >
                  {aiResponse}
                </Text>
              </View>
            )}
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
    paddingBottom: Spacing.md,
  },
  pageTitle: {},
  pageSubtitle: { marginTop: 2 },
  notifButton: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.containerMargin,
    gap: Spacing.cardGap,
    marginBottom: Spacing.lg,
  },
  bentoCard: {
    width: '47%',
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
  },
  bentoWide: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md },
  bentoTrend: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    maxWidth: 80,
  },
  bentoTrendText: { textTransform: 'uppercase', textAlign: 'center', flexWrap: 'wrap' },
  bentoLabel: { marginBottom: Spacing.xs },
  bentoValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.xs },
  bentoBigValue: { fontSize: 36 },
  bentoBigUnit: {},
  bentoValue: { marginTop: Spacing.sm },
  chartCard: {
    marginHorizontal: Spacing.containerMargin,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  chartTitle: {},
  chartSubtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  periodFilter: {
    flexDirection: 'row',
    borderRadius: Rounded.full,
    padding: 2,
  },
  periodBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Rounded.full,
  },
  periodBtnActive: {},
  periodBtnText: { textTransform: 'uppercase' },
  chartMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Rounded.default,
    borderWidth: 1,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    marginVertical: Spacing.sm,
  },
  chartMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  chartMetricLabel: {
    fontSize: 10,
    marginBottom: 2,
  },
  chartMetricValue: {
    fontSize: 13,
  },
  chartMetricDivider: {
    width: 1,
    height: 24,
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
    fontSize: 12,
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
    fontSize: 11,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.containerMargin,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {},
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
    width: 44,
    height: 44,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compLabel: {},
  compValue: {},
  insightCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginHorizontal: Spacing.containerMargin,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  insightIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  insightTitle: { marginBottom: Spacing.xs, fontSize: 16 },
  insightBody: { fontSize: 14 },
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
    opacity: 0.15,
  },
  aiCardContent: { padding: Spacing.md },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  aiTitle: {},
  aiSubtitle: { marginBottom: Spacing.md, fontSize: 14 },
  questionList: { gap: Spacing.sm },
  questionBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Rounded.default,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  questionBtnActive: {},
  questionText: { flex: 1, marginRight: Spacing.sm },
  aiResponse: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    borderRadius: Rounded.default,
    padding: Spacing.md,
  },
  aiResponseIcon: {
    width: 28,
    height: 28,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  aiResponseText: { flex: 1, fontSize: 14, lineHeight: 22, opacity: 0.9 },
});
