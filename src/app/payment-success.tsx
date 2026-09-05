import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { CustomAlert } from '@/context/AlertContext';

export default function PaymentSuccessScreen() {
  const { colors, isDark } = useTheme();
  const { amount, token, units, reference, meterNumber, disco } =
    useLocalSearchParams<{
      amount: string;
      token: string;
      units: string;
      reference: string;
      meterNumber: string;
      disco: string;
    }>();

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleCopy = () => {
    Clipboard.setString(token || '');
    CustomAlert.alert(
      'Token Copied!',
      'Electricity token copied to clipboard.',
      [{ text: 'Great', style: 'default' }],
      { type: 'success' }
    );
  };

  const formattedToken = (token || '0000 0000 0000 0000 00')
    .replace(/\s/g, '')
    .match(/.{1,4}/g)
    ?.join(' ') || token;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Celebration Header */}
        <View style={[styles.celebrationHeader, { backgroundColor: isDark ? colors.surface : colors.primary }]}>
          <View style={styles.decorRing1} />
          <View style={styles.decorRing2} />
          <View style={styles.decorRing3} />

          <Animated.View style={[styles.checkIconWrap, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.checkIconOuter}>
              <View
                style={[
                  styles.checkIconInner,
                  { backgroundColor: isDark ? colors.secondary : colors.secondaryDark },
                ]}
              >
                <MaterialIcons name="check" size={44} color={isDark ? colors.background : colors.white} />
              </View>
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: fadeAnim, alignItems: 'center', gap: Spacing.xs }}>
            <Text style={[styles.successTitle, Typography.headlineLg, { color: colors.white }]}>Payment Successful!</Text>
            <Text style={[styles.successSubtitle, Typography.bodyMd, { color: 'rgba(255,255,255,0.7)' }]}>
              Your token has been generated
            </Text>
          </Animated.View>
        </View>

        {/* Token Card */}
        <Animated.View
          style={[
            styles.tokenCard,
            { backgroundColor: colors.surface, borderColor: colors.outlineVariant, opacity: fadeAnim },
          ]}
        >
          <View
            style={[
              styles.tokenCardDecor,
              { backgroundColor: isDark ? colors.secondary : colors.secondaryDark },
            ]}
          />
          <View style={styles.tokenCardContent}>
            <View style={styles.tokenTop}>
              <View style={styles.tokenLabelRow}>
                <MaterialCommunityIcons
                  name="lightning-bolt"
                  size={18}
                  color={isDark ? colors.secondary : colors.secondaryDark}
                />
                <Text style={[styles.tokenLabel, Typography.labelCaps, { color: colors.textSecondary }]}>Your Token Number</Text>
              </View>
              <TouchableOpacity
                style={[styles.copyBtn, { borderColor: isDark ? colors.secondary : colors.primary }]}
                onPress={handleCopy}
              >
                <MaterialIcons name="content-copy" size={18} color={isDark ? colors.secondary : colors.primary} />
                <Text
                  style={[
                    styles.copyBtnText,
                    Typography.labelCaps,
                    { color: isDark ? colors.secondary : colors.primary },
                  ]}
                >
                  Copy
                </Text>
              </TouchableOpacity>
            </View>
            <Text
              style={[
                styles.tokenValue,
                Typography.displayMetrics,
                { color: isDark ? colors.secondary : colors.primary },
              ]}
            >
              {formattedToken}
            </Text>
            <Text style={[styles.tokenHint, Typography.bodyMd, { color: colors.textSecondary }]}>
              Enter this token on your meter keypad to activate {units} kWh
            </Text>
          </View>
        </Animated.View>

        {/* Receipt Details */}
        <Animated.View
          style={[
            styles.receiptCard,
            { backgroundColor: colors.surface, borderColor: colors.outlineVariant, opacity: fadeAnim },
          ]}
        >
          <Text
            style={[
              styles.receiptTitle,
              Typography.headlineMd,
              { color: isDark ? colors.secondary : colors.primary },
            ]}
          >
            Payment Receipt
          </Text>
          <View style={styles.receiptRows}>
            {[
              { label: 'Reference', value: reference || 'TX-' + Date.now() },
              { label: 'Amount', value: `₦${Number(amount || 0).toLocaleString()}.00` },
              { label: 'Units', value: `${units || '0'} kWh` },
              { label: 'Provider', value: disco || 'YEDC' },
              { label: 'Meter', value: meterNumber ? `••••${meterNumber.slice(-4)}` : '••••' },
              { label: 'Status', value: 'Completed' },
              {
                label: 'Date',
                value: new Date().toLocaleString('en-NG', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              },
            ].map((row, i) => (
              <View
                key={i}
                style={[styles.receiptRow, { borderBottomColor: colors.surfaceContainerHighest }]}
              >
                <Text style={[styles.receiptRowLabel, Typography.bodyMd, { color: colors.textSecondary }]}>{row.label}</Text>
                <Text
                  style={[
                    styles.receiptRowValue,
                    Typography.metricUnit,
                    { color: colors.text },
                    row.label === 'Status' ? { color: isDark ? colors.secondary : colors.secondaryDark } : null,
                  ]}
                >
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Actions */}
        <Animated.View style={[styles.actionsRow, { opacity: fadeAnim }]}>
          <TouchableOpacity style={[styles.shareBtn, { borderColor: isDark ? colors.secondary : colors.primary }]}>
            <MaterialIcons name="share" size={22} color={isDark ? colors.secondary : colors.primary} />
            <Text
              style={[
                styles.shareBtnText,
                Typography.metricUnit,
                { color: isDark ? colors.secondary : colors.primary },
              ]}
            >
              Share Token
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.downloadBtn, { borderColor: isDark ? colors.secondary : colors.primary }]}
          >
            <MaterialIcons name="download" size={22} color={isDark ? colors.secondary : colors.primary} />
            <Text
              style={[
                styles.downloadBtnText,
                Typography.metricUnit,
                { color: isDark ? colors.secondary : colors.primary },
              ]}
            >
              Save Receipt
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* Sticky Footer */}
      <View
        style={[
          styles.stickyFooter,
          { backgroundColor: colors.background, borderTopColor: colors.outlineVariant },
        ]}
      >
        <TouchableOpacity
          style={[styles.homeBtn, { backgroundColor: isDark ? colors.secondary : colors.primary }]}
          onPress={() => router.replace('/(tabs)/home')}
        >
          <MaterialIcons name="home" size={20} color={isDark ? colors.background : colors.white} />
          <Text
            style={[
              styles.homeBtnText,
              Typography.headlineMd,
              { color: isDark ? colors.background : colors.white },
            ]}
          >
            Back to Dashboard
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.buyAgainBtn}
          onPress={() => router.replace('/buy-electricity')}
        >
          <Text style={[styles.buyAgainBtnText, Typography.metricUnit, { color: colors.textSecondary }]}>Buy Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 140 },
  celebrationHeader: {
    alignItems: 'center',
    paddingTop: Spacing.xl * 2,
    paddingBottom: Spacing.xl * 2,
    gap: Spacing.lg,
    overflow: 'hidden',
  },
  decorRing1: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 40,
    borderColor: 'rgba(255,255,255,0.04)',
    top: -80,
    right: -60,
  },
  decorRing2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 30,
    borderColor: 'rgba(172,248,71,0.08)',
    bottom: -40,
    left: -40,
  },
  decorRing3: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 20,
    borderColor: 'rgba(255,255,255,0.05)',
    top: 20,
    left: 20,
  },
  checkIconWrap: { alignItems: 'center', justifyContent: 'center' },
  checkIconOuter: {
    width: 100,
    height: 100,
    borderRadius: Rounded.full,
    backgroundColor: 'rgba(172,248,71,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIconInner: {
    width: 76,
    height: 76,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {},
  successSubtitle: {},
  tokenCard: {
    marginHorizontal: Spacing.containerMargin,
    marginTop: -Spacing.lg,
    borderRadius: Rounded.xl,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
    marginBottom: Spacing.lg,
  },
  tokenCardDecor: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  tokenCardContent: { padding: Spacing.lg, paddingTop: Spacing.xl },
  tokenTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  tokenLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  tokenLabel: { textTransform: 'uppercase' },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Rounded.full,
  },
  copyBtnText: { textTransform: 'uppercase' },
  tokenValue: {
    fontSize: 28,
    letterSpacing: 4,
    textAlign: 'center',
    marginVertical: Spacing.md,
  },
  tokenHint: {
    textAlign: 'center',
    fontSize: 14,
  },
  receiptCard: {
    marginHorizontal: Spacing.containerMargin,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  receiptTitle: { marginBottom: Spacing.md },
  receiptRows: { gap: 4 },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  receiptRowLabel: {},
  receiptRowValue: {},
  statusGreen: {},
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginHorizontal: Spacing.containerMargin,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: Rounded.full,
    paddingVertical: Spacing.sm,
  },
  shareBtnText: {},
  downloadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: Rounded.full,
    paddingVertical: Spacing.sm,
  },
  downloadBtnText: {},
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.containerMargin,
    paddingBottom: Spacing.xl,
    borderTopWidth: 1,
    gap: Spacing.sm,
  },
  homeBtn: {
    height: 52,
    borderRadius: Rounded.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  homeBtnText: {},
  buyAgainBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyAgainBtnText: {},
});
