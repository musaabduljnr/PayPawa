import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';
import { CustomAlert } from '@/context/AlertContext';
import { AuthService } from '@/services/auth.service';
import type { AccountTypeEnum } from '@/types/auth';

export default function ProfileScreen() {
  const {
    userName,
    userEmail,
    userPhone,
    accountType,
    userProfile,
    energyProfile,
    appliances,
    meters,
    logout,
    deleteMeter,
    selectMeter,
    activeMeterId,
    activeMeter,
    updateProfile,
    notificationPreferences,
    updateNotificationPreferences,
    unreadSupportCount,
  } = useApp();
  const { isDark, toggleTheme, colors } = useTheme();

  // Edit Profile Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState(userName);
  const [editPhone, setEditPhone] = useState(userPhone);
  const [editAccountType, setEditAccountType] = useState<AccountTypeEnum>(accountType || 'household');
  const [savingProfile, setSavingProfile] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // App-Store Compliance & Support Modals State
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [legalModalVisible, setLegalModalVisible] = useState(false);
  const [legalModalType, setLegalModalType] = useState<'terms' | 'privacy'>('terms');
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const active = activeMeter || meters.find((m) => m.id === activeMeterId) || meters[0];
  const displayName = userProfile?.full_name || active?.customerName || userName;
  const displayEmail = userProfile?.email || userEmail;
  const initials = displayName
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleOpenEdit = () => {
    setEditName(displayName);
    setEditPhone(userPhone || userProfile?.phone || '');
    setEditAccountType(userProfile?.account_type || accountType || 'household');
    setEditModalVisible(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      CustomAlert.alert('Validation Error', 'Full Name cannot be empty', [{ text: 'OK', style: 'default' }], { type: 'error' });
      return;
    }

    setSavingProfile(true);
    try {
      const res = await updateProfile(
        editName.trim(),
        displayEmail,
        editPhone.trim() || undefined,
        editAccountType
      );

      if (res.success) {
        setEditModalVisible(false);
      } else {
        CustomAlert.alert('Save Failed', res.error || 'Failed to update profile.', [{ text: 'OK', style: 'default' }], { type: 'error' });
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const executeLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace('/onboarding');
    } catch (err) {
      console.warn('Logout error:', err);
      router.replace('/onboarding');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleLogout = () => {
    CustomAlert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: executeLogout,
        },
      ],
      { type: 'confirm' }
    );
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      CustomAlert.alert(
        'Confirmation Required',
        'Please type DELETE in the box below to authorize permanent account closure.',
        [{ text: 'OK', style: 'default' }],
        { type: 'error' }
      );
      return;
    }

    if (!userProfile?.id) return;
    setDeletingAccount(true);
    try {
      const res = await AuthService.requestAccountDeletion(userProfile.id, 'User requested in-app account deletion');
      if (res.success) {
        setDeleteModalVisible(false);
        CustomAlert.alert(
          'Account Closed',
          'Your account closure request has been submitted and your session has ended.',
          [{ text: 'OK', style: 'default', onPress: () => router.replace('/onboarding') }],
          { type: 'success' }
        );
      } else {
        CustomAlert.alert('Request Failed', res.error || 'Unable to process account deletion.', [{ text: 'OK', style: 'default' }], { type: 'error' });
      }
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleDeleteMeter = (id: string, name: string) => {
    CustomAlert.alert(
      'Remove Meter',
      `Remove "${name}" from your account? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => deleteMeter(id) },
      ],
      { type: 'confirm' }
    );
  };

  const ToggleRow = ({
    label,
    sublabel,
    value,
    onValueChange,
  }: {
    label: string;
    sublabel: string;
    value: boolean;
    onValueChange: (v: boolean) => void;
  }) => (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: Spacing.sm }}>
        <Text style={[styles.toggleLabel, Typography.metricUnit, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.toggleSublabel, Typography.labelCaps, { color: colors.outline }]}>{sublabel}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.outlineVariant, true: colors.secondary }}
        thumbColor={colors.white}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.pageTitle, Typography.headlineLgMobile, { color: colors.primary }]}>Profile</Text>
        </View>

        {/* Profile Hero */}
        <View style={[styles.profileHero, { borderBottomColor: colors.outlineVariant }]}>
          <TouchableOpacity
            style={[styles.avatarCircle, { backgroundColor: colors.primary, borderColor: colors.surface }]}
            onPress={() => router.push('/personal-info')}
            activeOpacity={0.8}
          >
            <Text style={[styles.avatarText, Typography.headlineLg, { color: isDark ? colors.background : colors.white }]}>
              {initials}
            </Text>
            <View style={[styles.avatarEditBadge, { backgroundColor: colors.secondary }]}>
              <MaterialIcons name="edit" size={12} color={colors.primary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/personal-info')} activeOpacity={0.8} style={{ alignItems: 'center' }}>
            <Text style={[styles.profileName, Typography.headlineMd, { color: colors.primary }]}>{displayName}</Text>
            <Text style={[styles.profileEmail, Typography.bodyMd, { color: colors.textSecondary }]}>{displayEmail}</Text>
          </TouchableOpacity>
          <View style={styles.heroBadgeRow}>
            <View style={[styles.accountTypeBadge, { backgroundColor: 'rgba(132,204,22,0.15)' }]}>
              <MaterialCommunityIcons
                name={accountType === 'business' ? 'domain' : 'home-outline'}
                size={14}
                color={colors.secondaryDark}
              />
              <Text style={[styles.heroMeterText, Typography.labelCaps, { color: colors.secondaryDark }]}>
                {accountType === 'business' ? 'Business Account' : 'Household Account'}
              </Text>
            </View>
            {active && (
              <View style={styles.heroMeterBadge}>
                <MaterialCommunityIcons name="lightning-bolt" size={12} color={colors.secondaryDark} />
                <Text style={[styles.heroMeterText, Typography.labelCaps, { color: colors.secondaryDark }]}>
                  {active.name} • {active.disco}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Active Meter Utility Profile */}
        {active && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionLabel, Typography.labelCaps, { color: colors.outline }]}>
                Active Meter Details
              </Text>
              <TouchableOpacity onPress={() => router.push('/manage-meters')}>
                <Text style={[styles.addLink, Typography.labelCaps, { color: colors.secondaryDark }]}>
                  Switch Meter
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.activeCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <View style={styles.activeCardHeader}>
                <View style={[styles.meterIconWrap, { backgroundColor: 'rgba(132,204,22,0.15)' }]}>
                  <MaterialCommunityIcons name="lightning-bolt" size={22} color={colors.secondaryDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.activeCardTitle, Typography.headlineMd, { color: colors.primary }]}>
                    {active.name}
                  </Text>
                  <Text style={[styles.activeCardSubtitle, Typography.labelCaps, { color: colors.outline }]}>
                    {active.disco}
                  </Text>
                </View>
                <View style={[styles.activePill, { backgroundColor: 'rgba(132,204,22,0.15)' }]}>
                  <Text style={[styles.activePillText, Typography.labelCaps, { color: colors.secondaryDark }]}>
                    Active
                  </Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.outlineVariant, marginHorizontal: Spacing.md }]} />

              <View style={styles.activeDetailsGrid}>
                <View style={styles.gridItem}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>
                    Registered Name
                  </Text>
                  <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.text }]} numberOfLines={1}>
                    {active.customerName || displayName}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>
                    Meter Number
                  </Text>
                  <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.text }]} numberOfLines={1}>
                    {active.number}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>
                    Tariff Class
                  </Text>
                  <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.text }]} numberOfLines={1}>
                    {active.tariffCode || 'Band A (Prepaid)'}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>
                    Account Status
                  </Text>
                  <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.secondaryDark }]} numberOfLines={1}>
                    Verified & Active
                  </Text>
                </View>

                <View style={[styles.gridItem, { width: '100%' }]}>
                  <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>
                    Service Address
                  </Text>
                  <Text style={[styles.detailAddress, Typography.bodyMd, { color: colors.textSecondary }]}>
                    {active.address}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Energy & Appliance Profile Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, Typography.labelCaps, { color: colors.outline }]}>
              Energy & Appliance Profile
            </Text>
            <TouchableOpacity onPress={() => router.push('/energy-setup')}>
              <Text style={[styles.addLink, Typography.labelCaps, { color: colors.secondaryDark }]}>
                Re-profile
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.activeCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
            <View style={styles.activeDetailsGrid}>
              <View style={styles.gridItem}>
                <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>Category</Text>
                <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.text }]}>
                  {energyProfile?.account_type === 'business' ? 'Business' : 'Household'}
                </Text>
              </View>

              <View style={styles.gridItem}>
                <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>Occupants / Users</Text>
                <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.text }]}>
                  {energyProfile?.occupants_count || 1} person(s)
                </Text>
              </View>

              <View style={styles.gridItem}>
                <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>Appliances</Text>
                <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.text }]}>
                  {appliances.length > 0 ? `${appliances.length} items logged` : 'Default Profile'}
                </Text>
              </View>

              <View style={styles.gridItem}>
                <Text style={[styles.detailLabel, Typography.labelCaps, { color: colors.outline }]}>Backup Power</Text>
                <Text style={[styles.detailValue, Typography.metricUnit, { color: colors.text }]}>
                  {energyProfile?.has_solar && energyProfile?.has_generator
                    ? 'Solar + Generator'
                    : energyProfile?.has_solar
                    ? 'Solar Inverter'
                    : energyProfile?.has_generator
                    ? 'Generator'
                    : 'Grid Only'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, Typography.labelCaps, { color: colors.outline }]}>Account</Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
            <TouchableOpacity style={styles.listItem} onPress={() => router.push('/personal-info')} activeOpacity={0.7}>
              <MaterialIcons name="person-outline" size={22} color={colors.outline} />
              <Text style={[styles.listItemText, Typography.metricUnit, { color: colors.text }]}>Personal Information</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.outline} style={styles.chevron} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
            <TouchableOpacity
              style={styles.listItem}
              onPress={() => router.push('/manage-meters')}
              activeOpacity={0.7}
            >
              <MaterialIcons name="electrical-services" size={22} color={colors.outline} />
              <Text style={[styles.listItemText, Typography.metricUnit, { color: colors.text }]}>Manage Meters</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.outline} style={styles.chevron} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Meters Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, Typography.labelCaps, { color: colors.outline }]}>My Meters</Text>
            <TouchableOpacity onPress={() => router.push('/add-meter')}>
              <Text style={[styles.addLink, Typography.labelCaps, { color: colors.secondaryDark }]}>+ Add Meter</Text>
            </TouchableOpacity>
          </View>
          {meters.length === 0 ? (
            <View style={[styles.emptyMeters, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <MaterialCommunityIcons name="lightning-bolt-outline" size={32} color={colors.outlineVariant} />
              <Text style={[styles.emptyText, Typography.bodyMd, { color: colors.textSecondary }]}>No meters added yet</Text>
            </View>
          ) : (
            <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              {meters.map((meter, i) => (
                <React.Fragment key={meter.id}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />}
                  <TouchableOpacity
                    style={styles.meterItem}
                    onPress={() => selectMeter(meter.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.meterIconWrap,
                        {
                          backgroundColor:
                            activeMeterId === meter.id
                              ? 'rgba(132,204,22,0.15)'
                              : colors.surfaceContainerHigh,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="lightning-bolt"
                        size={20}
                        color={activeMeterId === meter.id ? colors.secondaryDark : colors.outline}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.meterName, Typography.metricUnit, { color: colors.primary }]}>{meter.name}</Text>
                      <Text style={[styles.meterDisco, Typography.labelCaps, { color: colors.outline }]}>{meter.disco}</Text>
                      <Text style={[styles.meterNumber, Typography.labelCaps, { color: colors.textSecondary }]}>
                        ••••{meter.number.replace(/\s/g, '').slice(-4)}
                      </Text>
                    </View>
                    {activeMeterId === meter.id && (
                      <View style={[styles.activePill, { backgroundColor: 'rgba(132,204,22,0.15)' }]}>
                        <Text style={[styles.activePillText, Typography.labelCaps, { color: colors.secondaryDark }]}>Active</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => handleDeleteMeter(meter.id, meter.name)}
                      style={styles.deleteBtn}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
          )}
        </View>

        {/* Preferences (Notifications) */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, Typography.labelCaps, { color: colors.outline }]}>Preferences</Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
            <View style={[styles.listItemHeader, { borderBottomColor: colors.outlineVariant }]}>
              <MaterialIcons name="notifications-none" size={22} color={colors.outline} />
              <Text style={[styles.listItemText, Typography.metricUnit, { color: colors.text }]}>Notifications</Text>
            </View>
            <View style={{ paddingLeft: Spacing.xl + 6 }}>
              <ToggleRow
                label="Low Balance Alerts"
                sublabel="When balance drops into caution range"
                value={notificationPreferences.lowBalanceEnabled}
                onValueChange={(val) => updateNotificationPreferences({ lowBalanceEnabled: val })}
              />
              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
              <ToggleRow
                label="High Usage Warnings"
                sublabel="Spikes in daily consumption pattern"
                value={notificationPreferences.unusualUsageEnabled}
                onValueChange={(val) => updateNotificationPreferences({ unusualUsageEnabled: val })}
              />
              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
              <ToggleRow
                label="Recharge Reminders"
                sublabel="Estimated days remaining alerts"
                value={notificationPreferences.rechargeReminderEnabled}
                onValueChange={(val) => updateNotificationPreferences({ rechargeReminderEnabled: val })}
              />
              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
              <ToggleRow
                label="Payment Confirmations"
                sublabel="Receipts for electricity token vending"
                value={notificationPreferences.purchaseUpdatesEnabled}
                onValueChange={(val) => updateNotificationPreferences({ purchaseUpdatesEnabled: val })}
              />
              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
              <ToggleRow
                label="Wallet Funding Updates"
                sublabel="Deposit credits and funding alerts"
                value={notificationPreferences.walletFundingEnabled}
                onValueChange={(val) => updateNotificationPreferences({ walletFundingEnabled: val })}
              />
              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
              <ToggleRow
                label="AI Energy Insights"
                sublabel="Periodic consumption advice & analysis"
                value={notificationPreferences.aiInsightsEnabled}
                onValueChange={(val) => updateNotificationPreferences({ aiInsightsEnabled: val })}
              />
            </View>
            <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
            <View style={styles.listItem}>
              <MaterialIcons name="palette" size={22} color={colors.outline} />
              <Text style={[styles.listItemText, Typography.metricUnit, { color: colors.text }]}>Appearance</Text>
              <View style={styles.chevronRow}>
                <Text style={[styles.appearanceValue, Typography.labelCaps, { color: colors.outline }]}>
                  {isDark ? 'Dark Mode' : 'Light Mode'}
                </Text>
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: colors.outlineVariant, true: colors.secondary }}
                  thumbColor={colors.white}
                />
              </View>
            </View>
          </View>
        </View>

        {/* More Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, Typography.labelCaps, { color: colors.outline }]}>More</Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
            <TouchableOpacity 
              style={styles.listItem} 
              activeOpacity={0.7}
              onPress={() => CustomAlert.alert('Security', 'Your PayPawa account is protected by Supabase Row-Level Security and financial-grade encryption.', [{ text: 'OK', style: 'default' }], { type: 'info' })}
            >
              <MaterialIcons name="lock-outline" size={22} color={colors.outline} />
              <Text style={[styles.listItemText, Typography.metricUnit, { color: colors.text }]}>Security & Encryption</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.outline} style={styles.chevron} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
            <TouchableOpacity 
              style={styles.listItem} 
              activeOpacity={0.7}
              onPress={() => router.push('/support' as any)}
            >
              <MaterialIcons name="headset-mic" size={22} color={colors.outline} />
              <Text style={[styles.listItemText, Typography.metricUnit, { color: colors.text, flex: 1 }]}>Help & Support Center</Text>
              {unreadSupportCount > 0 && (
                <View style={{ backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginRight: 8 }}>
                  <Text style={{ color: '#ffffff', fontSize: 11, fontFamily: 'Inter_700Bold' }}>
                    {unreadSupportCount > 9 ? '9+' : unreadSupportCount}
                  </Text>
                </View>
              )}
              <MaterialIcons name="chevron-right" size={22} color={colors.outline} style={styles.chevron} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
            <TouchableOpacity 
              style={styles.listItem} 
              activeOpacity={0.7}
              onPress={() => { setLegalModalType('terms'); setLegalModalVisible(true); }}
            >
              <MaterialIcons name="description" size={22} color={colors.outline} />
              <Text style={[styles.listItemText, Typography.metricUnit, { color: colors.text }]}>Terms of Service</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.outline} style={styles.chevron} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
            <TouchableOpacity 
              style={styles.listItem} 
              activeOpacity={0.7}
              onPress={() => { setLegalModalType('privacy'); setLegalModalVisible(true); }}
            >
              <MaterialIcons name="privacy-tip" size={22} color={colors.outline} />
              <Text style={[styles.listItemText, Typography.metricUnit, { color: colors.text }]}>Privacy Policy</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.outline} style={styles.chevron} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Danger Zone (App Store Compliance) */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, Typography.labelCaps, { color: colors.error }]}>Danger Zone</Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: 'rgba(239, 68, 68, 0.2)' }]}>
            <TouchableOpacity 
              style={styles.listItem} 
              activeOpacity={0.7}
              onPress={() => { setDeleteConfirmText(''); setDeleteModalVisible(true); }}
            >
              <MaterialIcons name="delete-forever" size={22} color={colors.error} />
              <Text style={[styles.listItemText, Typography.metricUnit, { color: colors.error }]}>Delete Account</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.error} style={styles.chevron} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={[styles.signOutBtn, { backgroundColor: colors.errorBg, borderColor: colors.errorBg }]}
          onPress={handleLogout}
          disabled={isLoggingOut}
          activeOpacity={0.75}
        >
          {isLoggingOut ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <>
              <MaterialIcons name="logout" size={20} color={colors.error} />
              <Text style={[styles.signOutText, Typography.headlineMd, { fontSize: 16, color: colors.error }]}>
                Sign Out
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* App Version Footer */}
        <View style={{ alignItems: 'center', marginBottom: Spacing.xl }}>
          <Text style={[Typography.labelCaps, { color: colors.outline, fontSize: 12 }]}>
            PayPawa • Version 1.0.0 (Build 1)
          </Text>
          <Text style={[Typography.bodyMd, { color: colors.textSecondary, fontSize: 11, marginTop: 2 }]}>
            Licensed by NERC Distribution Partners • SquadCo Gateway
          </Text>
        </View>
      </ScrollView>

      {/* Edit Profile & Personal Info Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, Typography.headlineMd, { color: colors.primary }]}>
                Personal Information
              </Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.modalCloseBtn}>
                <MaterialIcons name="close" size={22} color={colors.outline} />
              </TouchableOpacity>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.outlineVariant, marginBottom: Spacing.md, marginLeft: 0 }]} />

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, Typography.labelCaps, { color: colors.outline }]}>Full Name</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, color: colors.text }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter your name"
                placeholderTextColor={colors.outline}
                editable={!savingProfile}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, Typography.labelCaps, { color: colors.outline }]}>Phone Number</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, color: colors.text }]}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="e.g. 08012345678"
                placeholderTextColor={colors.outline}
                keyboardType="phone-pad"
                editable={!savingProfile}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, Typography.labelCaps, { color: colors.outline }]}>Account Type</Text>
              <View style={styles.accountTypeRow}>
                <TouchableOpacity
                  style={[
                    styles.accountTypeBtn,
                    editAccountType === 'household' ? styles.accountTypeBtnActive : null,
                  ]}
                  onPress={() => setEditAccountType('household')}
                >
                  <Text style={[styles.accountTypeText, editAccountType === 'household' ? styles.accountTypeTextActive : null]}>
                    Household
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.accountTypeBtn,
                    editAccountType === 'business' ? styles.accountTypeBtnActive : null,
                  ]}
                  onPress={() => setEditAccountType('business')}
                >
                  <Text style={[styles.accountTypeText, editAccountType === 'business' ? styles.accountTypeTextActive : null]}>
                    Business
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                onPress={() => setEditModalVisible(false)}
                disabled={savingProfile}
              >
                <Text style={[styles.modalBtnText, Typography.metricUnit, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={[styles.modalBtnText, Typography.metricUnit, { color: isDark ? colors.background : colors.white }]}>
                    Save Changes
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Help & Support Modal */}
      <Modal
        visible={supportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSupportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, Typography.headlineMd, { color: colors.primary }]}>
                Help & Customer Support
              </Text>
              <TouchableOpacity onPress={() => setSupportModalVisible(false)} style={styles.modalCloseBtn}>
                <MaterialIcons name="close" size={22} color={colors.outline} />
              </TouchableOpacity>
            </View>
            <Text style={[Typography.bodyMd, { color: colors.textSecondary, marginBottom: Spacing.md }]}>
              Our dedicated support team is available 24/7 to assist with payment inquiries, meter reconciliation, and token delivery.
            </Text>
            <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <MaterialIcons name="email" size={20} color={colors.primary} />
                <Text style={[Typography.metricUnit, { color: colors.text }]}>support@paypawa.ng</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <MaterialIcons name="phone" size={20} color={colors.primary} />
                <Text style={[Typography.metricUnit, { color: colors.text }]}>+234 (0) 700-PAYPAWA</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <MaterialIcons name="schedule" size={20} color={colors.primary} />
                <Text style={[Typography.metricUnit, { color: colors.text }]}>Mon – Sun: 24 Hours Active</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.primary }]}
              onPress={() => setSupportModalVisible(false)}
            >
              <Text style={[styles.modalBtnText, Typography.metricUnit, { color: isDark ? colors.background : colors.white }]}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Terms of Service & Privacy Policy Modal */}
      <Modal
        visible={legalModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLegalModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.outlineVariant, maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, Typography.headlineMd, { color: colors.primary }]}>
                {legalModalType === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </Text>
              <TouchableOpacity onPress={() => setLegalModalVisible(false)} style={styles.modalCloseBtn}>
                <MaterialIcons name="close" size={22} color={colors.outline} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ marginBottom: Spacing.md }}>
              {legalModalType === 'terms' ? (
                <Text style={[Typography.bodyMd, { color: colors.textSecondary, lineHeight: 20 }]}>
                  Welcome to PayPawa. By creating an account, registering an electricity meter, and vending utility tokens through our platform, you agree to comply with our terms.{"\n\n"}
                  1. Payment & Vending: Electricity tokens are vended through authorized DISCO gateways (SquadCo/GTCO). Transactions are non-refundable once an electricity token is successfully issued by the utility provider.{"\n\n"}
                  2. Wallet Integrity: Wallet balances reflect stored value exclusively for utility payments and are protected by double-entry ledger verification. Overdrafts or unauthorized debits are strictly prohibited.{"\n\n"}
                  3. Meter Data: You represent that you are authorized to vend electricity for registered meter numbers.
                </Text>
              ) : (
                <Text style={[Typography.bodyMd, { color: colors.textSecondary, lineHeight: 20 }]}>
                  Your privacy is paramount to PayPawa.{"\n\n"}
                  1. Data Collection: We collect contact info (name, email, phone) and utility meter information strictly to process electricity payments, calculate consumption cadence, and alert you to low balances.{"\n\n"}
                  2. Financial Security: We never store debit/credit card PANs or CVVs. All payment transactions are tokenized and processed through PCI-DSS Level 1 compliant partners.{"\n\n"}
                  3. Right to Erasure: In compliance with NDPR and App Store guidelines, you can permanently request account deletion at any time from Profile &gt; Danger Zone.
                </Text>
              )}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.primary }]}
              onPress={() => setLegalModalVisible(false)}
            >
              <Text style={[styles.modalBtnText, Typography.metricUnit, { color: isDark ? colors.background : colors.white }]}>
                I Understand
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Account Modal (App Store Guideline 5.1.1(v)) */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.error }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, Typography.headlineMd, { color: colors.error }]}>
                Delete Account
              </Text>
              <TouchableOpacity onPress={() => setDeleteModalVisible(false)} style={styles.modalCloseBtn}>
                <MaterialIcons name="close" size={22} color={colors.outline} />
              </TouchableOpacity>
            </View>
            <Text style={[Typography.bodyMd, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
              This action is <Text style={{ fontWeight: '700', color: colors.error }}>permanent and irreversible</Text>. 
              Your profile, registered meters, and alerts will be erased, and your wallet will be closed.
            </Text>
            <Text style={[Typography.bodyMd, { color: colors.outline, marginBottom: Spacing.md }]}>
              Type <Text style={{ fontWeight: '700', color: colors.text }}>DELETE</Text> to confirm:
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.error, color: colors.text, marginBottom: Spacing.lg }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="DELETE"
              placeholderTextColor={colors.outline}
              autoCapitalize="characters"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                onPress={() => setDeleteModalVisible(false)}
                disabled={deletingAccount}
              >
                <Text style={[styles.modalBtnText, Typography.metricUnit, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.error }]}
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={[styles.modalBtnText, Typography.metricUnit, { color: colors.white }]}>
                    Confirm Delete
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  header: {
    paddingHorizontal: Spacing.containerMargin,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  pageTitle: {},
  profileHero: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    borderBottomWidth: 1,
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: Spacing.xs,
  },
  avatarText: {},
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  profileName: {},
  profileEmail: {},
  heroBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  accountTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Rounded.full,
  },
  heroMeterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(132,204,22,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Rounded.full,
  },
  heroMeterText: {
    textTransform: 'uppercase',
  },
  section: {
    paddingHorizontal: Spacing.containerMargin,
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  addLink: { textTransform: 'uppercase' },
  activeCard: {
    borderRadius: Rounded.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  activeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  activeCardTitle: {},
  activeCardSubtitle: {
    textTransform: 'uppercase',
    marginTop: 2,
  },
  activeDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  gridItem: {
    width: '46%',
  },
  detailLabel: {
    textTransform: 'uppercase',
    fontSize: 11,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailAddress: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  listCard: {
    borderRadius: Rounded.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  listItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  listItemText: { flex: 1 },
  chevron: { marginLeft: 'auto' },
  chevronRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  appearanceValue: { textTransform: 'capitalize' },
  divider: { height: 1, marginLeft: Spacing.md },
  meterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  meterIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meterName: {},
  meterDisco: { textTransform: 'uppercase', marginTop: 2 },
  meterNumber: { marginTop: 1 },
  activePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Rounded.full,
  },
  activePillText: { textTransform: 'uppercase' },
  deleteBtn: { padding: Spacing.xs },
  emptyMeters: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyText: {},
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.md,
  },
  toggleLabel: {},
  toggleSublabel: { textTransform: 'lowercase', marginTop: 2 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.containerMargin,
    marginBottom: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Rounded.lg,
    borderWidth: 1,
  },
  signOutText: {},
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.containerMargin,
  },
  modalContent: {
    borderRadius: Rounded.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {},
  modalCloseBtn: {
    padding: Spacing.xs,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  modalInput: {
    height: 48,
    borderRadius: Rounded.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
  },
  modalMeterNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Rounded.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  modalMeterNoticeTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalMeterNoticeBody: {
    marginTop: 2,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: Rounded.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    fontWeight: '600',
  },
  accountTypeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  accountTypeBtn: {
    flex: 1,
    height: 44,
    borderRadius: Rounded.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountTypeBtnActive: {
    borderColor: '#84CC16',
    backgroundColor: 'rgba(132, 204, 22, 0.1)',
  },
  accountTypeText: {
    color: '#6B7280',
    fontWeight: '500',
  },
  accountTypeTextActive: {
    color: '#84CC16',
    fontWeight: '700',
  },
});
