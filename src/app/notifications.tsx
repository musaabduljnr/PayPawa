import React from 'react';
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
import { useTheme } from '@/context/ThemeContext';
import { useApp, AppNotification } from '@/context/AppContext';

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

function NotifIcon({ type, colors }: { type: AppNotification['type']; colors: any }) {
  const iconMap = {
    purchase: { name: 'electric-bolt' as const, bg: colors.successBg, color: colors.secondaryDark },
    funding: { name: 'account-balance-wallet' as const, bg: colors.successBg, color: colors.secondaryDark },
    alert: { name: 'warning-amber' as const, bg: colors.errorBg, color: colors.onErrorText },
    info: { name: 'info-outline' as const, bg: colors.surfaceContainerHigh, color: colors.primary },
  };
  const cfg = iconMap[type] ?? iconMap.info;
  return (
    <View style={[styles.notifIcon, { backgroundColor: cfg.bg }]}>
      <MaterialIcons name={cfg.name} size={20} color={cfg.color} />
    </View>
  );
}

function NotifItem({
  notif,
  colors,
  onPress,
}: {
  notif: AppNotification;
  colors: any;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.notifItem,
        {
          backgroundColor: notif.read ? colors.surface : colors.surfaceContainerLow,
          borderColor: notif.read ? colors.outlineVariant : colors.secondary + '40',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Unread dot */}
      {!notif.read && <View style={[styles.unreadDot, { backgroundColor: colors.secondary }]} />}

      <NotifIcon type={notif.type} colors={colors} />

      <View style={styles.notifBody}>
        <Text
          style={[
            styles.notifTitle,
            Typography.metricUnit,
            { color: notif.read ? colors.textSecondary : colors.primary },
          ]}
          numberOfLines={1}
        >
          {notif.title}
        </Text>
        <Text
          style={[styles.notifText, Typography.bodyMd, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {notif.body}
        </Text>
        <Text style={[styles.notifTime, Typography.labelCaps, { color: colors.outline }]}>
          {timeAgo(notif.createdAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { colors, isDark } = useTheme();
  const { notifications, markNotificationRead, markAllNotificationsRead, unreadCount } = useApp();

  const todayNotifs = notifications.filter((n) => isToday(n.createdAt));
  const earlierNotifs = notifications.filter((n) => !isToday(n.createdAt));

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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {notifications.length === 0 ? (
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
              You'll be notified about token purchases, wallet activity, and important alerts here.
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
                      onPress={() => markNotificationRead(n.id)}
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
                      onPress={() => markNotificationRead(n.id)}
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
    paddingHorizontal: Spacing.containerMargin,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  topBarCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  topBarTitle: {},
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Rounded.full,
  },
  badgePillText: {
    color: '#ffffff',
    textTransform: 'uppercase',
  },
  markAllBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Rounded.full,
    flexShrink: 0,
  },
  markAllText: { textTransform: 'uppercase' },
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
  notifTitle: { marginBottom: 4 },
  notifText: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  notifTime: { textTransform: 'uppercase' },
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
