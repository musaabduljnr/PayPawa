import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';
import { CustomAlert } from '@/context/AlertContext';
import {
  SupportService,
  SupportCategory,
  SupportPriority,
} from '@/services/support.service';

const CATEGORIES: { id: SupportCategory; label: string; icon: any }[] = [
  { id: 'ELECTRICITY_PURCHASE', label: 'Electricity Purchase', icon: 'flash' },
  { id: 'MISSING_TOKEN', label: 'Missing Token', icon: 'key-variant' },
  { id: 'FAILED_TRANSACTION', label: 'Failed Transaction', icon: 'alert-circle' },
  { id: 'WALLET_FUNDING', label: 'Wallet Funding', icon: 'wallet' },
  { id: 'REFUND_REVERSAL', label: 'Refund or Reversal', icon: 'cached' },
  { id: 'PENDING_TRANSACTION', label: 'Pending Transaction', icon: 'clock-outline' },
  { id: 'INCORRECT_BALANCE', label: 'Incorrect Balance', icon: 'scale-balance' },
  { id: 'METER_REGISTRATION', label: 'Meter Registration', icon: 'counter' },
  { id: 'METER_VERIFICATION', label: 'Meter Verification', icon: 'check-decagram' },
  { id: 'CONSUMPTION_ANALYTICS', label: 'Consumption Analytics', icon: 'chart-bell-curve' },
  { id: 'NOTIFICATIONS', label: 'Notifications', icon: 'bell-outline' },
  { id: 'ACCOUNT_SECURITY', label: 'Account & Security', icon: 'shield-lock-outline' },
  { id: 'APP_BUG', label: 'App Bug / Technical', icon: 'bug-outline' },
  { id: 'GENERAL_ENQUIRY', label: 'General Enquiry', icon: 'help-circle-outline' },
];

const PRIORITIES: { id: SupportPriority; label: string; color: string }[] = [
  { id: 'LOW', label: 'Low', color: '#64748b' },
  { id: 'MEDIUM', label: 'Medium', color: '#0284c7' },
  { id: 'HIGH', label: 'High', color: '#f59e0b' },
  { id: 'URGENT', label: 'Urgent', color: '#ef4444' },
];

