import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
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
import { Colors, Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { WalletFundingService } from '@/services/wallet-funding.service';

const PRESET_AMOUNTS = [5000, 10000, 20000, 50000];

type Step = 'amount' | 'method' | 'processing' | 'success';
type PaymentMethod = 'card' | 'transfer' | 'ussd';

export default function FundWalletScreen() {
  const { walletBalance, fundWallet, refreshWallet, refreshTransactions } = useApp();
  const [step, setStep] = useState<Step>('amount');
  const [amountStr, setAmountStr] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [copiedAccount, setCopiedAccount] = useState(false);
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

  const virtualAccountNumber = virtualAccountInfo?.accountNumber || '9902 4819 5032';

  const copyToClipboard = () => {
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* STEP 1: AMOUNT INPUT */}
      {step === 'amount' && (
        <>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={[styles.topBarTitle, Typography.headlineMd]}>Fund Wallet</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Current Balance Banner */}
            <View style={styles.balanceCard}>
              <View style={styles.balanceCardIcon}>
                <MaterialIcons name="account-balance-wallet" size={22} color={Colors.primary} />
              </View>
              <View>
                <Text style={[styles.balanceCardLabel, Typography.labelCaps]}>Current Wallet Balance</Text>
                <Text style={[styles.balanceCardValue, Typography.headlineMd]}>
                  ₦{walletBalance.toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Amount Display */}
            <View style={styles.amountSection}>
              <Text style={[styles.amountLabel, Typography.labelCaps]}>Enter Funding Amount</Text>
              <View style={styles.amountDisplay}>
                <Text style={[styles.currencySymbol, Typography.displayMetrics]}>₦</Text>
                <Text style={[styles.amountValue, Typography.displayMetrics]}>
                  {amountStr || '0'}
                </Text>
              </View>
              <View style={styles.amountUnderline} />
              {amount > 0 && amount < 500 && (
                <Text style={[styles.minNotice, Typography.labelCaps]}>
                  Minimum funding amount is ₦500
                </Text>
              )}
            </View>

            {/* Preset Amount Chips */}
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

            {/* Keypad */}
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

          {/* Sticky CTA */}
          <View style={styles.stickyFooter}>
            <TouchableOpacity
              style={[styles.ctaBtn, (!amountStr || amount < 500) ? styles.ctaBtnDisabled : null]}
              onPress={handleContinueToMethod}
              disabled={!amountStr || amount < 500}
            >
              <Text style={[styles.ctaBtnText, Typography.headlineMd]}>Select Payment Method</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* STEP 2: PAYMENT METHOD */}
      {step === 'method' && (
        <>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep('amount')}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={[styles.topBarTitle, Typography.headlineMd]}>Payment Method</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Amount Summary */}
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryLabel, Typography.labelCaps]}>Top-Up Amount</Text>
              <Text style={[styles.summaryAmount, Typography.displayMetrics]}>
                ₦{amount.toLocaleString()}
              </Text>
            </View>

            {fundingError ? (
              <View style={{ backgroundColor: '#FEE2E2', borderColor: '#EF4444', borderWidth: 1, padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <Text style={{ color: '#991B1B', fontSize: 13, fontWeight: '500' }}>{fundingError}</Text>
              </View>
            ) : null}

            {/* Method Selectors */}
            <Text style={[styles.sectionTitle, Typography.labelCaps]}>Choose Payment Method (Powered by Paystack)</Text>
 
            {/* Option 1: Card */}
            <TouchableOpacity
              style={[styles.methodCard, method === 'card' ? styles.methodCardActive : null]}
              onPress={() => setMethod('card')}
            >
              <View style={[styles.methodIcon, method === 'card' ? styles.methodIconActive : null]}>
                <Ionicons name="card-outline" size={22} color={method === 'card' ? Colors.white : Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.methodTitle, Typography.metricUnit]}>Debit / Credit Card</Text>
                <Text style={[styles.methodSubtitle, Typography.bodyMd]}>Instant • Visa, Mastercard, Verve</Text>
              </View>
              <Ionicons
                name={method === 'card' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={method === 'card' ? Colors.secondaryDark : Colors.outline}
              />
            </TouchableOpacity>
 
            {/* Option 2: Bank Transfer */}
            <TouchableOpacity
              style={[styles.methodCard, method === 'transfer' ? styles.methodCardActive : null]}
              onPress={() => setMethod('transfer')}
            >
              <View style={[styles.methodIcon, method === 'transfer' ? styles.methodIconActive : null]}>
                <MaterialIcons name="account-balance" size={22} color={method === 'transfer' ? Colors.white : Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.methodTitle, Typography.metricUnit]}>Bank Transfer</Text>
                <Text style={[styles.methodSubtitle, Typography.bodyMd]}>Transfer to unique dedicated account</Text>
              </View>
              <Ionicons
                name={method === 'transfer' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={method === 'transfer' ? Colors.secondaryDark : Colors.outline}
              />
            </TouchableOpacity>
 
            {/* Option 3: USSD */}
            <TouchableOpacity
              style={[styles.methodCard, method === 'ussd' ? styles.methodCardActive : null]}
              onPress={() => setMethod('ussd')}
            >
              <View style={[styles.methodIcon, method === 'ussd' ? styles.methodIconActive : null]}>
                <MaterialIcons name="phone-android" size={22} color={method === 'ussd' ? Colors.white : Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.methodTitle, Typography.metricUnit]}>USSD Code</Text>
                <Text style={[styles.methodSubtitle, Typography.bodyMd]}>GTBank, Zenith, Access, FirstBank</Text>
              </View>
              <Ionicons
                name={method === 'ussd' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={method === 'ussd' ? Colors.secondaryDark : Colors.outline}
              />
            </TouchableOpacity>
 
            {/* Transfer details if Bank Transfer selected */}
            {method === 'transfer' && (
              <View style={styles.transferBox}>
                <Text style={[styles.transferBoxTitle, Typography.labelCaps]}>Dedicated Account Details</Text>
                <View style={styles.transferRow}>
                  <Text style={[styles.transferLabel, Typography.bodyMd]}>Bank Name:</Text>
                  <Text style={[styles.transferValue, Typography.metricUnit]}>Wema Bank / SmartPay</Text>
                </View>
                <View style={styles.transferRow}>
                  <Text style={[styles.transferLabel, Typography.bodyMd]}>Account Number:</Text>
                  <TouchableOpacity style={styles.copyRow} onPress={copyToClipboard}>
                    <Text style={[styles.transferAccNum, Typography.metricUnit]}>{virtualAccountNumber}</Text>
                    <MaterialIcons
                      name={copiedAccount ? 'check' : 'content-copy'}
                      size={18}
                      color={copiedAccount ? Colors.secondaryDark : Colors.primary}
                    />
                  </TouchableOpacity>
                </View>
                {copiedAccount && (
                  <Text style={[styles.copiedToast, Typography.labelCaps]}>Account number copied!</Text>
                )}
              </View>
            )}

            {/* Paystack secure badge */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32, gap: 6 }}>
              <MaterialCommunityIcons name="shield-check" size={16} color={Colors.textSecondary} />
              <Text style={{ fontSize: 11, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                Secured by Paystack
              </Text>
            </View>
          </ScrollView>

          <View style={styles.stickyFooter}>
            <TouchableOpacity style={styles.ctaBtn} onPress={handleConfirmFund}>
              <MaterialIcons name="lock" size={18} color={Colors.white} />
              <Text style={[styles.ctaBtnText, Typography.headlineMd]}>
                Pay ₦{amount.toLocaleString()} Now
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* STEP 3: PROCESSING */}
      {step === 'processing' && (
        <View style={styles.processingScreen}>
          <View style={styles.processingDecor1} />
          <View style={styles.processingDecor2} />
          <View style={styles.processingContent}>
            <View style={styles.processingSpinnerWrap}>
              <View style={styles.processingSpinnerTrack} />
              <View style={styles.processingInnerCircle}>
                <MaterialIcons name="account-balance-wallet" size={28} color={Colors.secondaryDark} />
              </View>
            </View>
            <Text style={[styles.processingTitle, Typography.headlineMd]}>Authorizing Payment</Text>
            <Text style={[styles.processingSubtitle, Typography.bodyMd]}>
              Securely crediting ₦{amount.toLocaleString()} to your wallet balance...
            </Text>
            <View style={styles.secureTag}>
              <MaterialIcons name="verified-user" size={14} color={Colors.secondary} />
              <Text style={[styles.secureTagText, Typography.labelCaps]}>256-Bit Encrypted</Text>
            </View>
          </View>
        </View>
      )}

      {/* STEP 4: SUCCESS */}
      {step === 'success' && (
        <View style={styles.successScreen}>
          <View style={styles.successContent}>
            <View style={styles.successIconCircle}>
              <MaterialIcons name="check" size={48} color={Colors.white} />
            </View>
            <Text style={[styles.successTitle, Typography.headlineLgMobile]}>Wallet Funded!</Text>
            <Text style={[styles.successSubtitle, Typography.bodyMd]}>
              ₦{amount.toLocaleString()} has been added to your balance.
            </Text>

            <View style={styles.successCard}>
              <View style={styles.successCardRow}>
                <Text style={[styles.successCardLabel, Typography.bodyMd]}>New Balance</Text>
                <Text style={[styles.successCardValue, Typography.headlineMd]}>
                  ₦{walletBalance.toLocaleString()}
                </Text>
              </View>
              <View style={styles.successCardDivider} />
              <View style={styles.successCardRow}>
                <Text style={[styles.successCardLabel, Typography.bodyMd]}>Transaction Ref</Text>
                <Text style={[styles.successCardRef, Typography.metricUnit]}>
                  {fundingRef || `WF-${Date.now()}`}
                </Text>
              </View>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={() => router.replace('/buy-electricity')}
              >
                <MaterialCommunityIcons name="lightning-bolt" size={20} color={Colors.white} />
                <Text style={[styles.primaryActionText, Typography.headlineMd]}>Buy Electricity Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryActionBtn}
                onPress={() => router.replace('/(tabs)/home')}
              >
                <Text style={[styles.secondaryActionText, Typography.headlineMd]}>Return to Home</Text>
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
        <SafeAreaView style={styles.paystackModalContainer}>
          <View style={styles.paystackModalHeader}>
            <TouchableOpacity onPress={handleClosePaystack} style={styles.paystackCloseBtn}>
              <MaterialIcons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
            <View style={styles.paystackHeaderTitleWrap}>
              <MaterialIcons name="lock" size={16} color={Colors.secondaryDark} />
              <Text style={[styles.paystackHeaderTitle, Typography.headlineMd]}>Paystack Checkout</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          {isPaystackLoading && (
            <View style={styles.paystackLoadingWrap}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={[styles.paystackLoadingText, Typography.bodyMd]}>Loading Paystack secure portal...</Text>
            </View>
          )}

          {paystackUrl ? (
            <WebView
              source={{ uri: paystackUrl }}
              style={styles.paystackWebView}
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
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    marginBottom: Spacing.lg,
  },
  balanceCardIcon: {
    width: 44,
    height: 44,
    borderRadius: Rounded.full,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceCardLabel: { color: Colors.textSecondary },
  balanceCardValue: { color: Colors.primary, marginTop: 2 },
  amountSection: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  amountLabel: { color: Colors.textSecondary, textTransform: 'uppercase', marginBottom: Spacing.sm },
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
  minNotice: { color: Colors.error, marginTop: Spacing.xs },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  presetBtn: {
    width: '47%',
    height: 48,
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
    height: 52,
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
  summaryCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  summaryLabel: { color: Colors.textSecondary },
  summaryAmount: { color: Colors.primary, marginTop: 4, fontSize: 32 },
  sectionTitle: { color: Colors.outline, marginBottom: Spacing.sm, paddingLeft: 4 },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    marginBottom: Spacing.sm,
  },
  methodCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceContainerLow,
  },
  methodIcon: {
    width: 42,
    height: 42,
    borderRadius: Rounded.full,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIconActive: {
    backgroundColor: Colors.primary,
  },
  methodTitle: { color: Colors.primary },
  methodSubtitle: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  transferBox: {
    backgroundColor: Colors.surface,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    borderColor: Colors.secondaryDark,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  transferBoxTitle: { color: Colors.secondaryDark },
  transferRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  transferLabel: { color: Colors.textSecondary, fontSize: 13 },
  transferValue: { color: Colors.text, fontSize: 14 },
  transferAccNum: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  copiedToast: { color: Colors.secondaryDark, fontSize: 11, marginTop: 4 },
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
  successScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    padding: Spacing.containerMargin,
  },
  successContent: { alignItems: 'center' },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: Rounded.full,
    backgroundColor: Colors.secondaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: Colors.secondaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  successTitle: { color: Colors.primary, marginBottom: Spacing.xs },
  successSubtitle: { color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },
  successCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    marginBottom: Spacing.xl,
  },
  successCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  successCardLabel: { color: Colors.textSecondary },
  successCardValue: { color: Colors.secondaryDark },
  successCardRef: { color: Colors.primary },
  successCardDivider: { height: 1, backgroundColor: Colors.outlineVariant, marginVertical: Spacing.md },
  actionButtons: { width: '100%', gap: Spacing.sm },
  primaryActionBtn: {
    height: 52,
    backgroundColor: Colors.secondaryDark,
    borderRadius: Rounded.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  primaryActionText: { color: Colors.white },
  secondaryActionBtn: {
    height: 52,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: { color: Colors.primary, fontSize: 16 },
  paystackModalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  paystackModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.containerMargin,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    backgroundColor: Colors.surface,
  },
  paystackCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paystackHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paystackHeaderTitle: {
    color: Colors.text,
  },
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
  paystackLoadingText: {
    color: Colors.textSecondary,
  },
  paystackWebView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
