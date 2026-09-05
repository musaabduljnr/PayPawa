import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import type { AccountTypeEnum } from '@/types/auth';
import { useTheme } from '@/context/ThemeContext';
import { CustomAlert } from '@/context/AlertContext';

export default function PersonalInfoScreen() {
  const {
    user,
    userProfile,
    userName,
    userEmail,
    userPhone,
    accountType,
    updateProfile,
    energyProfile,
    activeMeter,
    meters,
    activeMeterId,
    refreshProfile,
  } = useApp();
  const { colors, isDark } = useTheme();

  // Active meter lookup
  const active = activeMeter || meters.find((m) => m.id === activeMeterId) || meters[0];

  // Initial user values
  const initialName = userProfile?.full_name || userName || '';
  const initialEmail = userProfile?.email || user?.email || userEmail || '';
  const initialPhone = userProfile?.phone || (userProfile as any)?.phone_number || userPhone || '';
  const initialAccountType = (userProfile?.account_type as AccountTypeEnum) || accountType || 'household';

  // Form states
  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [selectedAccountType, setSelectedAccountType] = useState<AccountTypeEnum>(initialAccountType);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync state if profile changes
  useEffect(() => {
    setFullName(userProfile?.full_name || userName || '');
    setPhone(userProfile?.phone || (userProfile as any)?.phone_number || userPhone || '');
    setSelectedAccountType((userProfile?.account_type as AccountTypeEnum) || accountType || 'household');
  }, [userProfile, userName, userPhone, accountType]);

  // Track unsaved modifications
  useEffect(() => {
    const nameChanged = fullName.trim() !== initialName.trim();
    const phoneChanged = phone.trim() !== initialPhone.trim();
    const typeChanged = selectedAccountType !== initialAccountType;
    setHasChanges(nameChanged || phoneChanged || typeChanged);
  }, [fullName, phone, selectedAccountType, initialName, initialPhone, initialAccountType]);

  // Initials generator
  const initials = (fullName || 'PayPawa User')
    .split(' ')
    .filter(Boolean)
    .map((n) => n.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'P';

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : 'Recent Member';

  const handleSave = async () => {
    if (!fullName.trim()) {
      CustomAlert.alert('Validation Required', 'Please enter your full name.', [{ text: 'OK', style: 'default' }], {
        type: 'error',
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateProfile(
        fullName.trim(),
        initialEmail,
        phone.trim() || undefined,
        selectedAccountType
      );

      if (res.success) {
        await refreshProfile().catch(() => {});
        setHasChanges(false);
        CustomAlert.alert(
          'Profile Updated',
          'Your personal information has been successfully saved.',
          [{ text: 'Great!', style: 'default' }],
          { type: 'success' }
        );
      } else {
        CustomAlert.alert(
          'Update Failed',
          res.error || 'Failed to update your personal details. Please try again.',
          [{ text: 'OK', style: 'default' }],
          { type: 'error' }
        );
      }
    } catch (err: any) {
      CustomAlert.alert(
        'Update Error',
        err?.message || 'An unexpected error occurred.',
        [{ text: 'OK', style: 'default' }],
        { type: 'error' }
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (hasChanges) {
      CustomAlert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to revert them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setFullName(initialName);
              setPhone(initialPhone);
              setSelectedAccountType(initialAccountType);
              setHasChanges(false);
            },
          },
        ],
        { type: 'confirm' }
      );
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.outlineVariant }]}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.surfaceContainerHighest }]}
            onPress={() => {
              if (hasChanges) {
                CustomAlert.alert(
                  'Unsaved Changes',
                  'You have unsaved changes. Do you want to leave without saving?',
                  [
                    { text: 'Stay', style: 'cancel' },
                    { text: 'Leave', style: 'destructive', onPress: () => router.back() },
                  ],
                  { type: 'confirm' }
                );
              } else {
                router.back();
              }
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={22} color={colors.primary} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, Typography.headlineMd, { color: colors.primary }]}>
            Personal Information
          </Text>

          {hasChanges ? (
            <TouchableOpacity
              style={[styles.headerActionBtn, { backgroundColor: colors.secondary }]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.headerActionText, Typography.labelCaps, { color: colors.primary }]}>
                  Save
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar Hero Card */}
          <View style={[styles.avatarHero, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.primary, borderColor: colors.secondary }]}>
              <Text style={[styles.avatarText, Typography.headlineLg, { color: isDark ? colors.background : colors.white }]}>
                {initials}
              </Text>
              <View style={[styles.verifiedBadge, { backgroundColor: colors.secondary }]}>
                <MaterialIcons name="check" size={14} color={colors.primary} />
              </View>
            </View>

            <Text style={[styles.profileHeroName, Typography.headlineLgMobile, { color: colors.primary }]}>
              {fullName || 'PayPawa Customer'}
            </Text>
            <Text style={[styles.profileHeroEmail, Typography.bodyMd, { color: colors.textSecondary }]}>
              {initialEmail}
            </Text>

            <View style={styles.badgeRow}>
              <View style={[styles.statusPill, { backgroundColor: 'rgba(132,204,22,0.15)' }]}>
                <Ionicons name="shield-checkmark" size={14} color={colors.secondaryDark} />
                <Text style={[styles.statusPillText, Typography.labelCaps, { color: colors.secondaryDark }]}>
                  Verified Identity
                </Text>
              </View>

              <View style={[styles.statusPill, { backgroundColor: colors.surfaceContainerHigh }]}>
                <MaterialIcons name="calendar-today" size={13} color={colors.outline} />
                <Text style={[styles.statusPillText, Typography.labelCaps, { color: colors.outline }]}>
                  Since {memberSince}
                </Text>
              </View>
            </View>
          </View>

          {/* Form Section: Basic Info */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, Typography.labelCaps, { color: colors.outline }]}>
              Basic Details
            </Text>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              {/* Full Name */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                  Full Name
                </Text>
                <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: colors.outlineVariant }]}>
                  <MaterialIcons name="person-outline" size={20} color={colors.outline} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.primary }]}
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Enter your legal full name"
                    placeholderTextColor={colors.outline}
                    autoCapitalize="words"
                  />
                  {fullName.trim().length > 0 && (
                    <MaterialIcons name="check-circle" size={18} color={colors.secondaryDark} />
                  )}
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

              {/* Email (Read-Only with security tag) */}
              <View style={styles.fieldGroup}>
                <View style={styles.labelWithTag}>
                  <Text style={[styles.fieldLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                    Email Address
                  </Text>
                  <View style={[styles.lockTag, { backgroundColor: colors.surfaceContainerHighest }]}>
                    <MaterialIcons name="lock-outline" size={11} color={colors.outline} />
                    <Text style={[styles.lockTagText, { color: colors.outline }]}>Primary Account</Text>
                  </View>
                </View>
                <View style={[styles.inputWrapper, styles.inputDisabled, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
                  <MaterialIcons name="mail-outline" size={20} color={colors.outline} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.textSecondary }]}
                    value={initialEmail}
                    editable={false}
                    selectTextOnFocus={false}
                  />
                  <MaterialIcons name="verified-user" size={18} color={colors.secondaryDark} />
                </View>
                <Text style={[styles.fieldHint, { color: colors.outline }]}>
                  Email is linked to your PayPawa authentication security.
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

              {/* Phone Number */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, Typography.labelCaps, { color: colors.textSecondary }]}>
                  Phone Number
                </Text>
                <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: colors.outlineVariant }]}>
                  <MaterialIcons name="phone-iphone" size={20} color={colors.outline} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.primary }]}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="e.g. 08012345678"
                    placeholderTextColor={colors.outline}
                    keyboardType="phone-pad"
                  />
                </View>
                <Text style={[styles.fieldHint, { color: colors.outline }]}>
                  Used for instant SMS token delivery and emergency low-power alerts.
                </Text>
              </View>
            </View>
          </View>

          {/* Account Type Tier Selector */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, Typography.labelCaps, { color: colors.outline }]}>
              Account Classification
            </Text>

            <View style={styles.accountTypeRow}>
              {/* Household Option */}
              <TouchableOpacity
                style={[
                  styles.accountTypeCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor:
                      selectedAccountType === 'household' ? colors.secondary : colors.outlineVariant,
                    borderWidth: selectedAccountType === 'household' ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedAccountType('household')}
                activeOpacity={0.8}
              >
                <View style={styles.accountTypeHeader}>
                  <View
                    style={[
                      styles.accountTypeIconWrap,
                      {
                        backgroundColor:
                          selectedAccountType === 'household'
                            ? 'rgba(132,204,22,0.15)'
                            : colors.surfaceContainerHigh,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="home-outline"
                      size={24}
                      color={selectedAccountType === 'household' ? colors.secondaryDark : colors.outline}
                    />
                  </View>
                  {selectedAccountType === 'household' && (
                    <MaterialIcons name="radio-button-checked" size={20} color={colors.secondary} />
                  )}
                  {selectedAccountType !== 'household' && (
                    <MaterialIcons name="radio-button-unchecked" size={20} color={colors.outline} />
                  )}
                </View>

                <Text style={[styles.accountTypeName, Typography.headlineMd, { color: colors.primary }]}>
                  Household
                </Text>
                <Text style={[styles.accountTypeDesc, { color: colors.textSecondary }]}>
                  Optimized for private residences, families, and single apartments.
                </Text>
              </TouchableOpacity>

              {/* Business Option */}
              <TouchableOpacity
                style={[
                  styles.accountTypeCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor:
                      selectedAccountType === 'business' ? colors.secondary : colors.outlineVariant,
                    borderWidth: selectedAccountType === 'business' ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedAccountType('business')}
                activeOpacity={0.8}
              >
                <View style={styles.accountTypeHeader}>
                  <View
                    style={[
                      styles.accountTypeIconWrap,
                      {
                        backgroundColor:
                          selectedAccountType === 'business'
                            ? 'rgba(132,204,22,0.15)'
                            : colors.surfaceContainerHigh,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="domain"
                      size={24}
                      color={selectedAccountType === 'business' ? colors.secondaryDark : colors.outline}
                    />
                  </View>
                  {selectedAccountType === 'business' && (
                    <MaterialIcons name="radio-button-checked" size={20} color={colors.secondary} />
                  )}
                  {selectedAccountType !== 'business' && (
                    <MaterialIcons name="radio-button-unchecked" size={20} color={colors.outline} />
                  )}
                </View>

                <Text style={[styles.accountTypeName, Typography.headlineMd, { color: colors.primary }]}>
                  Business
                </Text>
                <Text style={[styles.accountTypeDesc, { color: colors.textSecondary }]}>
                  Tailored for commercial properties, offices, multi-tenant setups & tax receipts.
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Connected Electricity Details */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderWithLink}>
              <Text style={[styles.sectionTitle, Typography.labelCaps, { color: colors.outline }]}>
                Primary Electricity Meter
              </Text>
              <TouchableOpacity onPress={() => router.push('/manage-meters')} activeOpacity={0.7}>
                <Text style={[styles.sectionActionText, Typography.labelCaps, { color: colors.secondaryDark }]}>
                  Manage All ({meters.length})
                </Text>
              </TouchableOpacity>
            </View>

            {active ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
                <View style={styles.meterInfoRow}>
                  <View style={[styles.meterIconBox, { backgroundColor: 'rgba(132,204,22,0.15)' }]}>
                    <MaterialCommunityIcons name="lightning-bolt" size={24} color={colors.secondaryDark} />
                  </View>
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <Text style={[styles.meterTitle, Typography.headlineMd, { color: colors.primary }]}>
                      {active.name}
                    </Text>
                    <Text style={[styles.meterSubtitle, Typography.labelCaps, { color: colors.outline }]}>
                      {active.disco} • {active.number}
                    </Text>
                    <Text style={[styles.meterAddress, { color: colors.textSecondary }]} numberOfLines={1}>
                      {active.address || 'Address registered'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.emptyMeterBox, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
                onPress={() => router.push('/add-meter')}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={24} color={colors.secondaryDark} />
                <Text style={[styles.emptyMeterText, Typography.metricUnit, { color: colors.primary }]}>
                  Link an Electricity Meter
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Energy Intelligence & Household Profile */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderWithLink}>
              <Text style={[styles.sectionTitle, Typography.labelCaps, { color: colors.outline }]}>
                Energy & Appliance Setup
              </Text>
              <TouchableOpacity onPress={() => router.push('/energy-setup')} activeOpacity={0.7}>
                <Text style={[styles.sectionActionText, Typography.labelCaps, { color: colors.secondaryDark }]}>
                  Update Profile
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <View style={styles.energyProfileGrid}>
                <View style={styles.energyGridItem}>
                  <MaterialIcons name="people-outline" size={18} color={colors.outline} />
                  <Text style={[styles.energyGridLabel, Typography.labelCaps, { color: colors.outline }]}>Occupants</Text>
                  <Text style={[styles.energyGridValue, Typography.metricUnit, { color: colors.primary }]}>
                    {energyProfile?.occupants_count || 1} Person(s)
                  </Text>
                </View>

                <View style={styles.energyGridItem}>
                  <MaterialCommunityIcons name="solar-power-variant-outline" size={18} color={colors.outline} />
                  <Text style={[styles.energyGridLabel, Typography.labelCaps, { color: colors.outline }]}>Backup Power</Text>
                  <Text style={[styles.energyGridValue, Typography.metricUnit, { color: colors.primary }]}>
                    {energyProfile?.has_solar ? 'Solar' : energyProfile?.has_generator ? 'Gen' : 'Grid'}
                  </Text>
                </View>

                <View style={styles.energyGridItem}>
                  <MaterialIcons name="restaurant" size={18} color={colors.outline} />
                  <Text style={[styles.energyGridLabel, Typography.labelCaps, { color: colors.outline }]}>Cooking</Text>
                  <Text style={[styles.energyGridValue, Typography.metricUnit, { color: colors.primary }]}>
                    {energyProfile?.primary_cooking_source || 'Gas / Electric'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Security & Data Privacy Notice */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, Typography.labelCaps, { color: colors.outline }]}>
              Security & Privacy
            </Text>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <View style={styles.securityRow}>
                <View style={[styles.securityIconWrap, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <MaterialIcons name="shield" size={20} color={colors.secondaryDark} />
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={[styles.securityTitle, Typography.metricUnit, { color: colors.primary }]}>
                    Encrypted Cloud Storage
                  </Text>
                  <Text style={[styles.securityBody, { color: colors.textSecondary }]}>
                    Your personal information and utility vending tokens are protected by Supabase Row Level Security and 256-bit encryption.
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Bottom Save / Discard Bar */}
          {hasChanges && (
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={[styles.discardBtn, { borderColor: colors.outlineVariant }]}
                onPress={handleDiscard}
                activeOpacity={0.7}
              >
                <Text style={[styles.discardBtnText, Typography.metricUnit, { color: colors.textSecondary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.secondary }]}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <MaterialIcons name="save" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={[styles.saveBtnText, Typography.metricUnit, { color: colors.primary, fontWeight: '700' }]}>
                      Save Changes
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerActionBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Rounded.full,
  },
  headerActionText: {
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl + Spacing.md,
  },
  avatarHero: {
    borderRadius: Rounded.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    position: 'relative',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  profileHeroName: {
    marginBottom: 4,
  },
  profileHeroEmail: {
    marginBottom: Spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Rounded.full,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.xs + 2,
    marginLeft: Spacing.xs,
    letterSpacing: 0.5,
  },
  sectionHeaderWithLink: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs + 2,
    paddingHorizontal: Spacing.xs,
  },
  sectionActionText: {
    fontWeight: '600',
  },
  card: {
    borderRadius: Rounded.lg,
    padding: Spacing.lg,
    borderWidth: 1,
  },
  fieldGroup: {
    paddingVertical: Spacing.xs,
  },
  fieldLabel: {
    marginBottom: Spacing.xs,
    letterSpacing: 0.3,
  },
  labelWithTag: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  lockTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: Rounded.sm,
  },
  lockTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Rounded.md,
    paddingHorizontal: Spacing.md,
    height: 48,
  },
  inputDisabled: {
    opacity: 0.85,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  fieldHint: {
    marginTop: Spacing.xs,
    fontSize: 12,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.md,
  },
  accountTypeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  accountTypeCard: {
    flex: 1,
    borderRadius: Rounded.lg,
    padding: Spacing.md,
    justifyContent: 'space-between',
    minHeight: 130,
  },
  accountTypeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  accountTypeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Rounded.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountTypeName: {
    fontSize: 16,
    marginBottom: 4,
  },
  accountTypeDesc: {
    lineHeight: 16,
  },
  meterInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meterIconBox: {
    width: 46,
    height: 46,
    borderRadius: Rounded.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meterTitle: {
    fontSize: 16,
  },
  meterSubtitle: {
    fontSize: 12,
    marginVertical: 2,
  },
  meterAddress: {
    fontSize: 12,
  },
  emptyMeterBox: {
    borderRadius: Rounded.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  emptyMeterText: {
    fontSize: 15,
  },
  energyProfileGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  energyGridItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  energyGridLabel: {
    fontSize: 10,
    marginTop: 4,
    marginBottom: 2,
  },
  energyGridValue: {
    fontSize: 13,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  securityIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  securityTitle: {
    fontSize: 15,
    marginBottom: 4,
  },
  securityBody: {
    lineHeight: 18,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  discardBtn: {
    flex: 1,
    height: 48,
    borderRadius: Rounded.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardBtnText: {
    fontSize: 14,
  },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: Rounded.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 15,
  },
});
