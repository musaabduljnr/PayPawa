import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useApp, Transaction } from '@/context/AppContext';

function TransactionItem({ tx, colors }: { tx: Transaction; colors: any }) {
  const [expanded, setExpanded] = useState(false);
  const isFunding = tx.type === 'funding';

  return (
    <TouchableOpacity
      style={[styles.txItem, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
    >
      {/* Summary Row */}
      <View style={styles.txSummaryRow}>
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
          <Text style={[styles.txTitle, Typography.metricUnit, { color: colors.primary }]}>{tx.title}</Text>
          <Text style={[styles.txDate, Typography.bodyMd, { color: colors.textSecondary }]}>{tx.date}</Text>
          {tx.meterNumber && (
            <Text style={[styles.txMeter, Typography.labelCaps, { color: colors.outline }]}>
              Meter ••••{tx.meterNumber.slice(-4)}
            </Text>
          )}
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
                    : colors.text,
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
          <View
            style={[
              styles.statusTag,
              {
                backgroundColor:
                  tx.status === 'Completed'
                    ? colors.successBg
                    : tx.status === 'Pending'
                    ? '#FFF3CD'
                    : colors.errorBg,
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
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
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={18}
          color={colors.outline}
          style={{ marginLeft: 4 }}
        />
      </View>

      {/* Expanded Detail Panel */}
      {expanded && (
        <View style={[styles.detailPanel, { borderTopColor: colors.outlineVariant }]}>
          <View style={styles.detailGrid}>
            {tx.reference && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>Reference</Text>
                <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.text }]}>{tx.reference}</Text>
              </View>
            )}
            {tx.meterNumber && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>Meter</Text>
                <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.text }]}>
                  ••••{tx.meterNumber.replace(/\s/g, '').slice(-4)}
                </Text>
              </View>
            )}
            {tx.units && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>Units</Text>
                <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.text }]}>{tx.units} kWh</Text>
              </View>
            )}
            {tx.units && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>Rate</Text>
                <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.text }]}>
                  ₦{(tx.amount / tx.units).toFixed(2)}/kWh
                </Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>Amount</Text>
              <Text style={[styles.detailValue, Typography.metricUnit, { color: isFunding ? colors.secondaryDark : colors.text }]}>
                {isFunding ? '+' : '-'}₦{tx.amount.toLocaleString()}
              </Text>
            </View>
            {(tx.description || tx.errorMessage || tx.status === 'Failed') && (
              <View style={[styles.detailRow, { alignItems: 'flex-start', paddingTop: 4 }]}>
                <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.error }]}>Detail</Text>
                <Text style={[styles.detailValue, Typography.bodyMd, { color: colors.error, flex: 1, textAlign: 'right' }]}>
                  {tx.errorMessage || tx.description || 'Transaction could not be completed by provider.'}
                </Text>
              </View>
            )}
          </View>

          {tx.token && (
            <View style={[styles.tokenBox, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
              <View style={styles.tokenBoxHeader}>
                <MaterialIcons name="vpn-key" size={14} color={colors.secondaryDark} />
                <Text style={[styles.tokenBoxLabel, Typography.labelCaps, { color: colors.secondaryDark }]}>
                  Electricity Token
                </Text>
              </View>
              <Text style={[styles.tokenValue, { color: colors.primary }]}>{tx.token}</Text>
              <Text style={[styles.tokenHint, Typography.labelCaps, { color: colors.outline }]}>
                Enter this code on your meter keypad
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ActivityScreen() {
  const { colors } = useTheme();
  const { transactions, refreshTransactions, refreshWallet } = useApp();
  const [filter, setFilter] = useState<'all' | 'purchase' | 'funding'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshTransactions?.(), refreshWallet?.()]);
    setRefreshing(false);
  }, [refreshTransactions, refreshWallet]);

  useFocusEffect(
    useCallback(() => {
      refreshTransactions?.();
      refreshWallet?.();
    }, [refreshTransactions, refreshWallet])
  );

  const filtered =
    filter === 'all' ? transactions : transactions.filter((t) => t.type === filter);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.pageTitle, Typography.headlineLgMobile, { color: colors.primary }]}>Activity</Text>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterRow}>
          {(['all', 'purchase', 'funding'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterTab,
                { backgroundColor: filter === f ? colors.primary : colors.surfaceContainerHigh },
              ]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  Typography.labelCaps,
                  { color: filter === f ? colors.white : colors.textSecondary },
                ]}
              >
                {f === 'all' ? 'All' : f === 'purchase' ? 'Token Purchases' : 'Wallet Funding'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Transactions List */}
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="receipt-long" size={48} color={colors.outlineVariant} />
            <Text style={[styles.emptyTitle, Typography.headlineMd, { color: colors.text }]}>No transactions yet</Text>
            <Text style={[styles.emptyBody, Typography.bodyMd, { color: colors.textSecondary }]}>
              Your electricity purchases and history will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.txList}>
            {filtered.map((tx) => (
              <TransactionItem key={tx.id} tx={tx} colors={colors} />
            ))}
          </View>
        )}
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.containerMargin,
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Rounded.full,
  },
  filterTabText: { textTransform: 'capitalize' },
  txList: {
    paddingHorizontal: Spacing.containerMargin,
    gap: Spacing.sm,
  },
  txItem: {
    borderRadius: Rounded.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  txSummaryRow: {
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
  txMeter: { textTransform: 'uppercase', marginTop: 2 },
  txRight: { alignItems: 'flex-end', gap: 4 },
  txAmount: { fontWeight: '600' },
  txUnitsTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Rounded.sm,
  },
  txUnitsText: { textTransform: 'uppercase' },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Rounded.full,
  },
  statusText: { textTransform: 'uppercase' },

  // Expanded detail
  detailPanel: {
    borderTopWidth: 1,
    padding: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  detailGrid: { gap: 10 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: { textTransform: 'uppercase' },
  detailValue: {},
  tokenBox: {
    borderRadius: Rounded.default,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 6,
  },
  tokenBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tokenBoxLabel: { textTransform: 'uppercase' },
  tokenValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    letterSpacing: 2,
    lineHeight: 26,
  },
  tokenHint: { textTransform: 'uppercase' },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.sm,
  },
  emptyTitle: {},
  emptyBody: { textAlign: 'center' },
});
