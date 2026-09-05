import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';
import { ElectricityService } from '@/services';

export default function VerifyMeterScreen() {
  const { disco, meterNumber, nickname } = useLocalSearchParams<{
    disco: string;
    meterNumber: string;
    nickname: string;
  }>();
  const { addMeter } = useApp();
  const { colors, isDark } = useTheme();
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [customerData, setCustomerData] = useState<{
    name: string;
    address: string;
    tariff?: string;
  }>({
    name: '',
    address: '',
    tariff: '',
  });
  const [errorMessage, setErrorMessage] = useState('');
  const spinValue = new Animated.Value(0);

  const performVerification = async () => {
    setPhase('loading');
    setErrorMessage('');

    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    try {
      const sanitizedMeter = (meterNumber || '').replace(/\s/g, '');
      const result = await ElectricityService.verifyMeter({
        meterNumber: sanitizedMeter,
        discoCode: disco || 'aedc',
        meterType: 'prepaid',
      });

      if (result.success) {
        setCustomerData({
          name: result.customerName || 'Verified Customer',
          address: result.address || 'Address on Record',
          tariff: result.tariffCode || 'R2-SinglePhase',
        });
        setPhase('success');
      } else {
        setErrorMessage(result.errorMessage || 'Unable to verify meter details with provider.');
        setPhase('error');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Verification connection failed. Please check network.');
      setPhase('error');
    }
  };

  useEffect(() => {
    performVerification();
  }, [disco, meterNumber]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleConfirm = () => {
    addMeter(
      disco || 'AEDC (Prepaid)',
      meterNumber || '0419 8273 645',
      nickname || 'Home',
      customerData.address,
      customerData.name,
      customerData.tariff
    );
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: colors.outlineVariant }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.surfaceContainer }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, Typography.headlineMd, { color: colors.text }]}>Meter Verification</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {phase === 'loading' && (
          /* Loading State */
          <View style={styles.loadingContainer}>
            <View style={styles.spinnerWrapper}>
              <ActivityIndicator size="large" color={colors.primary} style={{ position: 'absolute' }} />
              <View style={[styles.spinnerTrack, { borderColor: colors.surfaceContainerHigh }]} />
              <Animated.View
                style={[styles.spinner, { transform: [{ rotate: spin }], borderTopColor: colors.primary }]}
              />
              <MaterialIcons name="electrical-services" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.loadingTitle, Typography.headlineLgMobile, { color: colors.primary }]}>
              Verifying with Provider
            </Text>
            <Text style={[styles.loadingSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
              Connecting to utility gateway to validate meter details...
            </Text>
          </View>
        )}

        {phase === 'error' && (
          /* Error State */
          <View style={styles.errorContainer}>
            {/* Error Icon */}
            <View
              style={[
                styles.errorIconRing,
                { backgroundColor: colors.errorBg, borderColor: 'rgba(248,81,73,0.25)' },
              ]}
            >
              <View style={styles.errorIcon}>
                <MaterialIcons name="error-outline" size={56} color={colors.error} />
              </View>
            </View>

            <Text style={[styles.errorTitle, Typography.headlineLgMobile, { color: colors.error }]}>
              Verification Failed
            </Text>
            <Text style={[styles.errorSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
              We couldn't validate this meter with the utility provider.
            </Text>

            {/* Details Card */}
            <View style={[styles.detailsCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <View style={[styles.detailsCardDecor, styles.errorCardDecor, { backgroundColor: colors.error }]} />
              <View style={styles.detailsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                    Meter Number
                  </Text>
                  <Text style={[styles.detailValue, Typography.headlineMd, { color: colors.primary }]}>
                    {meterNumber || '—'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.failedBadge,
                    { backgroundColor: colors.errorBg, borderColor: 'rgba(248,81,73,0.25)' },
                  ]}
                >
                  <MaterialIcons name="cancel" size={13} color={colors.error} />
                  <Text style={[styles.failedBadgeText, Typography.labelCaps, { color: colors.error }]}>Unverified</Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.surfaceContainerHighest }]} />

              <View style={styles.detailsGrid}>
                <View style={styles.gridItem}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                    Provider (DISCO)
                  </Text>
                  <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.primary }]}>
                    {disco || '—'}
                  </Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                    Type
                  </Text>
                  <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.primary }]}>
                    Prepaid
                  </Text>
                </View>
                <View style={[styles.gridItem, { width: '100%' }]}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                    Provider Response
                  </Text>
                  <View
                    style={[
                      styles.errorNoticeBox,
                      { backgroundColor: colors.surfaceContainerHigh, borderLeftColor: colors.error },
                    ]}
                  >
                    <MaterialIcons name="info-outline" size={16} color={colors.error} />
                    <Text style={[styles.errorNoticeText, Typography.bodyMd, { color: colors.text }]}>
                      {errorMessage || 'Unable to verify meter details with provider.'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Troubleshooting Tips */}
              <View style={[styles.tipBox, { borderTopColor: colors.surfaceContainerHighest }]}>
                <View style={styles.tipHeader}>
                  <MaterialIcons name="lightbulb-outline" size={15} color={colors.textSecondary} />
                  <Text style={[styles.tipTitle, Typography.labelCaps, { color: colors.textSecondary }]}>
                    Suggested Steps
                  </Text>
                </View>
                <Text style={[styles.tipText, Typography.metricUnit, { color: colors.textSecondary }]}>
                  • Confirm the meter number has 11–13 digits without typos.{'\n'}
                  • Verify you have selected the correct DISCO for your area.{'\n'}
                  • Newly installed meters can take 24–48 hours to activate on the provider network.
                </Text>
              </View>
            </View>
          </View>
        )}

        {phase === 'success' && (
          /* Success State */
          <View style={styles.successContainer}>
            {/* Check Icon */}
            <View style={[styles.successIconRing, { backgroundColor: colors.successBg }]}>
              <View style={styles.successIcon}>
                <MaterialIcons name="check-circle" size={56} color={colors.secondaryDark} />
              </View>
            </View>

            <Text style={[styles.successTitle, Typography.headlineLgMobile, { color: colors.primary }]}>
              Meter Verified
            </Text>
            <Text style={[styles.successSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
              Your meter details have been validated by the utility provider.
            </Text>

            {/* Details Card */}
            <View style={[styles.detailsCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <View style={[styles.detailsCardDecor, { backgroundColor: colors.secondary }]} />
              <View style={styles.detailsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                    Customer Name
                  </Text>
                  <Text style={[styles.detailValue, Typography.headlineMd, { color: colors.primary }]}>
                    {customerData.name}
                  </Text>
                </View>
                <View style={styles.activeBadge}>
                  <MaterialCommunityIcons name="lightning-bolt" size={12} color={colors.secondaryDark} />
                  <Text style={[styles.activeBadgeText, Typography.labelCaps, { color: colors.secondaryDark }]}>
                    Active
                  </Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.surfaceContainerHighest }]} />

              <View style={styles.detailsGrid}>
                <View style={styles.gridItem}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                    Meter Number
                  </Text>
                  <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.primary }]}>
                    {meterNumber || '0419 8273 645'}
                  </Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                    Provider
                  </Text>
                  <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.primary }]}>
                    {disco || 'YEDC (Prepaid)'}
                  </Text>
                </View>
                <View style={[styles.gridItem, { width: '100%' }]}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                    Address
                  </Text>
                  <Text style={[styles.detailValue, Typography.bodyMd, { color: colors.textSecondary, fontSize: 13 }]}>
                    {customerData.address}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky CTA */}
      {phase === 'success' && (
        <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.outlineVariant }]}>
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: isDark ? colors.secondary : colors.primary }]}
            onPress={handleConfirm}
            activeOpacity={0.8}
          >
            <MaterialIcons name="home" size={20} color={isDark ? colors.background : colors.white} />
            <Text
              style={[
                styles.confirmBtnText,
                Typography.headlineMd,
                { color: isDark ? colors.background : colors.white },
              ]}
            >
              Go to Dashboard
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'error' && (
        <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.outlineVariant }]}>
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: isDark ? colors.secondary : colors.primary }]}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <MaterialIcons name="edit" size={18} color={isDark ? colors.background : colors.white} />
            <Text
              style={[
                styles.confirmBtnText,
                Typography.headlineMd,
                { color: isDark ? colors.background : colors.white },
              ]}
            >
              Edit Meter Details
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: colors.surfaceContainerHigh }]}
            onPress={performVerification}
            activeOpacity={0.7}
          >
            <MaterialIcons name="refresh" size={18} color={colors.text} />
            <Text style={[styles.secondaryBtnText, Typography.headlineMd, { color: colors.text }]}>
              Retry Verification
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {},
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: Spacing.containerMargin,
    paddingBottom: Spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  spinnerWrapper: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerTrack: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
  },
  spinner: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: 'transparent',
  },
  loadingTitle: {},
  loadingSubtitle: { textAlign: 'center' },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.xl,
  },
  successIconRing: {
    width: 100,
    height: 100,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  successIcon: { alignItems: 'center', justifyContent: 'center' },
  successTitle: {},
  successSubtitle: { textAlign: 'center' },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.xl,
  },
  errorIconRing: {
    width: 100,
    height: 100,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    borderWidth: 1,
  },
  errorIcon: { alignItems: 'center', justifyContent: 'center' },
  errorTitle: { textAlign: 'center' },
  errorSubtitle: { textAlign: 'center', paddingHorizontal: Spacing.sm },
  detailsCard: {
    width: '100%',
    borderRadius: Rounded.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    overflow: 'hidden',
    marginTop: Spacing.md,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  detailsCardDecor: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: Rounded.full,
    opacity: 0.08,
  },
  errorCardDecor: {
    opacity: 0.06,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  detailLabel: { textTransform: 'uppercase', marginBottom: 4 },
  detailValue: {},
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Rounded.full,
  },
  activeBadgeText: { textTransform: 'uppercase' },
  failedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Rounded.full,
    borderWidth: 1,
  },
  failedBadgeText: { textTransform: 'uppercase' },
  divider: { height: 1, marginBottom: Spacing.md },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  gridItem: { width: '45%' },
  errorNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Rounded.default,
    marginTop: 4,
    borderLeftWidth: 3,
  },
  errorNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  tipBox: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    gap: 6,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tipTitle: {
    textTransform: 'uppercase',
  },
  tipText: {
    fontSize: 12,
    lineHeight: 18,
  },
  stickyFooter: {
    padding: Spacing.containerMargin,
    borderTopWidth: 1,
    gap: Spacing.sm,
  },
  confirmBtn: {
    height: 52,
    borderRadius: Rounded.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: {},
  secondaryBtn: {
    height: 48,
    borderRadius: Rounded.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  secondaryBtnText: {},
});
