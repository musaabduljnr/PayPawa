import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';
import { CustomAlert } from '@/context/AlertContext';

const PRESET_AMOUNTS = [5000, 10000, 20000, 50000];

type Screen = 'amount' | 'review' | 'processing';

export default function BuyElectricity() {
  const { walletBalance, meters, activeMeterId, buyElectricity } = useApp();
  const { colors, isDark } = useTheme();
  const [screen, setScreen] = useState<Screen>('amount');
  const [amountStr, setAmountStr] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeMeter = meters.find((m) => m.id === activeMeterId);
  const amount = Number(amountStr.replace(/,/g, '')) || 0;

  const handleContinue = () => {
    if (!amountStr || amount < 500) return;
    setScreen('review');
  };

  const handlePay = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setScreen('processing');
    try {
      const result = await buyElectricity(amount);
      if (result.success && result.token) {
        router.replace({
          pathname: '/payment-success',
          params: {
            amount: amount.toString(),
            token: result.token,
            units: result.transaction?.units?.toString() || (amount / 206.8).toFixed(1),
            reference: result.transaction?.reference,
            meterNumber: activeMeter?.number || '',
            disco: activeMeter?.disco || '',
          },
        });
      } else {
        CustomAlert.alert(
          'Payment Failed',
          result.errorMessage || 'Unable to complete electricity token vending.',
          [{ text: 'Dismiss', style: 'default' }],
          { type: 'error' }
        );
        setScreen('review');
      }
    } catch (err: any) {
      CustomAlert.alert(
        'Payment Error',
        err?.message || 'A network error occurred while contacting provider.',
        [{ text: 'Dismiss', style: 'default' }],
        { type: 'error' }
      );
      setScreen('review');
    } finally {
      setIsSubmitting(false);
    }
  };

  const rate = 235.3;
  const estimatedUnits = amount ? (amount / rate).toFixed(1) : '0.0';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Amount Screen */}
      {screen === 'amount' && (
        <View style={{ flex: 1 }}>
          <View style={[styles.topBar, { borderBottomColor: colors.outlineVariant }]}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: colors.surfaceContainer }]}
              onPress={() => router.back()}
            >
              <MaterialIcons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.topBarTitle, Typography.headlineMd, { color: colors.text }]}>Buy Electricity</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
            {/* Meter Card */}
            <TouchableOpacity
              style={[styles.meterCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
              onPress={() => router.push('/add-meter')}
            >
              <View
                style={[
                  styles.meterCardIcon,
                  { backgroundColor: isDark ? 'rgba(163,230,53,0.15)' : 'rgba(132,204,22,0.15)' },
                ]}
              >
                <MaterialCommunityIcons
                  name="lightning-bolt"
                  size={22}
                  color={isDark ? colors.secondary : colors.secondaryDark}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[Typography.metricUnit, { color: colors.text, fontWeight: '500' }]}>
                  {activeMeter?.name || 'No Meter Selected'}
                </Text>
                <Text style={[Typography.bodyMd, { color: colors.textSecondary, fontSize: 13 }]}>
                  {activeMeter?.disco || 'Tap to select a meter'} ••••{activeMeter?.number.slice(-4) || '----'}
                </Text>
              </View>
              <MaterialIcons name="expand-more" size={22} color={colors.outline} />
            </TouchableOpacity>

            {/* Amount Input */}
            <View style={styles.amountSection}>
              <Text style={[styles.amountLabel, Typography.labelCaps, { color: colors.textSecondary }]}>Enter Amount</Text>
              <View style={styles.amountDisplay}>
                <Text style={[styles.currencySymbol, Typography.displayMetrics, { color: colors.textSecondary }]}>₦</Text>
                <TextInput
                  style={[styles.amountValueInput, Typography.displayMetrics, { color: colors.text }]}
                  keyboardType="number-pad"
                  value={amountStr}
                  onChangeText={(text) => {
                    const clean = text.replace(/[^0-9]/g, '');
                    if (clean.length > 7) return;
                    const num = Number(clean);
                    setAmountStr(clean ? num.toLocaleString() : '');
                  }}
                  placeholder="0"
                  placeholderTextColor={colors.outline}
                  maxLength={10}
                />
              </View>
              <View style={[styles.amountUnderline, { backgroundColor: colors.surfaceContainerHigh }]} />
              {amount > 0 && amount < 500 && (
                <Text style={[styles.unitsEstimate, Typography.metricUnit, { color: colors.error }]}>
                  Minimum purchase is ₦500.00
                </Text>
              )}
              {amount >= 500 && (
                <Text style={[styles.unitsEstimate, Typography.metricUnit, { color: colors.textSecondary }]}>
                  ≈ {estimatedUnits} kWh
                </Text>
              )}
            </View>

            {/* Preset Amounts */}
            <View style={styles.presetGrid}>
              {PRESET_AMOUNTS.map((preset) => {
                const isActive = amount === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[
                      styles.presetBtn,
                      { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
                      isActive && {
                        backgroundColor: isDark ? colors.secondary : colors.primary,
                        borderColor: isDark ? colors.secondary : colors.primary,
                      },
                    ]}
                    onPress={() => setAmountStr(preset.toLocaleString())}
                  >
                    <Text
                      style={[
                        styles.presetBtnText,
                        Typography.metricUnit,
                        { color: isActive ? (isDark ? colors.background : colors.white) : colors.text },
                      ]}
                    >
                      ₦{preset.toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* CTA */}
          <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.outlineVariant }]}>
            <TouchableOpacity
              style={[
                styles.ctaBtn,
                { backgroundColor: isDark ? colors.secondary : colors.primary },
                (!amountStr || amount < 500) ? styles.ctaBtnDisabled : null,
              ]}
              onPress={handleContinue}
              disabled={!amountStr || amount < 500}
            >
              <Text
                style={[
                  styles.ctaBtnText,
                  Typography.headlineMd,
                  { color: isDark ? colors.background : colors.white },
                ]}
              >
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Review Screen */}
      {screen === 'review' && (
        <>
          <View style={[styles.topBar, { borderBottomColor: colors.outlineVariant }]}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: colors.surfaceContainer }]}
              onPress={() => setScreen('amount')}
            >
              <MaterialIcons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.topBarTitle, Typography.headlineMd, { color: colors.text }]}>Review Payment</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Receipt Card */}
            <View style={[styles.receiptCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <View style={[styles.receiptDecor, { backgroundColor: colors.secondary }]} />
              <View style={styles.receiptAmountSection}>
                <Text style={[styles.receiptLabel, Typography.labelCaps, { color: colors.textSecondary }]}>Amount to Pay</Text>
                <Text style={[styles.receiptAmount, Typography.displayMetrics, { color: colors.text }]}>
                  ₦{amount.toLocaleString()}
                </Text>
                <Text style={[styles.receiptUnits, Typography.metricUnit, { color: colors.textSecondary }]}>
                  ≈ {estimatedUnits} kWh
                </Text>
              </View>

              <View style={[styles.receiptDivider, { backgroundColor: colors.surfaceContainerHigh }]} />

              <View style={styles.receiptDetails}>
                {[
                  { label: 'Provider', value: activeMeter?.disco || 'YEDC' },
                  { label: 'Meter', value: activeMeter?.name || 'Home' },
                  { label: 'Meter Num', value: `••••${activeMeter?.number.slice(-4) || '4821'}` },
                  { label: 'Type', value: 'Prepaid' },
                ].map((row) => (
                  <View key={row.label} style={styles.receiptRow}>
                    <Text style={[styles.receiptRowLabel, Typography.bodyMd, { color: colors.textSecondary }]}>{row.label}</Text>
                    <Text style={[styles.receiptRowValue, Typography.metricUnit, { color: colors.text }]}>{row.value}</Text>
                  </View>
                ))}
                <View style={[styles.receiptDashedDivider, { borderColor: colors.outlineVariant }]} />
                {[
                  { label: 'Amount', value: `₦${amount.toLocaleString()}.00` },
                  { label: 'Fee', value: '₦0.00' },
                ].map((row) => (
                  <View key={row.label} style={styles.receiptRow}>
                    <Text style={[styles.receiptRowLabel, Typography.bodyMd, { color: colors.textSecondary }]}>{row.label}</Text>
                    <Text style={[styles.receiptRowValue, Typography.metricUnit, { color: colors.text }]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Wallet */}
            <View style={[styles.walletCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <View style={[styles.walletIcon, { backgroundColor: isDark ? colors.secondary : colors.primary }]}>
                <Text style={[Typography.headlineMd, { color: isDark ? colors.background : colors.white, fontSize: 18 }]}>W</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[Typography.metricUnit, { color: colors.text, fontWeight: '500' }]}>Wallet Balance</Text>
                <Text style={[Typography.bodyMd, { color: colors.textSecondary, fontSize: 13 }]}>
                  ₦{walletBalance.toLocaleString()} available
                </Text>
              </View>
              {walletBalance >= amount ? (
                <MaterialIcons
                  name="check-circle"
                  size={22}
                  color={isDark ? colors.secondary : colors.secondaryDark}
                />
              ) : (
                <MaterialIcons name="error" size={22} color={colors.error} />
              )}
            </View>

            {walletBalance < amount && (
              <View style={[styles.insufficientAlert, { backgroundColor: colors.errorBg }]}>
                <MaterialIcons name="warning" size={20} color={colors.onErrorText} />
                <View style={{ flex: 1 }}>
                  <Text style={[Typography.labelCaps, { color: colors.onErrorText, fontSize: 12 }]}>
                    Insufficient wallet balance
                  </Text>
                  <Text style={{ color: colors.onErrorText, fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                    You need ₦{(amount - walletBalance).toLocaleString()} more to proceed.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.alertFundBtn, { backgroundColor: colors.error }]}
                  onPress={() => router.push('/fund-wallet')}
                >
                  <Text style={styles.alertFundBtnText}>+ Fund</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.outlineVariant }]}>
            <TouchableOpacity
              style={[
                styles.ctaBtn,
                { backgroundColor: isDark ? colors.secondary : colors.primary },
                (walletBalance < amount || isSubmitting) ? styles.ctaBtnDisabled : null,
              ]}
              onPress={handlePay}
              disabled={walletBalance < amount || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={isDark ? colors.background : colors.white} />
              ) : (
                <>
                  <MaterialIcons name="lock" size={18} color={isDark ? colors.background : colors.white} />
                  <Text
                    style={[
                      styles.ctaBtnText,
                      Typography.headlineMd,
                      { color: isDark ? colors.background : colors.white },
                    ]}
                  >
                    Pay ₦{amount.toLocaleString()}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Processing Screen */}
      {screen === 'processing' && (
        <View style={[styles.processingScreen, { backgroundColor: isDark ? colors.background : colors.primary }]}>
          <View style={[styles.processingDecor1, { backgroundColor: colors.secondary }]} />
          <View style={[styles.processingDecor2, { backgroundColor: colors.secondary }]} />
          <View style={styles.processingContent}>
            <View style={styles.processingSpinnerWrap}>
              <ActivityIndicator
                size="large"
                color={isDark ? colors.secondary : colors.secondaryDark}
                style={{ position: 'absolute' }}
              />
              <View
                style={[
                  styles.processingInnerCircle,
                  { backgroundColor: isDark ? 'rgba(163,230,53,0.2)' : 'rgba(132,204,22,0.2)' },
                ]}
              >
                <MaterialCommunityIcons
                  name="lightning-bolt"
                  size={24}
                  color={isDark ? colors.secondary : colors.secondaryDark}
                />
              </View>
            </View>
            <Text style={[styles.processingTitle, Typography.headlineMd, { color: colors.white }]}>Processing payment</Text>
            <Text style={[styles.processingSubtitle, Typography.bodyMd]}>
              Generating your token securely from {activeMeter?.disco || 'YEDC'}...
            </Text>
            <View style={styles.secureTag}>
              <MaterialIcons name="verified-user" size={14} color={colors.secondary} />
              <Text style={[styles.secureTagText, Typography.labelCaps, { color: colors.white }]}>Secure Connection</Text>
            </View>
          </View>
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
  scrollContent: { padding: Spacing.containerMargin, paddingBottom: 120 },
  meterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  meterCardIcon: {
    width: 44,
    height: 44,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  amountLabel: { textTransform: 'uppercase', marginBottom: Spacing.md },
  amountDisplay: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  currencySymbol: { fontSize: 28 },
  amountValueInput: {
    textAlign: 'center',
    minWidth: 100,
    padding: 0,
    margin: 0,
  },
  amountUnderline: {
    width: 80,
    height: 2,
    borderRadius: 1,
    marginTop: Spacing.xs,
  },
  unitsEstimate: { marginTop: Spacing.sm },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  presetBtn: {
    width: '47%',
    height: 52,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnActive: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  presetBtnText: {},
  presetBtnTextActive: {},
  keypad: { gap: Spacing.xs },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  keypadKey: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Rounded.full,
  },
  keypadKeyEmpty: { opacity: 0 },
  keypadKeyText: {},
  stickyFooter: {
    padding: Spacing.containerMargin,
    borderTopWidth: 1,
  },
  ctaBtn: {
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
  ctaBtnDisabled: { opacity: 0.4 },
  ctaBtnText: {},
  receiptCard: {
    borderRadius: Rounded.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  receiptDecor: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: Rounded.full,
    opacity: 0.1,
  },
  receiptAmountSection: { alignItems: 'center', marginBottom: Spacing.lg },
  receiptLabel: { textTransform: 'uppercase', marginBottom: Spacing.sm },
  receiptAmount: { fontSize: 36 },
  receiptUnits: { marginTop: Spacing.xs },
  receiptDivider: { height: 1, marginVertical: Spacing.md },
  receiptDashedDivider: {
    height: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginVertical: Spacing.md,
  },
  receiptDetails: { gap: 4 },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  receiptRowLabel: { fontSize: 14 },
  receiptRowValue: { fontWeight: '500' },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  walletIcon: {
    width: 40,
    height: 40,
    borderRadius: Rounded.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insufficientAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Rounded.default,
    padding: Spacing.md,
  },
  alertFundBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Rounded.full,
  },
  alertFundBtnText: {
    color: '#ffffff',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  processingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingDecor1: {
    position: 'absolute',
    top: '20%',
    left: -50,
    width: 200,
    height: 200,
    borderRadius: Rounded.full,
    opacity: 0.1,
  },
  processingDecor2: {
    position: 'absolute',
    bottom: '20%',
    right: -50,
    width: 200,
    height: 200,
    borderRadius: Rounded.full,
    opacity: 0.1,
  },
  processingContent: { alignItems: 'center', gap: Spacing.md },
  processingSpinnerWrap: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  processingSpinnerTrack: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
  },
  processingInnerCircle: {
    width: 54,
    height: 54,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingTitle: {},
  processingSubtitle: { color: 'rgba(255,255,255,0.7)', textAlign: 'center', maxWidth: 280, fontSize: 14 },
  secureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Rounded.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.lg,
  },
  secureTagText: { textTransform: 'uppercase' },
});
