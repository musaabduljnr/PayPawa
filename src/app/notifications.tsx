import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp, AppNotification } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function isToday(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function NotifIcon({ type, severity, colors }: { type: string; severity?: string; colors: any }) {
  if (severity === 'critical') {
    return (
      <View style={[styles.notifIcon, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
        <MaterialIcons name="error-outline" size={20} color={colors.error || '#ef4444'} />
      </View>
    );
  }

  const iconMap: Record<string, { name: any; bg: string; color: string }> = {
    purchase: { name: 'electric-bolt', bg: colors.successBg, color: colors.secondaryDark },
    purchase_success: { name: 'electric-bolt', bg: colors.successBg, color: colors.secondaryDark },
    purchase_failed: { name: 'error-outline', bg: colors.errorBg, color: colors.error },
    funding: { name: 'account-balance-wallet', bg: colors.successBg, color: colors.secondaryDark },
    wallet_funded: { name: 'account-balance-wallet', bg: colors.successBg, color: colors.secondaryDark },
    low_balance: { name: 'warning-amber', bg: 'rgba(234, 179, 8, 0.15)', color: '#eab308' },
    unusual_usage: { name: 'trending-up', bg: 'rgba(234, 179, 8, 0.15)', color: '#eab308' },
    estimated_recharge_due: { name: 'schedule', bg: colors.surfaceContainerHigh, color: colors.primary },
    ai_energy_insight: { name: 'auto-awesome', bg: 'rgba(132,204,22,0.15)', color: colors.secondaryDark },
    alert: { name: 'warning-amber', bg: colors.errorBg, color: colors.onErrorText },
    info: { name: 'info-outline', bg: colors.surfaceContainerHigh, color: colors.primary },
  };

  const cfg = iconMap[type] ?? iconMap.info;
  return (
    <View style={[styles.notifIcon, { backgroundColor: cfg.bg }]}>
      <MaterialIcons name={cfg.name} size={20} color={cfg.color} />
    </View>
  );
}

function SeverityBadge({ severity }: { severity?: string }) {
  if (!severity || severity === 'info') return null;

  const config = {
    critical: { text: 'CRITICAL', bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
    warning: { text: 'WARNING', bg: 'rgba(234, 179, 8, 0.15)', color: '#d97706' },
    success: { text: 'SUCCESS', bg: 'rgba(132, 204, 22, 0.15)', color: '#65a30d' },
  }[severity];

  if (!config) return null;

  return (
    <View style={[styles.severityBadge, { backgroundColor: config.bg }]}>
      <Text style={[styles.severityBadgeText, { color: config.color }]}>{config.text}</Text>
    </View>
  );
}

function NotifItem({
  notif,
  colors,
  isExpanded,
  onPress,
}: {
  notif: AppNotification;
  colors: any;
  isExpanded: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.notifItem,
        {
          backgroundColor: isExpanded
            ? (colors.surfaceContainerHigh || colors.surface)
            : notif.read
            ? colors.surface
            : colors.surfaceContainerLow,
          borderColor: isExpanded
            ? colors.primary
            : notif.severity === 'critical'
            ? 'rgba(239, 68, 68, 0.4)'
            : notif.read
            ? colors.outlineVariant
            : colors.secondary + '40',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Unread dot */}
      {!notif.read && <View style={[styles.unreadDot, { backgroundColor: colors.secondary }]} />}

      <NotifIcon type={notif.type} severity={notif.severity} colors={colors} />

      <View style={styles.notifBody}>
        <View style={styles.notifHeaderRow}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text
              style={[
                styles.notifTitle,
                Typography.metricUnit,
                { color: notif.read && !isExpanded ? colors.textSecondary : colors.primary },
              ]}
              numberOfLines={isExpanded ? undefined : 1}
            >
              {notif.title}
            </Text>
            <SeverityBadge severity={notif.severity} />
          </View>
          <MaterialIcons
            name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={20}
            color={colors.outline}
            style={{ marginLeft: 4 }}
          />
        </View>

        {notif.meterName && (
          <View style={styles.meterTagRow}>
            <MaterialIcons name="speed" size={12} color={colors.outline} />
            <Text style={[styles.meterTagText, Typography.labelCaps, { color: colors.outline }]}>
              {notif.meterName}
            </Text>
          </View>
        )}

        <Text
          style={[styles.notifText, Typography.bodyMd, { color: colors.textSecondary }]}
          numberOfLines={isExpanded ? undefined : 2}
        >
          {notif.body}
        </Text>

        <View style={styles.footerRow}>
          <Text style={[styles.notifTime, Typography.labelCaps, { color: colors.outline }]}>
            {timeAgo(notif.createdAt)}
          </Text>

          {isExpanded && notif.actionLabel && notif.actionUrl && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                if (notif.actionUrl) {
                  router.push(notif.actionUrl as any);
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.actionBtnText, Typography.labelCaps, { color: colors.surface }]}>
                {notif.actionLabel}
              </Text>
              <MaterialIcons name="arrow-forward" size={12} color={colors.surface} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    unreadCount,
    activeMeter,
  } = useApp();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterScope, setFilterScope] = useState<'active' | 'all'>('active');

  const toggleExpand = (id: string) => {
    markNotificationRead(id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Filter scoped notifications
  const displayedNotifs = notifications.filter((n) => {
    if (filterScope === 'all') return true;
    if (!activeMeter) return true;
    // Active meter scope: Include meter-specific matching notifications OR account-wide notifications
    return n.meterId === null || n.meterId === undefined || n.meterId === activeMeter.id;
  });

  const todayNotifs = displayedNotifs.filter((n) => isToday(n.createdAt));
  const earlierNotifs = displayedNotifs.filter((n) => !isToday(n.createdAt));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: colors.outlineVariant }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.surfaceContainer }]}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.topBarCenter}>
          <Text style={[styles.topBarTitle, Typography.headlineMd, { color: colors.text }]}>
            Notifications
          </Text>
          {unreadCount > 0 && (
            <View style={[styles.badgePill, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.badgePillText, Typography.labelCaps]}>
                {unreadCount} new
              </Text>
            </View>
          )}
        </View>

        {unreadCount > 0 ? (
          <TouchableOpacity
            style={[styles.markAllBtn, { backgroundColor: colors.surfaceContainerHigh }]}
            onPress={markAllNotificationsRead}
          >
            <Text style={[styles.markAllText, Typography.labelCaps, { color: colors.primary }]}>
              Mark all
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 72 }} />
        )}
      </View>

      {/* Meter Scoping Filter Pills */}
      {activeMeter && (
        <View style={[styles.filterBar, { borderBottomColor: colors.outlineVariant }]}>
          <TouchableOpacity
            style={[
              styles.filterPill,
              filterScope === 'active'
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surfaceContainerHigh },
            ]}
            onPress={() => setFilterScope('active')}
          >
            <Text
              style={[
                styles.filterPillText,
                Typography.labelCaps,
                { color: filterScope === 'active' ? colors.surface : colors.textSecondary },
              ]}
            >
              {activeMeter.name || `••••${activeMeter.number.slice(-4)}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              filterScope === 'all'
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surfaceContainerHigh },
            ]}
            onPress={() => setFilterScope('all')}
          >
            <Text
              style={[
                styles.filterPillText,
                Typography.labelCaps,
                { color: filterScope === 'all' ? colors.surface : colors.textSecondary },
              ]}
            >
              All Alerts
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {displayedNotifs.length === 0 ? (
          /* Empty state */
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.surfaceContainerHigh }]}>
              <MaterialCommunityIcons
                name="bell-outline"
                size={48}
                color={colors.outlineVariant}
              />
            </View>
            <Text style={[styles.emptyTitle, Typography.headlineMd, { color: colors.primary }]}>
              All caught up!
            </Text>
            <Text style={[styles.emptyBody, Typography.bodyMd, { color: colors.textSecondary }]}>
              {filterScope === 'active' && activeMeter
                ? `No active alerts recorded for ${activeMeter.name}.`
                : "You'll be notified about token purchases, balance status, and smart alerts here."}
            </Text>
          </View>
        ) : (
          <>
            {todayNotifs.length > 0 && (
              <>
                <Text style={[styles.groupLabel, Typography.labelCaps, { color: colors.outline }]}>
                  Today
                </Text>
                <View style={styles.group}>
                  {todayNotifs.map((n) => (
                    <NotifItem
                      key={n.id}
                      notif={n}
                      colors={colors}
                      isExpanded={expandedIds.has(n.id)}
                      onPress={() => toggleExpand(n.id)}
                    />
                  ))}
                </View>
              </>
            )}

            {earlierNotifs.length > 0 && (
              <>
                <Text style={[styles.groupLabel, Typography.labelCaps, { color: colors.outline }]}>
                  Earlier
                </Text>
                <View style={styles.group}>
                  {earlierNotifs.map((n) => (
                    <NotifItem
                      key={n.id}
                      notif={n}
                      colors={colors}
                      isExpanded={expandedIds.has(n.id)}
                      onPress={() => toggleExpand(n.id)}
                    />
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.containerMargin,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  topBarTitle: {},
  badgePill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Rounded.full,
  },
  badgePillText: {
    color: '#0d2818',
  },
  markAllBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Rounded.full,
    flexShrink: 0,
  },
  markAllText: { textTransform: 'uppercase' },
  filterBar: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.containerMargin,
    paddingVertical: Spacing.xs + 4,
    borderBottomWidth: 1,
  },
  filterPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Rounded.full,
  },
  filterPillText: {},
  scrollContent: {
    padding: Spacing.containerMargin,
    paddingBottom: 100,
  },
  groupLabel: {
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  group: { gap: Spacing.sm, marginBottom: Spacing.lg },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    left: 10,
    width: 7,
    height: 7,
    borderRadius: Rounded.full,
  },
  notifIcon: {
    width: 42,
    height: 42,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 8,
  },
  notifBody: { flex: 1 },
  notifHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notifTitle: { marginBottom: 0 },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Rounded.sm,
  },
  severityBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  meterTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  meterTagText: {
    fontSize: 10,
  },
  notifText: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  notifTime: { textTransform: 'uppercase' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 5,
    borderRadius: Rounded.full,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: Spacing.xl * 2,
    gap: Spacing.sm,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { textAlign: 'center', maxWidth: 280, lineHeight: 22 },
});
