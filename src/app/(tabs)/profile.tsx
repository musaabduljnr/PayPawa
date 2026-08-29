import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
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
  } = useApp();
  const { isDark, toggleTheme, colors } = useTheme();

  const [paymentNotifs, setPaymentNotifs] = useState(true);
  const [lowBalanceAlert, setLowBalanceAlert] = useState(true);
  const [highUsageWarning, setHighUsageWarning] = useState(false);

  // Edit Profile Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState(userName);
  const [editPhone, setEditPhone] = useState(userPhone);
  const [editAccountType, setEditAccountType] = useState<AccountTypeEnum>(accountType || 'household');
  const [savingProfile, setSavingProfile] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
      Alert.alert('Validation Error', 'Full Name cannot be empty');
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
        Alert.alert('Save Failed', res.error || 'Failed to update profile.');
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
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        const confirmed = window.confirm('Are you sure you want to sign out?');
        if (confirmed) {
          executeLogout();
        }
      } else {
        executeLogout();
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: executeLogout,
        },
      ]);
    }
  };


  const handleDeleteMeter = (id: string, name: string) => {
    Alert.alert('Remove Meter', `Remove "${name}" from your account?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteMeter(id) },
    ]);
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
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
            <Text style={[styles.avatarText, Typography.headlineLg, { color: isDark ? colors.background : colors.white }]}>
              {initials}
            </Text>
          </View>
          <Text style={[styles.profileName, Typography.headlineMd, { color: colors.primary }]}>{displayName}</Text>
          <Text style={[styles.profileEmail, Typography.bodyMd, { color: colors.textSecondary }]}>{displayEmail}</Text>
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
            <TouchableOpacity style={styles.listItem} onPress={handleOpenEdit} activeOpacity={0.7}>
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
                label="Payment Confirmations"
                sublabel="Get receipts for token purchases"
                value={paymentNotifs}
                onValueChange={setPaymentNotifs}
              />
              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
              <ToggleRow
                label="Low Balance Alert"
                sublabel="When estimate drops below 3 days"
                value={lowBalanceAlert}
                onValueChange={setLowBalanceAlert}
              />
              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
              <ToggleRow
                label="High Usage Warning"
                sublabel="Spikes in daily consumption"
                value={highUsageWarning}
                onValueChange={setHighUsageWarning}
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
            <TouchableOpacity style={styles.listItem} activeOpacity={0.7}>
              <MaterialIcons name="lock-outline" size={22} color={colors.outline} />
              <Text style={[styles.listItemText, Typography.metricUnit, { color: colors.text }]}>Security</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.outline} style={styles.chevron} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
            <TouchableOpacity style={styles.listItem} activeOpacity={0.7}>
              <MaterialIcons name="help-outline" size={22} color={colors.outline} />
              <Text style={[styles.listItemText, Typography.metricUnit, { color: colors.text }]}>Help & Support</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.outline} style={styles.chevron} />
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
