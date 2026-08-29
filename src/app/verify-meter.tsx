import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { ElectricityService } from '@/services';

export default function VerifyMeterScreen() {
  const { disco, meterNumber, nickname } = useLocalSearchParams<{
    disco: string;
    meterNumber: string;
    nickname: string;
  }>();
  const { addMeter } = useApp();
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [customerData, setCustomerData] = useState<{
    name: string;
    address: string;
    tariff?: string;
  }>({
    name: 'Musa Ibrahim',
    address: 'Plot 12, Wuse Zone 5, Abuja',
    tariff: 'R2-SinglePhase',
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
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, Typography.headlineMd]}>Meter Verification</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {phase === 'loading' && (
          /* Loading State */
          <View style={styles.loadingContainer}>
            <View style={styles.spinnerWrapper}>
              <View style={styles.spinnerTrack} />
              <Animated.View
                style={[styles.spinner, { transform: [{ rotate: spin }] }]}
              />
              <MaterialIcons name="electrical-services" size={36} color={Colors.primary} />
            </View>
            <Text style={[styles.loadingTitle, Typography.headlineLgMobile]}>Verifying with Provider</Text>
            <Text style={[styles.loadingSubtitle, Typography.bodyMd]}>
              Connecting to VTpass / DISCO gateway to validate meter details...
            </Text>
          </View>
        )}

        {phase === 'error' && (
          /* Error State */
          <View style={styles.loadingContainer}>
            <View style={[styles.successIconRing, { backgroundColor: Colors.errorBg }]}>
              <MaterialIcons name="error-outline" size={52} color={Colors.error} />
            </View>
            <Text style={[styles.loadingTitle, Typography.headlineLgMobile, { color: Colors.error }]}>
              Verification Failed
            </Text>
            <Text style={[styles.loadingSubtitle, Typography.bodyMd]}>
              {errorMessage}
            </Text>
            <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg }}>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: Colors.surfaceContainerHigh, flex: 1 }]}
                onPress={() => router.back()}
              >
                <Text style={[styles.confirmBtnText, Typography.headlineMd, { color: Colors.text }]}>Edit Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1 }]}
                onPress={performVerification}
              >
                <MaterialIcons name="refresh" size={20} color={Colors.white} />
                <Text style={[styles.confirmBtnText, Typography.headlineMd]}>Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {phase === 'success' && (
          /* Success State */
          <View style={styles.successContainer}>
            {/* Check Icon */}
            <View style={styles.successIconRing}>
              <View style={styles.successIcon}>
                <MaterialIcons name="check-circle" size={56} color={Colors.secondaryDark} />
              </View>
            </View>

            <Text style={[styles.successTitle, Typography.headlineLgMobile]}>Meter Verified</Text>
            <Text style={[styles.successSubtitle, Typography.bodyMd]}>
              Your meter details have been validated by the utility provider.
            </Text>

            {/* Details Card */}
            <View style={styles.detailsCard}>
              <View style={styles.detailsCardDecor} />
              <View style={styles.detailsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, Typography.labelCaps]}>Customer Name</Text>
                  <Text style={[styles.detailValue, Typography.headlineMd]}>
                    {customerData.name}
                  </Text>
                </View>
                <View style={styles.activeBadge}>
                  <MaterialCommunityIcons name="lightning-bolt" size={12} color={Colors.secondaryDark} />
                  <Text style={[styles.activeBadgeText, Typography.labelCaps]}>Active</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.detailsGrid}>
                <View style={styles.gridItem}>
                  <Text style={[styles.detailLabel, Typography.labelCaps]}>Meter Number</Text>
                  <Text style={[styles.detailValue, Typography.metricUnit]}>
                    {meterNumber || '0419 8273 645'}
                  </Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={[styles.detailLabel, Typography.labelCaps]}>Provider</Text>
                  <Text style={[styles.detailValue, Typography.metricUnit]}>
                    {disco || 'YEDC (Prepaid)'}
                  </Text>
                </View>
                <View style={[styles.gridItem, { width: '100%' }]}>
                  <Text style={[styles.detailLabel, Typography.labelCaps]}>Address</Text>
                  <Text style={[styles.detailValue, Typography.bodyMd, { color: Colors.textSecondary, fontSize: 13 }]}>
                    {customerData.address}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Sticky CTA */}
      {phase === 'success' && (
        <View style={styles.stickyFooter}>
          <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
            <MaterialIcons name="home" size={20} color={Colors.white} />
            <Text style={[styles.confirmBtnText, Typography.headlineMd]}>Go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.containerMargin,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: { color: Colors.text },
  content: { flex: 1, padding: Spacing.containerMargin },
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
    borderColor: Colors.surfaceContainerHigh,
  },
  spinner: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: 'transparent',
    borderTopColor: Colors.primary,
  },
  loadingTitle: { color: Colors.primary },
  loadingSubtitle: { color: Colors.textSecondary, textAlign: 'center' },
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
    backgroundColor: Colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  successIcon: { alignItems: 'center', justifyContent: 'center' },
  successTitle: { color: Colors.primary },
  successSubtitle: { color: Colors.textSecondary, textAlign: 'center' },
  detailsCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    padding: Spacing.lg,
    overflow: 'hidden',
    marginTop: Spacing.md,
    shadowColor: Colors.primary,
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
    backgroundColor: Colors.secondary,
    opacity: 0.08,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  detailLabel: { color: Colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 },
  detailValue: { color: Colors.primary },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(132,204,22,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Rounded.full,
  },
  activeBadgeText: { color: Colors.secondaryDark, textTransform: 'uppercase' },
  divider: { height: 1, backgroundColor: Colors.surfaceContainerHighest, marginBottom: Spacing.md },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  gridItem: { width: '45%' },
  stickyFooter: {
    padding: Spacing.containerMargin,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    backgroundColor: Colors.background,
  },
  confirmBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Rounded.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: { color: Colors.white },
});
