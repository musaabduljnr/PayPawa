import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { WebView } from 'react-native-webview';
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';
import { WalletFundingService } from '@/services/wallet-funding.service';

const PRESET_AMOUNTS = [5000, 10000, 20000, 50000];

type Step = 'amount' | 'method' | 'processing' | 'success';
type PaymentMethod = 'card' | 'transfer' | 'ussd';

export default function FundWalletScreen() {
  const { walletBalance, fundWallet, refreshWallet, refreshTransactions } = useApp();
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState<Step>('amount');
  const [amountStr, setAmountStr] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [fundingRef, setFundingRef] = useState('');
  const [fundingError, setFundingError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [virtualAccountInfo, setVirtualAccountInfo] = useState<{
    accountNumber: string;
    bankName: string;
    accountName: string;
  } | null>(null);
  const [ussdCodeInfo, setUssdCodeInfo] = useState<string | null>(null);
  const [paystackUrl, setPaystackUrl] = useState<string | null>(null);
  const [isPaystackLoading, setIsPaystackLoading] = useState(true);

  const activeRef = useRef<string>('');
  const isVerifyingRef = useRef<boolean>(false);

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

  const handleContinueToMethod = () => {
    if (!amountStr || amount < 500) return;
    setStep('method');
  };

  const handleConfirmFund = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFundingError('');

    try {
      const result = await fundWallet(amount, method);
      if (result.success && result.reference) {
        setFundingRef(result.reference);
        activeRef.current = result.reference;
        if (result.virtualAccount) {
          setVirtualAccountInfo(result.virtualAccount);
        }
        if (result.ussdCode) {
          setUssdCodeInfo(result.ussdCode);
        }

        // If Paystack returned a web checkout URL, load it directly within the in-app WebView!
        if (result.checkoutUrl && result.checkoutUrl.startsWith('http')) {
          setPaystackUrl(result.checkoutUrl);
          setIsPaystackLoading(true);
          return;
        }

        await refreshWallet();
        await refreshTransactions();
        setStep('success');
      } else {
        setFundingError(result.errorMessage || 'Unable to complete wallet funding.');
        setStep('method');
      }
    } catch (err: any) {
      setFundingError(err.message || 'An unexpected error occurred during funding.');
      setStep('method');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaystackNavigationStateChange = async (navState: any) => {
    const url = navState.url || '';
    if (isVerifyingRef.current) return;

    // Check if user cancelled inside Paystack widget
    if (url.includes('standard/close') || url.includes('/cancel') || url.includes('close=true')) {
      setPaystackUrl(null);
      setFundingError('Payment was cancelled.');
      setStep('method');
      return;
    }

    // If Paystack completes or redirects
    const isCompleted =
      url.includes('trxref=') ||
      url.includes('reference=') ||
      url.includes('callback') ||
      url.includes('standard/success') ||
      url.includes('standard/callback');

    if (isCompleted) {
      isVerifyingRef.current = true;
      setPaystackUrl(null);
      setStep('processing');

      // Extract reference directly from URL if present
      const refMatch = url.match(/[?&](?:reference|trxref)=([^&]+)/);
      const targetRef = (refMatch && refMatch[1]) || activeRef.current || fundingRef;

      try {
        if (targetRef) {
          const verifyResult = await WalletFundingService.verifyAndCreditPayment(targetRef);
          await refreshWallet();
          await refreshTransactions();
          if (verifyResult.success) {
            setStep('success');
            return;
          } else {
            setFundingError(verifyResult.errorMessage || 'Payment could not be verified.');
            setStep('method');
            return;
          }
        }
      } catch (err: any) {
        console.error('Error verifying payment from navigation state:', err);
        setFundingError(err?.message || 'Error verifying payment.');
        setStep('method');
      } finally {
        await refreshWallet();
        await refreshTransactions();
        isVerifyingRef.current = false;
      }
    }
  };

  const handleClosePaystack = async () => {
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;
    setPaystackUrl(null);
    setStep('processing');

    const targetRef = activeRef.current || fundingRef;
    try {
      if (targetRef) {
        const verifyResult = await WalletFundingService.verifyAndCreditPayment(targetRef);
        await refreshWallet();
        await refreshTransactions();
        if (verifyResult.success) {
          setStep('success');
          return;
        }
      }
      setFundingError('Payment was cancelled or not completed.');
      setStep('method');
    } catch (err: any) {
      console.error('Error verifying on modal close:', err);
      setFundingError('Payment was cancelled.');
      setStep('method');
    } finally {
      await refreshWallet();
      await refreshTransactions();
      isVerifyingRef.current = false;
    }
  };

  const handleShouldStartLoadWithRequest = (request: any) => {
    const url = request.url || '';
    if (
      url.includes('trxref=') ||
      url.includes('reference=') ||
      url.includes('callback') ||
      url.includes('standard/close') ||
      url.includes('standard/callback') ||
      url.includes('standard/success') ||
      url.includes('cancel') ||
      url.includes('close=true') ||
      url.includes('smartelectricityapp://') ||
      url.includes('smart-electricity.app')
    ) {
      handlePaystackNavigationStateChange({ url });
      return false;
    }
    return true;
  };

  const KEYPAD = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'back'],
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* STEP 1: ENTER AMOUNT */}
      {step === 'amount' && (
        <View style={{ flex: 1 }}>
          <View style={[styles.topBar, { borderBottomColor: colors.outlineVariant }]}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: colors.surfaceContainer }]}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.topBarTitle, Typography.headlineMd, { color: colors.text }]}>Fund Wallet</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={{ flex: 1, padding: 20 }}>
            {/* Balance Banner */}
            <View style={[styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <View style={[styles.balanceCardIcon, { backgroundColor: colors.surfaceContainerHigh }]}>
                <MaterialIcons name="account-balance-wallet" size={22} color={colors.secondaryDark} />
              </View>
              <View>
                <Text style={[styles.balanceCardLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                  Current Wallet Balance
                </Text>
                <Text style={[styles.balanceCardValue, Typography.headlineMd, { color: colors.primary }]}>
                  ₦{walletBalance.toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Amount Display */}
            <View style={styles.amountSection}>
              <Text style={[styles.amountLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                Enter Funding Amount
              </Text>
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
                <Text style={[styles.minNotice, Typography.labelCaps, { color: colors.error }]}>
                  Minimum funding amount is ₦500
                </Text>
              )}
            </View>

            {/* Preset Amount Chips */}
            <View style={styles.presetGrid}>
              {PRESET_AMOUNTS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetBtn,
                    { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
                    amount === preset
                      ? {
                          backgroundColor: isDark ? colors.secondary : colors.primary,
                          borderColor: isDark ? colors.secondary : colors.primary,
                        }
                      : null,
                  ]}
                  onPress={() => setAmountStr(preset.toLocaleString())}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.presetBtnText,
                      Typography.metricUnit,
                      { color: colors.text },
                      amount === preset
                        ? { color: isDark ? colors.background : colors.white, fontWeight: '700' }
                        : null,
                    ]}
                  >
                    ₦{preset.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Sticky CTA */}
          <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.outlineVariant }]}>
            <TouchableOpacity
              style={[
                styles.ctaBtn,
                { backgroundColor: isDark ? colors.secondary : colors.primary },
                (!amountStr || amount < 500) ? styles.ctaBtnDisabled : null,
              ]}
              onPress={handleContinueToMethod}
              disabled={!amountStr || amount < 500}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.ctaBtnText,
                  Typography.headlineMd,
                  { color: isDark ? colors.background : colors.white },
                ]}
              >
                Select Payment Method
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* STEP 2: PAYMENT METHOD */}
      {step === 'method' && (
        <>
          <View style={[styles.topBar, { borderBottomColor: colors.outlineVariant }]}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: colors.surfaceContainer }]}
              onPress={() => setStep('amount')}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.topBarTitle, Typography.headlineMd, { color: colors.text }]}>Payment Method</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Amount Summary */}
            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: isDark ? colors.surface : colors.cardBg,
                  borderColor: isDark ? colors.outlineVariant : colors.cardBorder,
                },
              ]}
            >
              <Text style={[styles.summaryLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                Top-Up Amount
              </Text>
              <Text style={[styles.summaryAmount, Typography.displayMetrics, { color: colors.primary }]}>
                ₦{amount.toLocaleString()}
              </Text>
            </View>

            {fundingError ? (
              <View
                style={{
                  backgroundColor: colors.errorBg,
                  borderColor: colors.error,
                  borderWidth: 1,
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 16,
                }}
              >
                <Text style={{ color: colors.error, fontSize: 13, fontWeight: '500' }}>{fundingError}</Text>
              </View>
            ) : null}

            {/* Method Selectors */}
            <Text style={[styles.sectionTitle, Typography.labelCaps, { color: colors.outline }]}>
              Choose Payment Method (Powered by Paystack)
            </Text>

            {/* Option 1: Card */}
            <TouchableOpacity
              style={[
                styles.methodCard,
                { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
                method === 'card'
                  ? {
                      borderColor: isDark ? colors.secondary : colors.primary,
                      backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainerLow,
                    }
                  : null,
              ]}
              onPress={() => setMethod('card')}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.methodIcon,
                  { backgroundColor: colors.surfaceContainerHigh },
                  method === 'card' ? { backgroundColor: isDark ? colors.secondary : colors.primary } : null,
                ]}
              >
                <Ionicons
                  name="card-outline"
                  size={22}
                  color={
                    method === 'card' ? (isDark ? colors.background : colors.white) : colors.primary
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.methodTitle, Typography.metricUnit, { color: colors.primary }]}>
                  Debit / Credit Card
                </Text>
                <Text style={[styles.methodSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Instant • Visa, Mastercard, Verve
                </Text>
              </View>
              <Ionicons
                name={method === 'card' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={method === 'card' ? colors.secondaryDark : colors.outline}
              />
            </TouchableOpacity>

            {/* Option 2: Bank Transfer */}
            <TouchableOpacity
              style={[
                styles.methodCard,
                { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
                method === 'transfer'
                  ? {
                      borderColor: isDark ? colors.secondary : colors.primary,
                      backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainerLow,
                    }
                  : null,
              ]}
              onPress={() => setMethod('transfer')}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.methodIcon,
                  { backgroundColor: colors.surfaceContainerHigh },
                  method === 'transfer' ? { backgroundColor: isDark ? colors.secondary : colors.primary } : null,
                ]}
              >
                <MaterialIcons
                  name="account-balance"
                  size={22}
                  color={
                    method === 'transfer' ? (isDark ? colors.background : colors.white) : colors.primary
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.methodTitle, Typography.metricUnit, { color: colors.primary }]}>
                  Bank Transfer
                </Text>
                <Text style={[styles.methodSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Direct transfer from your bank app
                </Text>
              </View>
              <Ionicons
                name={method === 'transfer' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={method === 'transfer' ? colors.secondaryDark : colors.outline}
              />
            </TouchableOpacity>

            {/* Option 3: USSD */}
            <TouchableOpacity
              style={[
                styles.methodCard,
                { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
                method === 'ussd'
                  ? {
                      borderColor: isDark ? colors.secondary : colors.primary,
                      backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainerLow,
                    }
                  : null,
              ]}
              onPress={() => setMethod('ussd')}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.methodIcon,
                  { backgroundColor: colors.surfaceContainerHigh },
                  method === 'ussd' ? { backgroundColor: isDark ? colors.secondary : colors.primary } : null,
                ]}
              >
                <MaterialIcons
                  name="phone-android"
                  size={22}
                  color={
                    method === 'ussd' ? (isDark ? colors.background : colors.white) : colors.primary
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.methodTitle, Typography.metricUnit, { color: colors.primary }]}>
                  USSD Code
                </Text>
                <Text style={[styles.methodSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                  GTBank, Zenith, Access, FirstBank
                </Text>
              </View>
              <Ionicons
                name={method === 'ussd' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={method === 'ussd' ? colors.secondaryDark : colors.outline}
              />
            </TouchableOpacity>


            {/* Paystack secure badge */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32, gap: 6 }}>
              <MaterialCommunityIcons name="shield-check" size={16} color={colors.textSecondary} />
              <Text style={{ fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                Secured by Paystack
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.outlineVariant }]}>
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: isDark ? colors.secondary : colors.primary }]}
              onPress={handleConfirmFund}
              activeOpacity={0.85}
            >
              <MaterialIcons name="lock" size={18} color={isDark ? colors.background : colors.white} />
              <Text
                style={[
                  styles.ctaBtnText,
                  Typography.headlineMd,
                  { color: isDark ? colors.background : colors.white },
                ]}
              >
                Pay ₦{amount.toLocaleString()} Now
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* STEP 3: PROCESSING */}
      {step === 'processing' && (
        <View style={[styles.processingScreen, { backgroundColor: isDark ? colors.background : colors.primary }]}>
          <View style={styles.processingDecor1} />
          <View style={styles.processingDecor2} />
          <View style={styles.processingContent}>
            <View style={styles.processingSpinnerWrap}>
              <ActivityIndicator size="large" color={colors.secondaryDark} style={{ position: 'absolute' }} />
              <View style={styles.processingInnerCircle}>
                <MaterialIcons name="account-balance-wallet" size={24} color={colors.secondaryDark} />
              </View>
            </View>
            <Text style={[styles.processingTitle, Typography.headlineMd, { color: isDark ? colors.text : '#ffffff' }]}>
              Authorizing Payment
            </Text>
            <Text
              style={[
                styles.processingSubtitle,
                Typography.bodyMd,
                { color: isDark ? colors.textSecondary : 'rgba(255,255,255,0.7)' },
              ]}
            >
              Securely crediting ₦{amount.toLocaleString()} to your wallet balance...
            </Text>
            <View style={styles.secureTag}>
              <MaterialIcons name="verified-user" size={14} color={colors.secondary} />
              <Text style={[styles.secureTagText, Typography.labelCaps, { color: isDark ? colors.text : '#ffffff' }]}>
                256-Bit Encrypted
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* STEP 4: SUCCESS */}
      {step === 'success' && (
        <View style={[styles.successScreen, { backgroundColor: colors.background }]}>
          <View style={styles.successContent}>
            <View style={styles.successIconCircle}>
              <MaterialIcons name="check" size={48} color="#ffffff" />
            </View>
            <Text style={[styles.successTitle, Typography.headlineLgMobile, { color: colors.primary }]}>
              Wallet Funded!
            </Text>
            <Text style={[styles.successSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
              ₦{amount.toLocaleString()} has been added to your balance.
            </Text>

            <View style={[styles.successCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <View style={styles.successCardRow}>
                <Text style={[styles.successCardLabel, Typography.bodyMd, { color: colors.textSecondary }]}>
                  New Balance
                </Text>
                <Text style={[styles.successCardValue, Typography.headlineMd, { color: colors.secondaryDark }]}>
                  ₦{walletBalance.toLocaleString()}
                </Text>
              </View>
              <View style={[styles.successCardDivider, { backgroundColor: colors.outlineVariant }]} />
              <View style={styles.successCardRow}>
                <Text style={[styles.successCardLabel, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Transaction Ref
                </Text>
                <Text style={[styles.successCardRef, Typography.metricUnit, { color: colors.primary }]}>
                  {fundingRef || `WF-${Date.now()}`}
                </Text>
              </View>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: isDark ? colors.secondary : colors.secondaryDark }]}
                onPress={() => router.replace('/buy-electricity')}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons
                  name="lightning-bolt"
                  size={20}
                  color={isDark ? colors.background : '#ffffff'}
                />
                <Text
                  style={[
                    styles.primaryActionText,
                    Typography.headlineMd,
                    { color: isDark ? colors.background : '#ffffff' },
                  ]}
                >
                  Buy Electricity Now
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryActionBtn, { backgroundColor: colors.surfaceContainer }]}
                onPress={() => router.replace('/(tabs)/home')}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryActionText, Typography.headlineMd, { color: colors.primary }]}>
                  Return to Home
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* IN-APP PAYSTACK CHECKOUT MODAL */}
      <Modal
        visible={Boolean(paystackUrl)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClosePaystack}
      >
        <SafeAreaView style={[styles.paystackModalContainer, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.paystackModalHeader,
              { backgroundColor: colors.surface, borderBottomColor: colors.outlineVariant },
            ]}
          >
            <TouchableOpacity
              onPress={handleClosePaystack}
              style={[styles.paystackCloseBtn, { backgroundColor: colors.surfaceContainer }]}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.paystackHeaderTitleWrap}>
              <MaterialIcons name="lock" size={16} color={colors.secondaryDark} />
              <Text style={[styles.paystackHeaderTitle, Typography.headlineMd, { color: colors.text }]}>
                Paystack Checkout
              </Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          {isPaystackLoading && (
            <View style={styles.paystackLoadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.paystackLoadingText, Typography.bodyMd, { color: colors.textSecondary }]}>
                Loading Paystack secure portal...
              </Text>
            </View>
          )}

          {paystackUrl ? (
            <WebView
              source={{ uri: paystackUrl }}
              style={[styles.paystackWebView, { backgroundColor: colors.background }]}
              onLoadEnd={() => setIsPaystackLoading(false)}
              onNavigationStateChange={handlePaystackNavigationStateChange}
              onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
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
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  balanceCardIcon: {
    width: 44,
    height: 44,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceCardLabel: {},
  balanceCardValue: { marginTop: 2 },
  amountSection: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  amountLabel: { textTransform: 'uppercase', marginBottom: Spacing.sm },
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
  minNotice: { marginTop: Spacing.xs },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  presetBtn: {
    width: '47%',
    height: 48,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnActive: {},
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
    height: 52,
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
  summaryCard: {
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  summaryLabel: {},
  summaryAmount: { marginTop: 4, fontSize: 32 },
  sectionTitle: { marginBottom: Spacing.sm, paddingLeft: 4 },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  methodCardActive: {},
  methodIcon: {
    width: 42,
    height: 42,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIconActive: {},
  methodTitle: {},
  methodSubtitle: { fontSize: 12, marginTop: 2 },
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
    backgroundColor: '#84cc16',
    opacity: 0.1,
  },
  processingDecor2: {
    position: 'absolute',
    bottom: '20%',
    right: -50,
    width: 200,
    height: 200,
    borderRadius: Rounded.full,
    backgroundColor: '#84cc16',
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
  processingTitle: {},
  processingSubtitle: { textAlign: 'center', maxWidth: 280, fontSize: 14 },
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
  secureTagText: { textTransform: 'uppercase' },
  successScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.containerMargin,
  },
  successContent: { alignItems: 'center' },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: Rounded.full,
    backgroundColor: '#416900',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  successTitle: { marginBottom: Spacing.xs },
  successSubtitle: { textAlign: 'center', marginBottom: Spacing.xl },
  successCard: {
    width: '100%',
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  successCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  successCardLabel: {},
  successCardValue: {},
  successCardRef: {},
  successCardDivider: { height: 1, marginVertical: Spacing.md },
  actionButtons: { width: '100%', gap: Spacing.sm },
  primaryActionBtn: {
    height: 52,
    borderRadius: Rounded.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  primaryActionText: {},
  secondaryActionBtn: {
    height: 52,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: { fontSize: 16 },
  paystackModalContainer: {
    flex: 1,
  },
  paystackModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.containerMargin,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  paystackCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paystackHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paystackHeaderTitle: {},
  paystackLoadingWrap: {
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    zIndex: 10,
  },
  paystackLoadingText: {},
  paystackWebView: {
    flex: 1,
  },
});