export default function NewTicketScreen() {
  const { colors, isDark } = useTheme();
  const { meters, transactions, activeMeterId, refreshSupportCount } = useApp();
  const params = useLocalSearchParams<{
    category?: SupportCategory;
    subject?: string;
    ref?: string;
    meterId?: string;
  }>();

  const [category, setCategory] = useState<SupportCategory>(
    params.category || 'ELECTRICITY_PURCHASE'
  );
  const [priority, setPriority] = useState<SupportPriority>('MEDIUM');
  const [subject, setSubject] = useState(params.subject || '');
  const [description, setDescription] = useState('');
  const [selectedMeterId, setSelectedMeterId] = useState<string | null>(
    params.meterId || activeMeterId || null
  );
  const [selectedTxRef, setSelectedTxRef] = useState<string | null>(
    params.ref || null
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const activeMeter = meters.find((m) => m.id === selectedMeterId);

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (!subject.trim()) {
      setErrorMsg('Please enter a ticket subject.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Please provide a detailed description of your issue.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      const res = await SupportService.createTicket({
        category,
        priority,
        subject: subject.trim(),
        description: description.trim(),
        relatedMeterId: selectedMeterId,
        internalReference: selectedTxRef,
      });

      if (res.success && res.ticketId) {
        await refreshSupportCount?.();
        CustomAlert.alert(
          'Ticket Created',
          `Your ticket #${res.caseNumber || ''} has been submitted to PayPawa Support. A representative will reply shortly.`,
          [
            {
              text: 'View Conversation',
              style: 'default',
              onPress: () => {
                router.replace(`/support/${res.ticketId}` as any);
              },
            },
          ],
          { type: 'success' }
        );
      } else {
        setErrorMsg(res.error || 'Unable to submit ticket. Please try again.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'An error occurred while contacting support.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.outlineVariant }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.surfaceContainer }]}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, Typography.headlineMd, { color: colors.text }]}>
          Submit Support Ticket
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {errorMsg ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.errorBg }]}>
            <MaterialIcons name="error" size={18} color={colors.error} />
            <Text style={[styles.errorBannerText, { color: colors.error }]}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Category Picker */}
        <Text style={[styles.fieldLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
          Select Category
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesRow}>
          {CATEGORIES.map((cat) => {
            const isSelected = category === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isSelected
                      ? (isDark ? colors.secondary : colors.primary)
                      : colors.outlineVariant,
                  },
                  isSelected && {
                    backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainerLow,
                  },
                ]}
                onPress={() => setCategory(cat.id)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={cat.icon}
                  size={20}
                  color={isSelected ? (isDark ? colors.secondary : colors.primary) : colors.outline}
                />
                <Text
                  style={[
                    styles.categoryLabel,
                    Typography.metricUnit,
                    {
                      color: isSelected
                        ? (isDark ? colors.secondary : colors.primary)
                        : colors.text,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Priority Selector */}
        <Text style={[styles.fieldLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
          Priority Level
        </Text>
        <View style={styles.prioritiesRow}>
          {PRIORITIES.map((p) => {
            const isSelected = priority === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.priorityBtn,
                  {
                    borderColor: isSelected ? p.color : colors.outlineVariant,
                    backgroundColor: isSelected ? `${p.color}15` : colors.surface,
                  },
                ]}
                onPress={() => setPriority(p.id)}
              >
                <View style={[styles.priorityDot, { backgroundColor: p.color }]} />
                <Text
                  style={[
                    styles.priorityBtnText,
                    Typography.labelCaps,
                    { color: isSelected ? p.color : colors.textSecondary, fontWeight: isSelected ? '700' : '500' },
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Subject Input */}
        <Text style={[styles.fieldLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
          Subject / Summary
        </Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.surface, borderColor: colors.outlineVariant, color: colors.text },
          ]}
          placeholder="e.g., Token not generated after purchase"
          placeholderTextColor={colors.outline}
          value={subject}
          onChangeText={setSubject}
          maxLength={100}
        />

        {/* Description Text Area */}
        <Text style={[styles.fieldLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
          Detailed Description
        </Text>
        <TextInput
          style={[
            styles.textArea,
            { backgroundColor: colors.surface, borderColor: colors.outlineVariant, color: colors.text },
          ]}
          placeholder="Describe what happened, including any error messages you saw..."
          placeholderTextColor={colors.outline}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          maxLength={1000}
        />

        {/* Optional Linked Meter */}
        <Text style={[styles.fieldLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
          Related Meter (Optional)
        </Text>
        <View style={styles.pillListWrap}>
          <TouchableOpacity
            style={[
              styles.meterPill,
              {
                backgroundColor: selectedMeterId === null
                  ? (isDark ? colors.secondary : colors.primary)
                  : colors.surface,
                borderColor: colors.outlineVariant,
              },
            ]}
            onPress={() => setSelectedMeterId(null)}
          >
            <Text
              style={[
                styles.meterPillText,
                Typography.labelCaps,
                { color: selectedMeterId === null ? (isDark ? colors.background : colors.white) : colors.text },
              ]}
            >
              None
            </Text>
          </TouchableOpacity>
          {meters.map((m) => {
            const isSelected = selectedMeterId === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.meterPill,
                  {
                    backgroundColor: isSelected
                      ? (isDark ? colors.secondary : colors.primary)
                      : colors.surface,
                    borderColor: isSelected
                      ? (isDark ? colors.secondary : colors.primary)
                      : colors.outlineVariant,
                  },
                ]}
                onPress={() => setSelectedMeterId(m.id)}
              >
                <Text
                  style={[
                    styles.meterPillText,
                    Typography.labelCaps,
                    { color: isSelected ? (isDark ? colors.background : colors.white) : colors.text },
                  ]}
                >
                  {m.name} (••••{m.number.slice(-4)})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Optional Linked Transaction */}
        {transactions.length > 0 && (
          <>
            <Text style={[styles.fieldLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
              Related Transaction (Optional)
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.txListRow}>
              <TouchableOpacity
                style={[
                  styles.txSelectCard,
                  {
                    backgroundColor: selectedTxRef === null
                      ? (isDark ? colors.secondary : colors.primary)
                      : colors.surface,
                    borderColor: colors.outlineVariant,
                  },
                ]}
                onPress={() => setSelectedTxRef(null)}
              >
                <Text
                  style={[
                    styles.txSelectCardTitle,
                    Typography.labelCaps,
                    { color: selectedTxRef === null ? (isDark ? colors.background : colors.white) : colors.text },
                  ]}
                >
                  No Transaction
                </Text>
              </TouchableOpacity>
              {transactions.slice(0, 5).map((tx) => {
                const isSelected = selectedTxRef === tx.reference;
                return (
                  <TouchableOpacity
                    key={tx.id || tx.reference}
                    style={[
                      styles.txSelectCard,
                      {
                        backgroundColor: isSelected
                          ? (isDark ? colors.secondary : colors.primary)
                          : colors.surface,
                        borderColor: isSelected
                          ? (isDark ? colors.secondary : colors.primary)
                          : colors.outlineVariant,
                      },
                    ]}
                    onPress={() => setSelectedTxRef(tx.reference || null)}
                  >
                    <Text
                      style={[
                        styles.txSelectCardTitle,
                        Typography.labelCaps,
                        { color: isSelected ? (isDark ? colors.background : colors.white) : colors.text },
                      ]}
                    >
                      ₦{Number(tx.amount || 0).toLocaleString()} • {tx.type}
                    </Text>
                    <Text
                      style={[
                        styles.txSelectCardSub,
                        Typography.labelCaps,
                        { color: isSelected ? (isDark ? colors.background : colors.white) : colors.outline },
                      ]}
                    >
                      {tx.reference ? `Ref: ${tx.reference.slice(-8)}` : 'Completed'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}
      </ScrollView>

      {/* Submit Sticky Footer */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.outlineVariant }]}>
        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: isDark ? colors.secondary : colors.primary },
            isSubmitting && { opacity: 0.5 },
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={isDark ? colors.background : colors.white} />
          ) : (
            <>
              <MaterialIcons name="send" size={20} color={isDark ? colors.background : colors.white} />
              <Text
                style={[
                  styles.submitBtnText,
                  Typography.headlineMd,
                  { color: isDark ? colors.background : colors.white },
                ]}
              >
                Submit Ticket
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
  topBarTitle: { fontSize: 18 },
  scrollContent: {
    padding: Spacing.containerMargin,
    paddingBottom: 120,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Rounded.default,
    marginBottom: Spacing.md,
  },
  errorBannerText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
    letterSpacing: 1,
  },
  categoriesRow: {
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Rounded.default,
    borderWidth: 1,
  },
  categoryLabel: {
    fontSize: 13,
  },
  prioritiesRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  priorityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: Rounded.default,
    borderWidth: 1,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityBtnText: {
    fontSize: 11,
  },
  input: {
    borderWidth: 1,
    borderRadius: Rounded.default,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: Rounded.default,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    minHeight: 110,
  },
  pillListWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  meterPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Rounded.full,
    borderWidth: 1,
  },
  meterPillText: {
    fontSize: 11,
  },
  txListRow: {
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  txSelectCard: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Rounded.default,
    borderWidth: 1,
  },
  txSelectCardTitle: {
    fontSize: 12,
  },
  txSelectCardSub: {
    fontSize: 10,
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.containerMargin,
    borderTopWidth: 1,
  },
  submitBtn: {
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
  submitBtnText: {},
});
