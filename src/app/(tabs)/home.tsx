import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
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
import { useTheme } from '@/context/ThemeContext';
import { useApp, Transaction } from '@/context/AppContext';
import { EnergyStatusService } from '@/services';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SpendingDataPoint {
  label: string;
  fullLabel: string;
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

function ElectricitySpendingLineChart({
  transactions,
  period,
  onPeriodChange,
  colors,
}: {
  transactions: Transaction[];
  period: '7d' | '30d' | '90d';
  onPeriodChange: (p: '7d' | '30d' | '90d') => void;
  colors: any;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const purchases = transactions.filter((t) => t.type === 'purchase' && t.status === 'Completed');
  const now = new Date();

  const parseTxDate = (tx: Transaction): Date => {
    if (tx.createdAt) {
      const d = new Date(tx.createdAt);
      if (!isNaN(d.getTime())) return d;
    }
    if (tx.date) {
      const d = new Date(tx.date);
      if (!isNaN(d.getTime())) return d;
      if (tx.date.toLowerCase().includes('yesterday')) {
        return new Date(Date.now() - 86400000);
      }
    }
    return now;
  };

  let dataPoints: SpendingDataPoint[] = [];

  if (period === '7d') {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const fullDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const amounts = Array(7).fill(0);

    purchases.forEach((tx) => {
      const txDate = parseTxDate(tx);
      const diffDays = Math.floor((now.getTime() - txDate.getTime()) / (86400 * 1000));
      if (diffDays >= 0 && diffDays < 7) {
        const dayIdx = (txDate.getDay() + 6) % 7;
        amounts[dayIdx] = (amounts[dayIdx] || 0) + Math.abs(Number(tx.amount) || 0);
      }
    });

    dataPoints = days.map((label, i) => ({
      label,
      fullLabel: fullDays[i],
      amount: amounts[i],
    }));
  } else if (period === '30d') {
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
    const shortLabels = ['W1', 'W2', 'W3', 'W4', 'W5'];
    const amounts = Array(5).fill(0);

    purchases.forEach((tx) => {
      const txDate = parseTxDate(tx);
      const diffDays = Math.floor((now.getTime() - txDate.getTime()) / (86400 * 1000));
      if (diffDays >= 0 && diffDays < 35) {
        const weekIdx = Math.min(4, Math.max(0, 4 - Math.floor(diffDays / 7)));
        amounts[weekIdx] = (amounts[weekIdx] || 0) + Math.abs(Number(tx.amount) || 0);
      }
    });

    dataPoints = shortLabels.map((label, i) => ({
      label,
      fullLabel: weeks[i],
      amount: amounts[i],
    }));
  } else {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = now.getMonth();
    const m3 = (currentMonth - 2 + 12) % 12;
    const m2 = (currentMonth - 1 + 12) % 12;
    const m1 = currentMonth;
    const months = [monthNames[m3], monthNames[m2], monthNames[m1]];
    const amounts = [0, 0, 0];

    purchases.forEach((tx) => {
      const txDate = parseTxDate(tx);
      const diffMonths = (now.getFullYear() - txDate.getFullYear()) * 12 + (now.getMonth() - txDate.getMonth());
      if (diffMonths >= 0 && diffMonths < 3) {
        const idx = 2 - diffMonths;
        amounts[idx] = (amounts[idx] || 0) + Math.abs(Number(tx.amount) || 0);
      }
    });

    dataPoints = months.map((label, i) => ({
      label,
      fullLabel: label,
      amount: amounts[i],
    }));
  }

  const totalPeriodSpend = dataPoints.reduce((s, p) => s + p.amount, 0);
  const maxAmount = Math.max(...dataPoints.map((p) => p.amount), 1);
  const hasPurchases = purchases.length > 0;

  const chartWidth = Math.min(SCREEN_WIDTH - 48, 380);
  const chartHeight = 130;
  const paddingH = 24;
  const paddingV = 16;
  const graphWidth = chartWidth - paddingH * 2;
  const graphHeight = chartHeight - paddingV * 2;

  const points = dataPoints.map((dp, i) => {
    const x = paddingH + (i / Math.max(1, dataPoints.length - 1)) * graphWidth;
    const normalizedAmount = totalPeriodSpend > 0 ? dp.amount / maxAmount : 0;
    const y = paddingV + graphHeight - normalizedAmount * graphHeight;
    return { x, y, dp, index: i };
  });

  const linePath = generateSmoothPath(points);
  const areaPath = generateAreaPath(points, paddingV + graphHeight);
  const activePoint = selectedIdx !== null ? points[selectedIdx] : null;

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <View style={styles.chartHeader}>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.chartTitle, Typography.headlineMd, { color: colors.primary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Electricity Spending
          </Text>
          <Text style={[Typography.labelCaps, { color: colors.textSecondary, marginTop: 2, fontSize: 10 }]}>
            {totalPeriodSpend > 0
              ? `Total: ₦${totalPeriodSpend.toLocaleString()}`
              : `${purchases.length} total ${purchases.length === 1 ? 'purchase' : 'purchases'}`}
          </Text>
        </View>
        <View style={[styles.chartFilter, { backgroundColor: colors.surfaceContainer }]}>
          {([
            { key: '7d', label: '7D' },
            { key: '30d', label: '30D' },
            { key: '90d', label: '3M' },
          ] as const).map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.filterBtn, period === p.key ? [styles.filterBtnActive, { backgroundColor: colors.surface }] : null]}
              onPress={() => {
                setSelectedIdx(null);
                onPeriodChange(p.key);
              }}
            >
              <Text
                style={[
                  styles.filterBtnText,
                  Typography.labelCaps,
                  period === p.key ? { color: colors.primary } : { color: colors.textSecondary },
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Selected Data Point Tooltip */}
      {activePoint && (
        <View style={[styles.chartTooltip, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }]}>
          <Text style={[Typography.labelCaps, { color: colors.textSecondary, fontSize: 10 }]}>
            {activePoint.dp.fullLabel}
          </Text>
          <Text style={[Typography.headlineMd, { color: colors.primary, fontSize: 14 }]}>
            ₦{activePoint.dp.amount.toLocaleString()}
          </Text>
        </View>
      )}

      {hasPurchases ? (
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <Svg width={chartWidth} height={chartHeight}>
            <Defs>
              <LinearGradient id="homeSpendGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={colors.secondary} stopOpacity="0.35" />
                <Stop offset="100%" stopColor={colors.secondary} stopOpacity="0.0" />
              </LinearGradient>
            </Defs>

            {/* Grid Reference Lines */}
            <Line
              x1={paddingH}
              y1={paddingV}
              x2={chartWidth - paddingH}
              y2={paddingV}
              stroke={colors.outlineVariant}
              strokeDasharray="4 4"
              strokeWidth={0.8}
            />
            <Line
              x1={paddingH}
              y1={paddingV + graphHeight / 2}
              x2={chartWidth - paddingH}
              y2={paddingV + graphHeight / 2}
              stroke={colors.outlineVariant}
              strokeDasharray="4 4"
              strokeWidth={0.8}
            />
            <Line
              x1={paddingH}
              y1={paddingV + graphHeight}
              x2={chartWidth - paddingH}
              y2={paddingV + graphHeight}
              stroke={colors.outlineVariant}
              strokeWidth={1}
            />

            {/* Area Fill */}
            {totalPeriodSpend > 0 && <Path d={areaPath} fill="url(#homeSpendGradient)" />}

            {/* Main Trend Line */}
            <Path
              d={linePath}
              fill="none"
              stroke={colors.secondary}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data Point Circles */}
            {points.map((p, i) => (
              <G key={i}>
                <Circle
                  cx={p.x}
                  cy={p.y}
                  r={selectedIdx === i ? 6 : p.dp.amount > 0 ? 4 : 2}
                  fill={p.dp.amount > 0 ? colors.secondary : colors.surfaceContainerHigh}
                  stroke={colors.surface}
                  strokeWidth={selectedIdx === i ? 2 : 1}
                />
              </G>
            ))}
          </Svg>

          {/* X-Axis Labels */}
          <View style={[styles.chartLabelsRow, { width: chartWidth, paddingHorizontal: paddingH }]}>
            {points.map((p, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setSelectedIdx(selectedIdx === i ? null : i)}
                style={{ alignItems: 'center' }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text
                  style={[
                    styles.chartBarLabel,
                    Typography.labelCaps,
                    {
                      color: selectedIdx === i ? colors.primary : colors.textSecondary,
                      fontWeight: selectedIdx === i || p.dp.amount > 0 ? '700' : '400',
                    },
                  ]}
                >
                  {p.dp.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={{ paddingVertical: 24, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialIcons name="show-chart" size={32} color={colors.outline} style={{ marginBottom: 6, opacity: 0.6 }} />
          <Text style={[Typography.bodyMd, { color: colors.textSecondary, fontSize: 13 }]}>
            No purchases recorded yet.
          </Text>
        </View>
      )}
    </View>
  );
}

function CircularProgress({
  kwhLeft = null,
  progress = 0,
  size = 115,
  colors,
}: {
  kwhLeft?: number | null;
  progress?: number;
  size?: number;
  colors: any;
}) {
  const strokeWidth = 8;
  const isAvailable = kwhLeft !== null && kwhLeft !== undefined && !isNaN(Number(kwhLeft));
  const safeKwh = isAvailable ? Math.max(0, Math.round(Number(kwhLeft))) : null;
  const clampedProgress = isAvailable && !isNaN(Number(progress)) ? Math.min(100, Math.max(0, Number(progress))) : 0;

  // Authoritative energy status color calculation (Green > 50%, Yellow > 20% & <= 50%, Red <= 20%)
  const statusResult = EnergyStatusService.getEnergyStatus(progress, kwhLeft, colors);
  const activeArcColor = statusResult.color;

  // Clockwise SVG progress geometry starting at 12 o'clock (top)
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityLabel={statusResult.accessibilityLabel}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(clampedProgress),
        text: `${safeKwh !== null ? safeKwh + ' kWh' : 'N/A'} remaining (${statusResult.label})`,
      }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Background track circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.surfaceContainerHigh}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Active progress arc reading down clockwise from top (12 o'clock) */}
        {isAvailable && clampedProgress > 0 && (
          <G rotation="-90" origin={`${center}, ${center}`}>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={activeArcColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
            />
          </G>
        )}
      </Svg>
      <View style={{ alignItems: 'center' }}>
        {isAvailable && safeKwh !== null ? (
          <>
            <Text style={[styles.ringValue, { color: colors.primary }]}>{safeKwh}</Text>
            <Text style={[styles.ringLabel, { color: colors.textSecondary }]}>kWh Left</Text>
          </>
        ) : (
          <>
            <Text style={[styles.ringValue, { color: colors.outline, fontSize: 13, letterSpacing: 0.5 }]}>
              N/A
            </Text>
            <Text style={[styles.ringLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              kWh Left
            </Text>
            <Text style={{ fontSize: 8, color: colors.outline, textTransform: 'uppercase', marginTop: 2, textAlign: 'center' }}>
              No Telemetry
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function ExpandableTransaction({
  tx,
  colors,
}: {
  tx: Transaction;
  colors: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const isFunding = tx.type === 'funding';

  return (
    <TouchableOpacity
      style={[styles.txItem, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
    >
      <View style={styles.txRow}>
        <View
          style={[
            styles.txIcon,
            {
              backgroundColor:
                tx.status === 'Failed'
                  ? colors.errorBg
                  : isFunding
                  ? colors.successBg
                  : colors.surfaceContainerHigh,
            },
          ]}
        >
          <MaterialIcons
            name={
              tx.status === 'Failed'
                ? 'error-outline'
                : isFunding
                ? 'account-balance-wallet'
                : 'electric-bolt'
            }
            size={22}
            color={
              tx.status === 'Failed'
                ? colors.error
                : isFunding
                ? colors.secondaryDark
                : colors.primary
            }
          />
        </View>
        <View style={styles.txInfo}>
          <Text style={[styles.txTitle, Typography.metricUnit, { color: colors.primary }]}>
            {tx.title}
          </Text>
          <Text style={[styles.txDate, Typography.bodyMd, { color: colors.textSecondary }]}>
            {tx.date}
          </Text>
        </View>
        <View style={styles.txRight}>
          <Text
            style={[
              styles.txAmount,
              Typography.metricUnit,
              {
                color:
                  tx.status === 'Failed'
                    ? colors.error
                    : isFunding
                    ? colors.secondaryDark
                    : colors.primary,
              },
            ]}
          >
            {isFunding ? '+' : '-'}₦{Math.abs(tx.amount).toLocaleString()}
          </Text>
          {tx.units && (
            <View style={[styles.txUnitsTag, { backgroundColor: 'rgba(172,248,71,0.2)' }]}>
              <Text style={[styles.txUnitsText, Typography.labelCaps, { color: colors.secondaryDark }]}>
                {tx.units} kWh
              </Text>
            </View>
          )}
        </View>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={18}
          color={colors.outline}
          style={{ marginLeft: 4 }}
        />
      </View>

      {/* Expanded detail panel */}
      {expanded && (
        <View style={[styles.txDetail, { borderTopColor: colors.outlineVariant }]}>
          <View style={styles.txDetailGrid}>
            {tx.reference && (
              <View style={styles.txDetailRow}>
                <Text style={[styles.txDetailLabel, Typography.labelCaps, { color: colors.outline }]}>
                  Reference
                </Text>
                <Text style={[styles.txDetailValue, Typography.metricUnit, { color: colors.text }]}>
                  {tx.reference}
                </Text>
              </View>
            )}
            {tx.meterNumber && (
              <View style={styles.txDetailRow}>
                <Text style={[styles.txDetailLabel, Typography.labelCaps, { color: colors.outline }]}>
                  Meter
                </Text>
                <Text style={[styles.txDetailValue, Typography.metricUnit, { color: colors.text }]}>
                  ••••{tx.meterNumber.replace(/\s/g, '').slice(-4)}
                </Text>
              </View>
            )}
            {tx.units && (
              <View style={styles.txDetailRow}>
                <Text style={[styles.txDetailLabel, Typography.labelCaps, { color: colors.outline }]}>
                  Units
                </Text>
                <Text style={[styles.txDetailValue, Typography.metricUnit, { color: colors.text }]}>
                  {tx.units} kWh
                </Text>
              </View>
            )}
            <View style={styles.txDetailRow}>
              <Text style={[styles.txDetailLabel, Typography.labelCaps, { color: colors.outline }]}>
                Status
              </Text>
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor:
                      tx.status === 'Completed'
                        ? colors.successBg
                        : tx.status === 'Pending'
                        ? 'rgba(133,100,4,0.1)'
                        : colors.errorBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    Typography.labelCaps,
                    {
                      color:
                        tx.status === 'Completed'
                          ? colors.secondaryDark
                          : tx.status === 'Pending'
                          ? '#856404'
                          : colors.error,
                    },
                  ]}
                >
                  {tx.status}
                </Text>
              </View>
            </View>
            {(tx.description || tx.errorMessage || tx.status === 'Failed') && (
              <View style={[styles.txDetailRow, { alignItems: 'flex-start', paddingTop: 4 }]}>
                <Text style={[styles.txDetailLabel, Typography.labelCaps, { color: colors.error }]}>
                  Detail
                </Text>
                <Text style={[styles.txDetailValue, Typography.bodyMd, { color: colors.error, flex: 1, textAlign: 'right' }]}>
                  {tx.errorMessage || tx.description || 'Transaction could not be completed by provider.'}
                </Text>
              </View>
            )}
          </View>

          {/* Token display */}
          {tx.token && (
            <View style={[styles.tokenBox, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
              <View style={styles.tokenHeader}>
                <MaterialIcons name="vpn-key" size={14} color={colors.secondaryDark} />
                <Text style={[styles.tokenLabel, Typography.labelCaps, { color: colors.secondaryDark }]}>
                  Electricity Token
                </Text>
              </View>
              <Text style={[styles.tokenValue, { color: colors.primary }]}>
                {tx.token}
              </Text>
              <Text style={[styles.tokenHint, Typography.labelCaps, { color: colors.outline }]}>
                Enter this code into your meter keypad
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const {
    userName,
    walletBalance,
    refreshWallet,
    refreshTransactions,
    meters,
    activeMeterId,
    selectMeter,
    transactions,
    unreadCount,
    unreadSupportCount,
    refreshSupportCount,
    consumptionAnalytics,
    appliances,
    energyProfile,
    addNotification,
  } = useApp();

  useFocusEffect(
    useCallback(() => {
      refreshWallet?.();
      refreshTransactions?.();
      refreshSupportCount?.();
    }, [refreshWallet, refreshTransactions, refreshSupportCount])
  );
  const activeMeter = meters.find((m) => m.id === activeMeterId) || (meters.length > 0 ? meters[0] : undefined);
  const firstName = userName.split(' ')[0];
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [homeChartPeriod, setHomeChartPeriod] = useState<'7d' | '30d' | '90d'>('7d');

  // Authoritative analytics values from single source of truth
  const avgDailySpend = consumptionAnalytics?.spending.averageDailySpendNaira;
  const purchaseVelocity = consumptionAnalytics?.purchasing.purchaseVelocity;
  const totalPurchases = consumptionAnalytics?.purchasing.totalPurchases || 0;

  // Chart data from single source of truth
  const chartBuckets = consumptionAnalytics?.periodChart?.buckets || [];
  const maxSpend = Math.max(...chartBuckets.map((b) => b.amountNaira), 1);
  const hasChartData = chartBuckets.some((b) => b.amountNaira > 0);

  // Purchase transactions strictly scoped to active meter (no fallback to all purchases)
  const purchaseTxs = transactions.filter((t) => t.type === 'purchase' && t.status === 'Completed');
  const meterPurchaseTxs = activeMeter
    ? purchaseTxs.filter((t) => {
        if (!t.meterNumber) return false;
        const cleanTx = t.meterNumber.replace(/\s/g, '');
        const cleanMeter = activeMeter.number.replace(/\s/g, '');
        return cleanTx.includes(cleanMeter.slice(-4)) || cleanMeter.includes(cleanTx.slice(-4));
      })
    : [];
  const relevantPurchases = meterPurchaseTxs;

  // Safe timestamp parser
  const parseTxTime = (tx: Transaction): number => {
    if (tx.createdAt) {
      const t = new Date(tx.createdAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (tx.date) {
      const t = new Date(tx.date).getTime();
      if (!isNaN(t) && t > 0) return t;
      if (tx.date.toLowerCase().includes('today')) return Date.now() - 3600000;
      if (tx.date.toLowerCase().includes('yesterday')) return Date.now() - 86400000;
    }
    return Date.now() - 3600000;
  };

  const sortedPurchases = [...relevantPurchases].sort((a, b) => parseTxTime(a) - parseTxTime(b));

  const totalPurchasedUnits = sortedPurchases.reduce((sum, tx) => {
    const rawUnits = tx.units || (tx.amount ? Math.round((Math.abs(Number(tx.amount)) / 206.8) * 10) / 10 : 0);
    const u = !isNaN(Number(rawUnits)) && Number(rawUnits) > 0 ? Number(rawUnits) : 0;
    return sum + u;
  }, 0);

  const applianceDailyKwh = appliances.reduce(
    (sum, a) => sum + (Number(a.estimated_daily_kwh) || 0),
    0
  );
  const defaultDailyKwh = energyProfile?.account_type === 'business' ? 24.0 : (energyProfile?.account_type ? 8.5 : 0);
  // Profile-based daily rate is the authoritative display value — always reflects what the
  // user explicitly configured in energy setup (appliances > account-type default > 5 kWh).
  // We do NOT override this with the analytics history-derived rate to prevent post-load flicker.
  const profileDailyKwh = applianceDailyKwh > 0 ? applianceDailyKwh : defaultDailyKwh;
  const effectiveDailyKwh = profileDailyKwh > 0 ? profileDailyKwh : 5.0;

  const displayDailyUsage =
    effectiveDailyKwh > 0
      ? `${effectiveDailyKwh.toFixed(1)} kWh/day`
      : 'Not enough data';

  // Cumulative energy ledger balance:
  // Decays purchased units using the profile burn rate between each purchase timestamp,
  // then from the last purchase up to now. KWH LEFT = total purchased minus decayed usage.
  let runningBalanceKwh = 0;
  let lastTimestamp = sortedPurchases.length > 0 ? parseTxTime(sortedPurchases[0]) : Date.now();

  for (const tx of sortedPurchases) {
    const txTime = parseTxTime(tx);
    const timeDeltaDays = txTime >= lastTimestamp
      ? Math.max(0, (txTime - lastTimestamp) / (86400 * 1000))
      : 0;
    runningBalanceKwh = Math.max(0, runningBalanceKwh - (effectiveDailyKwh * timeDeltaDays));

    const rawUnits = tx.units || (tx.amount ? Math.round((Math.abs(Number(tx.amount)) / 206.8) * 10) / 10 : 0);
    const u = !isNaN(Number(rawUnits)) && Number(rawUnits) > 0 ? Number(rawUnits) : 0;
    runningBalanceKwh += u;
    lastTimestamp = txTime;
  }

  // Decay from last purchase to now
  const finalDeltaDays = Math.max(0, (Date.now() - lastTimestamp) / (86400 * 1000));
  runningBalanceKwh = Math.max(0, runningBalanceKwh - (effectiveDailyKwh * finalDeltaDays));

  // KWH LEFT: always the locally computed ledger balance (profile burn rate applied consistently).
  // The analytics service uses its own internal fallback rate which can differ, causing mismatch.
  // Using the local value ensures KWH LEFT, daily usage, and days remaining are always coherent.
  const calculatedRemainingKwh = totalPurchasedUnits > 0 ? Math.round(runningBalanceKwh) : null;
  const remainingKwh =
    calculatedRemainingKwh !== null
      ? Math.max(0, calculatedRemainingKwh)
      : null;

  const daysRemaining =
    remainingKwh !== null && remainingKwh > 0 && effectiveDailyKwh > 0
      ? Math.max(1, Math.round(remainingKwh / effectiveDailyKwh))
      : 0;
  const progressPercent =
    totalPurchasedUnits > 0 && remainingKwh !== null
      ? Math.min(100, Math.max(5, Math.round((remainingKwh / totalPurchasedUnits) * 100)))
      : 0;

  // Authoritative status transition handler with persistence and anti-spam protection
  useEffect(() => {
    if (!activeMeter?.id) return;
    const statusResult = EnergyStatusService.getEnergyStatus(
      progressPercent,
      remainingKwh,
      colors,
      undefined,
      daysRemaining
    );
    if (statusResult.status) {
      EnergyStatusService.handleMeterStatusTransition(
        activeMeter.id,
        statusResult.status,
        addNotification
      );
    }
  }, [activeMeter?.id, progressPercent, remainingKwh]);
  const totalPurchaseSpend = relevantPurchases
    .filter((t) => t.type === 'purchase' && t.status === 'Completed')
    .reduce((acc, t) => acc + Math.abs(Number(t.amount) || 0), 0);

  const monthlySpent =
    consumptionAnalytics?.spending.currentPeriodSpendNaira && consumptionAnalytics.spending.currentPeriodSpendNaira > 0
      ? consumptionAnalytics.spending.currentPeriodSpendNaira
      : totalPurchaseSpend;

  const recentTransactions = activeMeter
    ? transactions
        .filter((t) => {
          if (!t.meterNumber) return false;
          const cleanTx = t.meterNumber.replace(/\s/g, '');
          const cleanMeter = activeMeter.number.replace(/\s/g, '');
          return cleanTx.includes(cleanMeter.slice(-4)) || cleanMeter.includes(cleanTx.slice(-4));
        })
        .slice(0, 3)
    : [];

  const getHour = () => {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  };

  const handleSelectMeter = (id: string) => {
    selectMeter(id);
    setDropdownOpen(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => setDropdownOpen(false)}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={[styles.avatar, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/personal-info')}
              activeOpacity={0.8}
            >
              <Text style={[styles.avatarText, Typography.headlineMd, { color: colors.surface }]}>
                {firstName.charAt(0).toUpperCase()}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/personal-info')}
              activeOpacity={0.8}
            >
              <Text style={[styles.greeting, Typography.labelCaps, { color: colors.textSecondary }]}>
                Good {getHour()}
              </Text>
              <Text style={[styles.userName, Typography.headlineLgMobile, { color: colors.primary }]}>
                {firstName} ⚡
              </Text>
            </TouchableOpacity>
          </View>

          {/* Header Action Buttons: Support + Bell */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
            {/* Customer Support Button */}
            <TouchableOpacity
              style={[styles.notifButton, { backgroundColor: colors.surfaceContainerHighest }]}
              onPress={() => router.push('/support' as any)}
              accessibilityLabel="Customer Support Center"
              accessibilityRole="button"
            >
              <MaterialIcons name="headset-mic" size={22} color={colors.primary} />
              {unreadSupportCount > 0 && (
                <View style={[styles.bellBadge, { borderColor: colors.surfaceContainerHighest }]}>
                  <Text style={styles.bellBadgeText}>
                    {unreadSupportCount > 9 ? '9+' : unreadSupportCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Bell with unread badge */}
            <TouchableOpacity
              style={[styles.notifButton, { backgroundColor: colors.surfaceContainerHighest }]}
              onPress={() => router.push('/notifications')}
              accessibilityLabel="Notifications"
              accessibilityRole="button"
            >
              <MaterialIcons name="notifications-none" size={24} color={colors.primary} />
              {unreadCount > 0 && (
                <View style={[styles.bellBadge, { borderColor: colors.surfaceContainerHighest }]}>
                  <Text style={styles.bellBadgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Meter Selector Pill + Dropdown */}
        <View style={styles.meterSelectorWrap}>
          {activeMeter ? (
            <TouchableOpacity
              style={[
                styles.meterSelector,
                {
                  backgroundColor: colors.surface,
                  borderColor: dropdownOpen ? colors.primary : colors.outlineVariant,
                  borderBottomLeftRadius: dropdownOpen ? 0 : Rounded.default,
                  borderBottomRightRadius: dropdownOpen ? 0 : Rounded.default,
                  borderBottomWidth: dropdownOpen ? 0 : 1,
                },
              ]}
              onPress={() => setDropdownOpen((v) => !v)}
              activeOpacity={0.8}
            >
              <View style={styles.meterSelectorLeft}>
                <MaterialCommunityIcons name="lightning-bolt" size={18} color={colors.secondaryDark} />
                <Text
                  style={[styles.meterSelectorText, Typography.metricUnit, { color: colors.text }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {activeMeter.name} — {activeMeter.disco} ••••{activeMeter.number.slice(-4)}
                </Text>
              </View>
              <MaterialIcons
                name={dropdownOpen ? 'expand-less' : 'expand-more'}
                size={20}
                color={colors.outline}
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.meterSelectorEmpty, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
              onPress={() => router.push('/add-meter')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="lightning-bolt-outline" size={18} color={colors.outline} />
              <Text style={[styles.meterSelectorEmptyText, Typography.metricUnit, { color: colors.outline }]}>
                No meter selected — tap to add one
              </Text>
              <MaterialIcons name="add" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}

          {/* Inline Dropdown */}
          {dropdownOpen && meters.length > 0 && (
            <View style={[styles.dropdownCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
              {meters.map((m, i) => {
                const isActive = m.id === activeMeterId;
                return (
                  <React.Fragment key={m.id}>
                    {i > 0 && <View style={[styles.dropdownDivider, { backgroundColor: colors.outlineVariant }]} />}
                    <TouchableOpacity
                      style={[
                        styles.dropdownItem,
                        { backgroundColor: isActive ? (colors.successBg + '30') : colors.surface },
                      ]}
                      onPress={() => handleSelectMeter(m.id)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.dropdownItemIcon, { backgroundColor: isActive ? 'rgba(132,204,22,0.15)' : colors.surfaceContainerHigh }]}>
                        <MaterialCommunityIcons
                          name="lightning-bolt"
                          size={16}
                          color={isActive ? colors.secondaryDark : colors.outline}
                        />
                      </View>
                      <View style={styles.dropdownItemInfo}>
                        <Text style={[styles.dropdownItemName, Typography.metricUnit, { color: colors.primary }]} numberOfLines={1}>
                          {m.name}
                        </Text>
                        <Text style={[styles.dropdownItemMeta, Typography.labelCaps, { color: colors.outline }]} numberOfLines={1}>
                          {m.disco} ••••{m.number.replace(/\s/g, '').slice(-4)}
                        </Text>
                      </View>
                      {isActive && <MaterialIcons name="check" size={18} color={colors.secondaryDark} />}
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
              <View style={[styles.dropdownDivider, { backgroundColor: colors.outlineVariant }]} />
              <TouchableOpacity
                style={[styles.dropdownAddRow, { backgroundColor: colors.surfaceContainerLow }]}
                onPress={() => { setDropdownOpen(false); router.push('/add-meter'); }}
                activeOpacity={0.8}
              >
                <View style={[styles.dropdownAddIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <MaterialIcons name="add" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.dropdownAddText, Typography.metricUnit, { color: colors.primary }]}>Add New Meter</Text>
                <MaterialIcons name="chevron-right" size={18} color={colors.outline} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Main Energy Card */}
        {meters.length > 0 ? (
          <View style={[styles.energyCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={[styles.energyCardDecor, { backgroundColor: colors.secondary }]} />
            <View style={styles.energyCardContent}>
              <View style={styles.energyCardInfo}>
                <View style={styles.energyLabelRow}>
                  <MaterialCommunityIcons name="lightning-bolt" size={16} color={colors.secondaryDark} />
                  <Text style={[styles.energyLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                    Current Status
                  </Text>
                </View>
                <Text
                  style={[styles.energyTitle, { color: colors.primary }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {daysRemaining > 0 ? (
                    <>
                      Est. Days:{' '}
                      <Text style={{ color: colors.secondaryDark, fontFamily: 'Inter_700Bold' }}>
                        ~{daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}
                      </Text>
                    </>
                  ) : totalPurchases === 0 ? (
                    <>
                      Status:{' '}
                      <Text style={{ color: colors.textSecondary, fontFamily: 'Inter_700Bold' }}>
                        Awaiting recharge
                      </Text>
                    </>
                  ) : (
                    <>
                      Status:{' '}
                      <Text style={{ color: colors.secondaryDark, fontFamily: 'Inter_700Bold' }}>
                        Need 2+ purchases
                      </Text>
                    </>
                  )}
                </Text>
                <Text style={[styles.energySubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                  {purchaseVelocity
                    ? `Purchase cadence: ${purchaseVelocity}`
                    : totalPurchases === 0
                    ? 'Recharge your meter to unlock purchase cadence intelligence'
                    : 'Estimated from historical purchase cadence'}
                </Text>
                <View style={[styles.dailyAvgRow, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
                  <Text style={[styles.dailyAvgLabel, { color: colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
                    Avg. daily usage
                  </Text>
                  <Text style={[styles.dailyAvgValue, { color: effectiveDailyKwh > 0 ? colors.primary : colors.textSecondary }]}>
                    {displayDailyUsage}
                  </Text>
                </View>
              </View>
              <CircularProgress
                kwhLeft={remainingKwh}
                progress={progressPercent}
                size={115}
                colors={colors}
              />
            </View>
          </View>
        ) : (
          <View style={[styles.emptyMeterCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={styles.emptyMeterCardContent}>
              <View style={[styles.emptyMeterIconCircle, { backgroundColor: colors.surfaceContainerHigh }]}>
                <MaterialCommunityIcons name="lightning-bolt-outline" size={32} color={colors.secondaryDark} />
              </View>
              <View style={styles.emptyMeterTextWrap}>
                <Text style={[styles.emptyMeterTitle, Typography.headlineMd, { color: colors.primary }]}>
                  No Meter Linked Yet
                </Text>
                <Text style={[styles.emptyMeterSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Link your prepaid or postpaid meter to buy electricity tokens and track energy usage.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.addMeterBtn, { backgroundColor: colors.secondaryDark }]}
              onPress={() => router.push('/add-meter')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add" size={20} color="#ffffff" />
              <Text style={[styles.addMeterBtnText, Typography.headlineMd, { fontSize: 15, color: '#ffffff' }]}>
                Add Your Meter
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Stats Row */}
        <View style={[styles.statsRow, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <View style={[styles.statCard, { flex: 1 }]}>
            <Text style={[styles.statLabel, Typography.labelCaps, { color: colors.textSecondary }]}>This Month</Text>
            <Text style={[styles.statValue, Typography.headlineMd, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
              ₦{monthlySpent.toLocaleString()}
            </Text>
            <Text style={[styles.statSubLabel, Typography.metricUnit, { color: colors.outline }]}>Spent</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.outlineVariant }]} />
          <TouchableOpacity
            style={[styles.statCard, { flex: 1 }]}
            onPress={() => router.push('/fund-wallet')}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.statLabel, Typography.labelCaps, { color: colors.textSecondary }]}>Wallet</Text>
              <View style={styles.fundPill}>
                <Text style={styles.fundPillText}>+ Fund</Text>
              </View>
            </View>
            <Text style={[styles.statValue, Typography.headlineMd, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
              ₦{walletBalance.toLocaleString()}
            </Text>
            <Text style={[styles.statSubLabel, Typography.metricUnit, { color: colors.outline }]}>Tap to top up</Text>
          </TouchableOpacity>
        </View>

        {/* Alert Card - Show only when statistically justified by real comparison */}
        {consumptionAnalytics?.usageAlert?.shouldShowAlert && (
          <View style={[styles.alertCard, { backgroundColor: colors.errorBg, borderColor: 'rgba(186,26,26,0.1)' }]}>
            <MaterialIcons name="warning-amber" size={20} color={colors.onErrorText} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertTitle, Typography.metricUnit, { color: colors.onErrorText }]}>
                {consumptionAnalytics.usageAlert.alertTitle}
              </Text>
              <Text style={[styles.alertBody, Typography.bodyMd, { color: colors.onErrorText, opacity: 0.8 }]}>
                {consumptionAnalytics.usageAlert.alertBody}
              </Text>
            </View>
          </View>
        )}

        {/* Buy Electricity CTA */}
        <TouchableOpacity style={[styles.buyButton, { backgroundColor: colors.secondaryDark }]} onPress={() => router.push('/buy-electricity')}>
          <MaterialIcons name="add-circle-outline" size={22} color="#ffffff" />
          <Text style={[styles.buyButtonText, Typography.headlineMd]}>Buy Electricity</Text>
        </TouchableOpacity>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          {[
            { icon: 'receipt-long', label: 'Activity', route: '/(tabs)/activity' },
            { icon: 'bar-chart', label: 'Insights', route: '/(tabs)/insights' },
            { icon: 'electrical-services', label: 'Meters', route: '/manage-meters' },
            { icon: 'person-outline', label: 'Profile', route: '/(tabs)/profile' },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.quickActionItem, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
              onPress={() => router.push(item.route as any)}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.surfaceContainer }]}>
                <MaterialIcons name={item.icon as any} size={22} color={colors.primary} />
              </View>
              <Text
                style={[styles.quickActionLabel, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Electricity Spending Line Chart */}
        <ElectricitySpendingLineChart
          transactions={transactions}
          period={homeChartPeriod}
          onPeriodChange={setHomeChartPeriod}
          colors={colors}
        />

        {/* Recent Activity */}
        <View style={styles.recentSection}>
          <Text style={[styles.sectionTitle, Typography.headlineMd, { color: colors.primary }]}>Recent Activity</Text>
          {recentTransactions.length > 0 ? (
            recentTransactions.map((tx) => (
              <ExpandableTransaction key={tx.id} tx={tx} colors={colors} />
            ))
          ) : (
            <View style={[styles.emptyTxCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <MaterialCommunityIcons name="receipt-text-outline" size={36} color={colors.outline} />
              <Text style={[styles.emptyTxTitle, Typography.headlineMd, { fontSize: 16, color: colors.primary }]}>
                No Transactions Yet
              </Text>
              <Text style={[styles.emptyTxText, Typography.bodyMd, { color: colors.textSecondary }]}>
                Your token purchases and wallet top-ups will appear here.
              </Text>
            </View>
          )}
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18 },
  greeting: { textTransform: 'uppercase' },
  userName: { marginTop: 2 },
  notifButton: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: Rounded.full,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  bellBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    lineHeight: 12,
  },
  meterSelectorWrap: {
    marginHorizontal: Spacing.containerMargin,
    marginBottom: Spacing.md,
    zIndex: 10,
  },
  meterSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderRadius: Rounded.default,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  meterSelectorLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flex: 1, marginRight: Spacing.xs },
  meterSelectorText: { flex: 1 },
  meterSelectorEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: Rounded.default,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  meterSelectorEmptyText: { flex: 1 },
  dropdownCard: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: Rounded.default,
    borderBottomRightRadius: Rounded.default,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  dropdownDivider: { height: 1 },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dropdownItemIcon: {
    width: 32,
    height: 32,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dropdownItemInfo: { flex: 1 },
  dropdownItemName: {},
  dropdownItemMeta: { textTransform: 'uppercase', marginTop: 1 },
  dropdownAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dropdownAddIcon: {
    width: 32,
    height: 32,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dropdownAddText: { flex: 1 },
  energyCard: {
    marginHorizontal: Spacing.containerMargin,
    borderRadius: Rounded.xl,
    padding: Spacing.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.cardGap,
  },
  energyCardDecor: {
    position: 'absolute',
    right: -40,
    top: -40,
    width: 150,
    height: 150,
    borderRadius: Rounded.full,
    opacity: 0.05,
  },
  energyCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  energyCardInfo: { flex: 1, paddingRight: Spacing.xs },
  energyLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  energyLabel: { textTransform: 'uppercase', fontSize: 10 },
  energyTitle: {
    marginBottom: 2,
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 20,
  },
  energySubtitle: {
    fontSize: 11,
    lineHeight: 15,
    marginBottom: Spacing.xs,
    fontFamily: 'Inter_400Regular',
  },
  dailyAvgRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Rounded.default,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    marginTop: 2,
  },
  dailyAvgLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', flexShrink: 1 },
  dailyAvgValue: { fontSize: 11, fontFamily: 'Inter_700Bold', marginLeft: 4 },
  ringValue: { fontSize: 26, fontFamily: 'Inter_700Bold', lineHeight: 30 },
  ringLabel: { textTransform: 'uppercase', fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.containerMargin,
    marginBottom: Spacing.cardGap,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statCard: { padding: Spacing.md },
  statDivider: { width: 1, marginVertical: Spacing.md },
  statLabel: { textTransform: 'uppercase', marginBottom: Spacing.xs },
  statValue: {},
  statSubLabel: { marginTop: 2 },
  fundPill: {
    backgroundColor: 'rgba(132,204,22,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Rounded.full,
  },
  fundPillText: {
    color: '#416900',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  alertCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginHorizontal: Spacing.containerMargin,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.cardGap,
  },
  alertTitle: { fontWeight: '600', marginBottom: 4 },
  alertBody: { fontSize: 13 },
  buyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.containerMargin,
    height: 52,
    borderRadius: Rounded.full,
    marginBottom: Spacing.lg,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  buyButtonText: { color: '#ffffff' },
  quickActions: {
    flexDirection: 'row',
    marginHorizontal: Spacing.containerMargin,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  quickActionItem: {
    flex: 1,
    borderRadius: Rounded.lg,
    padding: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    minHeight: 80,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    textTransform: 'uppercase',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
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
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  chartTitle: { flex: 1, marginRight: Spacing.xs },
  chartFilter: {
    flexDirection: 'row',
    borderRadius: Spacing.xs,
    padding: 2,
    flexShrink: 0,
  },
  filterBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Spacing.xs,
  },
  filterBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  filterBtnText: {},
  chartTooltip: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Rounded.md,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 4,
  },
  chartLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
    marginTop: Spacing.sm,
  },
  chartBarWrapper: { alignItems: 'center', flex: 1, gap: 4 },
  chartBar: {
    width: 20,
    borderRadius: Rounded.sm,
    opacity: 0.75,
  },
  chartBarLabel: { textTransform: 'uppercase' },
  recentSection: {
    paddingHorizontal: Spacing.containerMargin,
  },
  sectionTitle: { marginBottom: Spacing.md },

  // Transaction items
  txItem: {
    borderRadius: Rounded.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  txIcon: {
    width: 44,
    height: 44,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  txInfo: { flex: 1 },
  txTitle: {},
  txDate: { fontSize: 13, marginTop: 2 },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontWeight: '600' },
  txUnitsTag: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Rounded.sm,
  },
  txUnitsText: { textTransform: 'uppercase' },

  // Expanded detail
  txDetail: {
    borderTopWidth: 1,
    padding: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  txDetailGrid: { gap: 8 },
  txDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txDetailLabel: { textTransform: 'uppercase' },
  txDetailValue: {},
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Rounded.full,
  },
  statusPillText: { textTransform: 'uppercase' },
  tokenBox: {
    borderRadius: Rounded.default,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 6,
  },
  tokenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tokenLabel: { textTransform: 'uppercase' },
  tokenValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    letterSpacing: 2,
    lineHeight: 26,
  },
  tokenHint: { textTransform: 'uppercase' },
  emptyMeterCard: {
    marginHorizontal: Spacing.containerMargin,
    borderRadius: Rounded.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: Spacing.cardGap,
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyMeterCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyMeterIconCircle: {
    width: 52,
    height: 52,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emptyMeterTextWrap: {
    flex: 1,
  },
  emptyMeterTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  emptyMeterSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  addMeterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    height: 44,
    borderRadius: Rounded.default,
  },
  addMeterBtnText: {
    color: '#ffffff',
  },
  emptyTxCard: {
    borderRadius: Rounded.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  emptyTxTitle: {
    marginTop: Spacing.xs,
  },
  emptyTxText: {
    textAlign: 'center',
    fontSize: 13,
  },
});
