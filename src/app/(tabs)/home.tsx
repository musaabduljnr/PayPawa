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
import { router, useFocusEffect } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useApp, Transaction } from '@/context/AppContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function CircularProgress({
  kwhLeft = 0,
  progress = 0,
  size = 115,
  colors,
}: {
  kwhLeft?: number;
  progress?: number;
  size?: number;
  colors: any;
}) {
  const strokeWidth = 8;
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: colors.surfaceContainerHigh,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: 'transparent',
          borderTopColor: clampedProgress > 0 ? colors.secondary : 'transparent',
          borderRightColor: clampedProgress > 25 ? colors.secondary : 'transparent',
          borderBottomColor: clampedProgress > 50 ? colors.secondary : 'transparent',
          borderLeftColor: clampedProgress > 75 ? colors.secondary : 'transparent',
          transform: [{ rotate: '-45deg' }],
        }}
      />
      <View style={{ alignItems: 'center' }}>
        <Text style={[styles.ringValue, { color: colors.primary }]}>{kwhLeft}</Text>
        <Text style={[styles.ringLabel, { color: colors.textSecondary }]}>kWh Left</Text>
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
        <View style={[styles.txIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
          <MaterialIcons
            name={isFunding ? 'account-balance-wallet' : 'electric-bolt'}
            size={22}
            color={colors.primary}
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
              { color: isFunding ? colors.secondaryDark : colors.primary },
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
    appliances,
    energyProfile,
  } = useApp();

  useFocusEffect(
    useCallback(() => {
      refreshWallet?.();
      refreshTransactions?.();
    }, [refreshWallet, refreshTransactions])
  );
  const activeMeter = meters.find((m) => m.id === activeMeterId) || (meters.length > 0 ? meters[0] : undefined);
  const firstName = userName.split(' ')[0];
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Dynamic baseline calculation from logged appliance profile
  const applianceDailyKwh = appliances.reduce(
    (sum, a) => sum + (Number(a.estimated_daily_kwh) || 0),
    0
  );
  const defaultDailyKwh = energyProfile?.account_type === 'business' ? 24.0 : 8.5;
  const dailyBaselineKwh = applianceDailyKwh > 0 ? applianceDailyKwh : defaultDailyKwh;

  // Average tariff rate (NGN/kWh)
  const purchaseTxs = transactions.filter((t) => t.type === 'purchase');
  const avgTariffRate =
    purchaseTxs.length > 0 && purchaseTxs[0].units
      ? Math.abs(purchaseTxs[0].amount) / purchaseTxs[0].units
      : 206.8;
  const avgDailyCost = Math.round(dailyBaselineKwh * avgTariffRate);

  // Latest purchase & Remaining units calculation
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
  const progressPercent =
    totalPurchasedUnits > 0
      ? Math.min(100, Math.max(5, Math.round((remainingKwh / totalPurchasedUnits) * 100)))
      : 0;

  const recentTransactions = transactions.slice(0, 3);

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
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={[styles.avatarText, Typography.headlineMd, { color: colors.surface }]}>
                {firstName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={[styles.greeting, Typography.labelCaps, { color: colors.textSecondary }]}>
                Good {getHour()}
              </Text>
              <Text style={[styles.userName, Typography.headlineLgMobile, { color: colors.primary }]}>
                {firstName} ⚡
              </Text>
            </View>
          </View>

          {/* Bell with unread badge */}
          <TouchableOpacity
            style={[styles.notifButton, { backgroundColor: colors.surfaceContainerHighest }]}
            onPress={() => router.push('/notifications')}
          >
            <MaterialIcons name="notifications-none" size={24} color={colors.primary} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
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
                      Est. remaining:{' '}
                      <Text style={{ color: colors.secondaryDark, fontFamily: 'Inter_700Bold' }}>
                        {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}
                      </Text>
                    </>
                  ) : (
                    <>
                      Status:{' '}
                      <Text style={{ color: colors.error, fontFamily: 'Inter_700Bold' }}>
                        Recharge needed
                      </Text>
                    </>
                  )}
                </Text>
                <Text style={[styles.energySubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                  {appliances.length > 0
                    ? `Based on ${dailyBaselineKwh.toFixed(1)} kWh/day appliance profile`
                    : 'Based on estimated daily consumption'}
                </Text>
                <View style={[styles.dailyAvgRow, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
                  <Text style={[styles.dailyAvgLabel, { color: colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
                    Avg. daily usage
                  </Text>
                  <Text style={[styles.dailyAvgValue, { color: colors.primary }]}>
                    ₦{avgDailyCost.toLocaleString()}/day
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
              ₦{transactions.filter((t) => t.type === 'purchase').reduce((acc, t) => acc + Math.abs(t.amount), 0).toLocaleString()}
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

        {/* Alert Card - Show only when there is usage history */}
        {transactions.length > 0 && (
          <View style={[styles.alertCard, { backgroundColor: colors.errorBg, borderColor: 'rgba(186,26,26,0.1)' }]}>
            <MaterialIcons name="warning-amber" size={20} color={colors.onErrorText} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertTitle, Typography.metricUnit, { color: colors.onErrorText }]}>Your usage is higher than usual</Text>
              <Text style={[styles.alertBody, Typography.bodyMd, { color: colors.onErrorText, opacity: 0.8 }]}>
                Consider reducing high-drain appliance use during peak hours.
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

        {/* Usage Chart */}
        <View style={[styles.chartCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <View style={styles.chartHeader}>
            <Text
              style={[styles.chartTitle, Typography.headlineMd, { color: colors.primary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Electricity Spending
            </Text>
            <View style={[styles.chartFilter, { backgroundColor: colors.surfaceContainer }]}>
              {['7D', '30D', '3M'].map((period, i) => (
                <TouchableOpacity
                  key={period}
                  style={[styles.filterBtn, i === 0 ? [styles.filterBtnActive, { backgroundColor: colors.surface }] : null]}
                >
                  <Text
                    style={[
                      styles.filterBtnText,
                      Typography.labelCaps,
                      i === 0 ? { color: colors.primary } : { color: colors.textSecondary },
                    ]}
                  >
                    {period}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.chartBars}>
            {(transactions.length > 0 ? [60, 80, 45, 90, 70, 55, 75] : [0, 0, 0, 0, 0, 0, 0]).map((h, i) => (
              <View key={i} style={styles.chartBarWrapper}>
                <View style={[styles.chartBar, { height: Math.max(4, (h / 100) * 100), backgroundColor: colors.secondary, opacity: h > 0 ? 0.75 : 0.2 }]} />
                <Text style={[styles.chartBarLabel, Typography.labelCaps, { color: colors.outline }]}>
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
                </Text>
              </View>
            ))}
          </View>
        </View>

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
