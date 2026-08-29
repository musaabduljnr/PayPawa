import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';

const PRESET_AMOUNTS = [5000, 10000, 20000, 50000];

type Screen = 'amount' | 'review' | 'processing';

export default function BuyElectricity() {
  const { walletBalance, meters, activeMeterId, buyElectricity } = useApp();
  const [screen, setScreen] = useState<Screen>('amount');
  const [amountStr, setAmountStr] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeMeter = meters.find((m) => m.id === activeMeterId);
  const amount = Number(amountStr.replace(/,/g, '')) || 0;

  const handleKeypad = (key: string) => {
    if (key === 'back') {
      setAmountStr((prev) => prev.slice(0, -1));
      return;
    }
    const raw = amountStr.replace(/,/g, '') + key;
    if (raw.length > 7) return; // Max ₦9,999,999
    const num = Number(raw);
    setAmountStr(num.toLocaleString());
  };

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
        Alert.alert('Payment Failed', result.errorMessage || 'Unable to complete electricity token vending.');
        setScreen('review');
      }
    } catch (err: any) {
      Alert.alert('Payment Error', err?.message || 'A network error occurred while contacting provider.');
      setScreen('review');
    } finally {
      setIsSubmitting(false);
    }
  };

  const rate = 235.3;
  const estimatedUnits = amount ? (amount / rate).toFixed(1) : '0.0';

  const KEYPAD = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'back'],
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Amount Screen */}
      {screen === 'amount' && (
        <>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={[styles.topBarTitle, Typography.headlineMd]}>Buy Electricity</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Meter Card */}
            <TouchableOpacity style={styles.meterCard} onPress={() => router.push('/add-meter')}>
              <View style={styles.meterCardIcon}>
                <MaterialCommunityIcons name="lightning-bolt" size={22} color={Colors.secondaryDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[Typography.metricUnit, { color: Colors.text, fontWeight: '500' }]}>
                  {activeMeter?.name || 'No Meter Selected'}
                </Text>
                <Text style={[Typography.bodyMd, { color: Colors.textSecondary, fontSize: 13 }]}>
                  {activeMeter?.disco || 'Tap to select a meter'} ••••{activeMeter?.number.slice(-4) || '----'}
                </Text>
              </View>
              <MaterialIcons name="expand-more" size={22} color={Colors.outline} />
            </TouchableOpacity>

            {/* Amount Input */}
            <View style={styles.amountSection}>
              <Text style={[styles.amountLabel, Typography.labelCaps]}>Enter Amount</Text>
              <View style={styles.amountDisplay}>
                <Text style={[styles.currencySymbol, Typography.displayMetrics]}>₦</Text>
                <Text style={[styles.amountValue, Typography.displayMetrics]}>
                  {amountStr || '0'}
                </Text>
              </View>
              <View style={styles.amountUnderline} />
              {amount > 0 && amount < 500 && (
                <Text style={[styles.unitsEstimate, Typography.metricUnit, { color: Colors.error }]}>
                  Minimum purchase is ₦500.00
                </Text>
              )}
              {amount >= 500 && (
                <Text style={[styles.unitsEstimate, Typography.metricUnit]}>
                  ≈ {estimatedUnits} kWh
                </Text>
              )}
            </View>

            {/* Preset Amounts */}
            <View style={styles.presetGrid}>
              {PRESET_AMOUNTS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[styles.presetBtn, amount === preset ? styles.presetBtnActive : null]}
                  onPress={() => setAmountStr(preset.toLocaleString())}
                >
                  <Text
                    style={[
                      styles.presetBtnText,
                      Typography.metricUnit,
                      amount === preset ? styles.presetBtnTextActive : null,
                    ]}
                  >
                    ₦{preset.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Numeric Keypad */}
            <View style={styles.keypad}>
              {KEYPAD.map((row, ri) => (
                <View key={ri} style={styles.keypadRow}>
                  {row.map((key, ki) => (
                    <TouchableOpacity
                      key={ki}
                      style={[styles.keypadKey, !key ? styles.keypadKeyEmpty : null]}
                      onPress={() => key && handleKeypad(key)}
                      disabled={!key}
                    >
                      {key === 'back' ? (
                        <MaterialIcons name="backspace" size={22} color={Colors.text} />
                      ) : (
                        <Text style={[styles.keypadKeyText, Typography.headlineMd]}>{key}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>

          {/* CTA */}
          <View style={styles.stickyFooter}>
            <TouchableOpacity
              style={[styles.ctaBtn, (!amountStr || amount < 500) ? styles.ctaBtnDisabled : null]}
              onPress={handleContinue}
              disabled={!amountStr || amount < 500}
            >
              <Text style={[styles.ctaBtnText, Typography.headlineMd]}>Continue</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Review Screen */}
      {screen === 'review' && (
        <>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('amount')}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={[styles.topBarTitle, Typography.headlineMd]}>Review Payment</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Receipt Card */}
            <View style={styles.receiptCard}>
              <View style={styles.receiptDecor} />
              <View style={styles.receiptAmountSection}>
                <Text style={[styles.receiptLabel, Typography.labelCaps]}>Amount to Pay</Text>
                <Text style={[styles.receiptAmount, Typography.displayMetrics]}>
                  ₦{amount.toLocaleString()}
                </Text>
                <Text style={[styles.receiptUnits, Typography.metricUnit]}>≈ {estimatedUnits} kWh</Text>
              </View>

              <View style={styles.receiptDivider} />

              <View style={styles.receiptDetails}>
                {[
                  { label: 'Provider', value: activeMeter?.disco || 'YEDC' },
                  { label: 'Meter', value: activeMeter?.name || 'Home' },
                  { label: 'Meter Num', value: `••••${activeMeter?.number.slice(-4) || '4821'}` },
                  { label: 'Type', value: 'Prepaid' },
                ].map((row) => (
                  <View key={row.label} style={styles.receiptRow}>
                    <Text style={[styles.receiptRowLabel, Typography.bodyMd]}>{row.label}</Text>
                    <Text style={[styles.receiptRowValue, Typography.metricUnit]}>{row.value}</Text>
                  </View>
                ))}
                <View style={styles.receiptDashedDivider} />
                {[
                  { label: 'Amount', value: `₦${amount.toLocaleString()}.00` },
                  { label: 'Fee', value: '₦0.00' },
                ].map((row) => (
                  <View key={row.label} style={styles.receiptRow}>
                    <Text style={[styles.receiptRowLabel, Typography.bodyMd]}>{row.label}</Text>
                    <Text style={[styles.receiptRowValue, Typography.metricUnit]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Wallet */}
            <View style={styles.walletCard}>
              <View style={styles.walletIcon}>
                <Text style={[Typography.headlineMd, { color: Colors.white, fontSize: 18 }]}>W</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[Typography.metricUnit, { color: Colors.text, fontWeight: '500' }]}>Wallet Balance</Text>
                <Text style={[Typography.bodyMd, { color: Colors.textSecondary, fontSize: 13 }]}>
                  ₦{walletBalance.toLocaleString()} available
                </Text>
              </View>
              {walletBalance >= amount ? (
                <MaterialIcons name="check-circle" size={22} color={Colors.secondaryDark} />
              ) : (
                <MaterialIcons name="error" size={22} color={Colors.error} />
              )}
            </View>

            {walletBalance < amount && (
              <View style={styles.insufficientAlert}>
                <MaterialIcons name="warning" size={20} color={Colors.onErrorText} />
                <View style={{ flex: 1 }}>
                  <Text style={[Typography.labelCaps, { color: Colors.onErrorText, fontSize: 12 }]}>
                    Insufficient wallet balance
                  </Text>
                  <Text style={{ color: Colors.onErrorText, fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                    You need ₦{(amount - walletBalance).toLocaleString()} more to proceed.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.alertFundBtn}
                  onPress={() => router.push('/fund-wallet')}
                >
                  <Text style={styles.alertFundBtnText}>+ Fund</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <View style={styles.stickyFooter}>
            <TouchableOpacity
              style={[styles.ctaBtn, walletBalance < amount ? styles.ctaBtnDisabled : null]}
              onPress={handlePay}
              disabled={walletBalance < amount}
            >
              <MaterialIcons name="lock" size={18} color={Colors.white} />
              <Text style={[styles.ctaBtnText, Typography.headlineMd]}>
                Pay ₦{amount.toLocaleString()}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Processing Screen */}
      {screen === 'processing' && (
        <View style={styles.processingScreen}>
          <View style={styles.processingDecor1} />
          <View style={styles.processingDecor2} />
          <View style={styles.processingContent}>
            <View style={styles.processingSpinnerWrap}>
              <View style={styles.processingSpinnerTrack} />
              <View style={styles.processingInnerCircle}>
                <MaterialCommunityIcons name="lightning-bolt" size={28} color={Colors.secondaryDark} />
              </View>
            </View>
            <Text style={[styles.processingTitle, Typography.headlineMd]}>Processing payment</Text>
            <Text style={[styles.processingSubtitle, Typography.bodyMd]}>
              Generating your token securely from {activeMeter?.disco || 'YEDC'}...
            </Text>
            <View style={styles.secureTag}>
              <MaterialIcons name="verified-user" size={14} color={Colors.secondary} />
              <Text style={[styles.secureTagText, Typography.labelCaps]}>Secure Connection</Text>
            </View>
          </View>
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
  scrollContent: { padding: Spacing.containerMargin, paddingBottom: 120 },
  meterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  meterCardIcon: {
    width: 44,
    height: 44,
    borderRadius: Rounded.full,
    backgroundColor: 'rgba(132,204,22,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  amountLabel: { color: Colors.textSecondary, textTransform: 'uppercase', marginBottom: Spacing.md },
  amountDisplay: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  currencySymbol: { fontSize: 28, color: Colors.textSecondary },
  amountValue: { color: Colors.text, textAlign: 'center', minWidth: 80 },
  amountUnderline: {
    width: 80,
    height: 2,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 1,
    marginTop: Spacing.xs,
  },
  unitsEstimate: { color: Colors.textSecondary, marginTop: Spacing.sm },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  presetBtn: {
    width: '47%',
    height: 52,
    backgroundColor: Colors.surface,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  presetBtnText: { color: Colors.text },
  presetBtnTextActive: { color: Colors.white },
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
  keypadKeyText: { color: Colors.text },
  stickyFooter: {
    padding: Spacing.containerMargin,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    backgroundColor: Colors.background,
  },
  ctaBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Rounded.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaBtnText: { color: Colors.white },
  receiptCard: {
    backgroundColor: Colors.surface,
    borderRadius: Rounded.xl,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    shadowColor: Colors.primary,
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
    backgroundColor: Colors.secondary,
    opacity: 0.1,
  },
  receiptAmountSection: { alignItems: 'center', marginBottom: Spacing.lg },
  receiptLabel: { color: Colors.textSecondary, textTransform: 'uppercase', marginBottom: Spacing.sm },
  receiptAmount: { color: Colors.text, fontSize: 36 },
  receiptUnits: { color: Colors.textSecondary, marginTop: Spacing.xs },
  receiptDivider: { height: 1, backgroundColor: Colors.surfaceContainerHigh, marginVertical: Spacing.md },
  receiptDashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderStyle: 'dashed',
    marginVertical: Spacing.md,
  },
  receiptDetails: { gap: 4 },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  receiptRowLabel: { color: Colors.textSecondary, fontSize: 14 },
  receiptRowValue: { color: Colors.text, fontWeight: '500' },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  walletIcon: {
    width: 40,
    height: 40,
    borderRadius: Rounded.default,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insufficientAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.errorBg,
    borderRadius: Rounded.default,
    padding: Spacing.md,
  },
  alertFundBtn: {
    backgroundColor: Colors.error,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Rounded.full,
  },
  alertFundBtnText: {
    color: Colors.white,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  processingScreen: {
    flex: 1,
    backgroundColor: Colors.primary,
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
    backgroundColor: Colors.secondary,
    opacity: 0.1,
  },
  processingDecor2: {
    position: 'absolute',
    bottom: '20%',
    right: -50,
    width: 200,
    height: 200,
    borderRadius: Rounded.full,
    backgroundColor: Colors.secondary,
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
    borderColor: 'rgba(255,255,255,0.15)',
  },
  processingInnerCircle: {
    width: 54,
    height: 54,
    borderRadius: Rounded.full,
    backgroundColor: 'rgba(132,204,22,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingTitle: { color: Colors.white },
  processingSubtitle: { color: 'rgba(255,255,255,0.7)', textAlign: 'center', maxWidth: 280, fontSize: 14 },
  secureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Rounded.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.lg,
  },
  secureTagText: { color: Colors.white, textTransform: 'uppercase' },
});
