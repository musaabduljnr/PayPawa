import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { CustomAlert } from '@/context/AlertContext';
import type { AccountTypeEnum, ApplianceItemInput, UsageFrequencyEnum } from '@/types/auth';
import { EnergyService, AuthService } from '@/services';

interface ApplianceConfig {
  type: string;
  name: string;
  category: 'lighting' | 'cooling' | 'heavy' | 'cooking';
  icon: string;
  iconType: 'community' | 'material';
  defaultWatts: number;
}

const AVAILABLE_APPLIANCES: ApplianceConfig[] = [
  { type: 'light_bulb', name: 'Light Bulbs', category: 'lighting', icon: 'lightbulb-outline', iconType: 'material', defaultWatts: 15 },
  { type: 'fan', name: 'Fans (Ceiling / Standing)', category: 'cooling', icon: 'fan', iconType: 'community', defaultWatts: 60 },
  { type: 'television', name: 'Television (TV)', category: 'lighting', icon: 'tv', iconType: 'material', defaultWatts: 100 },
  { type: 'refrigerator', name: 'Refrigerator', category: 'cooling', icon: 'fridge-outline', iconType: 'community', defaultWatts: 150 },
  { type: 'freezer', name: 'Deep Freezer', category: 'cooling', icon: 'fridge-bottom', iconType: 'community', defaultWatts: 200 },
  { type: 'air_conditioner', name: 'Air Conditioner (AC)', category: 'cooling', icon: 'air-conditioner', iconType: 'community', defaultWatts: 1500 },
  { type: 'pumping_machine', name: 'Water Pumping Machine', category: 'heavy', icon: 'water-pump', iconType: 'community', defaultWatts: 750 },
  { type: 'pressing_iron', name: 'Pressing Iron', category: 'heavy', icon: 'iron', iconType: 'community', defaultWatts: 1000 },
  { type: 'water_heater', name: 'Electric Water Heater', category: 'heavy', icon: 'water-boiler', iconType: 'community', defaultWatts: 1500 },
  { type: 'electric_cooker', name: 'Electric Cooker / Hotplate', category: 'cooking', icon: 'stove', iconType: 'community', defaultWatts: 2000 },
  { type: 'microwave', name: 'Microwave Oven', category: 'cooking', icon: 'microwave', iconType: 'community', defaultWatts: 1000 },
  { type: 'washing_machine', name: 'Washing Machine', category: 'heavy', icon: 'washing-machine', iconType: 'community', defaultWatts: 500 },
];

export default function EnergySetupScreen() {
  const { colors, isDark } = useTheme();
  const { completeOnboarding, userProfile, user, energyProfile, refreshProfile } = useApp();

  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;
  const [submitting, setSubmitting] = useState(false);

  // Step 1 State: Property & Occupants Profile
  const [accountType, setAccountType] = useState<AccountTypeEnum>(energyProfile?.account_type || userProfile?.account_type || 'household');
  const [occupantsCount, setOccupantsCount] = useState(energyProfile?.occupants_count || 3);
  const [buildingType, setBuildingType] = useState(energyProfile?.building_type || 'flat');
  const [hasSolar, setHasSolar] = useState(energyProfile?.has_solar ?? false);
  const [hasGenerator, setHasGenerator] = useState(energyProfile?.has_generator ?? true);

  // Step 2 & 3 State: Selected Appliances
  const [selectedAppliances, setSelectedAppliances] = useState<Record<string, { quantity: number; frequency: UsageFrequencyEnum }>>({
    light_bulb: { quantity: 6, frequency: 'daily' },
    fan: { quantity: 2, frequency: 'daily' },
    television: { quantity: 1, frequency: 'daily' },
    refrigerator: { quantity: 1, frequency: 'daily' },
    pressing_iron: { quantity: 1, frequency: 'occasionally' },
    pumping_machine: { quantity: 1, frequency: 'rarely' },
  });

  const toggleAppliance = (type: string) => {
    setSelectedAppliances((prev) => {
      const copy = { ...prev };
      if (copy[type]) {
        delete copy[type];
      } else {
        copy[type] = { quantity: 1, frequency: 'daily' };
      }
      return copy;
    });
  };

  const updateQuantity = (type: string, delta: number) => {
    setSelectedAppliances((prev) => {
      const item = prev[type];
      if (!item) return prev;
      const newQty = Math.max(1, item.quantity + delta);
      return {
        ...prev,
        [type]: { ...item, quantity: newQty },
      };
    });
  };

  const updateFrequency = (type: string, freq: UsageFrequencyEnum) => {
    setSelectedAppliances((prev) => {
      const item = prev[type];
      if (!item) return prev;
      return {
        ...prev,
        [type]: { ...item, frequency: freq },
      };
    });
  };

  // Calculate estimated daily total kWh
  const calculateTotalDailyKwh = () => {
    let total = 0;
    Object.entries(selectedAppliances).forEach(([type, config]) => {
      total += EnergyService.calculateEstimatedDailyKwh(type, config.quantity, config.frequency);
    });
    return Math.round(total * 10) / 10;
  };

  const calculateTotalWeeklyHours = (freq: UsageFrequencyEnum) => {
    switch (freq) {
      case 'rarely': return 3.5;
      case 'occasionally': return 10.5;
      case 'daily': return 42;
      case 'multiple_daily': return 84;
    }
  };

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      const applianceItems: ApplianceItemInput[] = Object.entries(selectedAppliances).map(
        ([type, config]) => ({
          applianceType: type,
          quantity: config.quantity,
          usageFrequency: config.frequency,
          weeklyHours: calculateTotalWeeklyHours(config.frequency),
          estimatedDailyKwh: EnergyService.calculateEstimatedDailyKwh(type, config.quantity, config.frequency),
        })
      );

      const success = await completeOnboarding(
        {
          accountType,
          occupantsCount,
          buildingType,
          hasSolar,
          hasGenerator,
        },
        applianceItems
      );

      if (success) {
        router.replace('/(tabs)/home');
      } else {
        CustomAlert.alert(
          'Notice',
          'Could not save profile right now. You can update it anytime from the Profile tab.',
          [{ text: 'Go to Dashboard', style: 'default', onPress: () => router.replace('/(tabs)/home') }],
          { type: 'info' }
        );
      }
    } catch (e: any) {
      router.replace('/(tabs)/home');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (user?.id) {
      AuthService.updateProfile(user.id, { onboarding_completed: true }).catch(() => {});
      refreshProfile().catch(() => {});
    }
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with Progress */}
      <View style={styles.header}>
        {currentStep > 1 ? (
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant }]}
            onPress={() => setCurrentStep((prev) => prev - 1)}
            disabled={submitting}
            activeOpacity={0.7}
          >
            <MaterialIcons name="chevron-left" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}

        <View style={styles.stepIndicatorWrap}>
          <Text style={[styles.stepIndicatorText, Typography.labelCaps, { color: colors.secondary }]}>
            STEP {currentStep} OF {totalSteps}
          </Text>
          <View style={[styles.progressBarBg, { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainer }]}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(currentStep / totalSteps) * 100}%`, backgroundColor: colors.secondary },
              ]}
            />
          </View>
        </View>

        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} disabled={submitting} activeOpacity={0.7}>
          <Text style={[styles.skipText, Typography.metricUnit, { color: colors.outline }]}>
            Skip
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* STEP 1: Property & Account Profile */}
        {currentStep === 1 && (
          <View style={styles.stepContainer}>
            <View style={styles.stepTitleBox}>
              <Text style={[styles.stepTitle, Typography.headlineLg, { color: colors.text }]}>
                Tell us about your property
              </Text>
              <Text style={[styles.stepSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                This helps PayPawa personalize your energy estimates and usage tracking.
              </Text>
            </View>

            {/* Property Type Selector */}
            <View style={styles.cardSection}>
              <Text style={[styles.cardLabel, Typography.labelCaps, { color: colors.outline }]}>Property Type</Text>
              <View style={styles.accountTypeRow}>
                <TouchableOpacity
                  style={[
                    styles.accountTypeBtn,
                    { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant },
                    accountType === 'household' && [styles.accountTypeBtnActive, { borderColor: colors.secondary, backgroundColor: isDark ? 'rgba(132, 204, 22, 0.1)' : 'rgba(132, 204, 22, 0.08)' }],
                  ]}
                  onPress={() => setAccountType('household')}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name="home-outline"
                    size={24}
                    color={accountType === 'household' ? colors.secondary : colors.outline}
                  />
                  <Text
                    style={[
                      styles.accountTypeText,
                      Typography.metricUnit,
                      { color: accountType === 'household' ? colors.primary : colors.text },
                    ]}
                  >
                    Household
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.accountTypeBtn,
                    { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant },
                    accountType === 'business' && [styles.accountTypeBtnActive, { borderColor: colors.secondary, backgroundColor: isDark ? 'rgba(132, 204, 22, 0.1)' : 'rgba(132, 204, 22, 0.08)' }],
                  ]}
                  onPress={() => setAccountType('business')}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name="domain"
                    size={24}
                    color={accountType === 'business' ? colors.secondary : colors.outline}
                  />
                  <Text
                    style={[
                      styles.accountTypeText,
                      Typography.metricUnit,
                      { color: accountType === 'business' ? colors.primary : colors.text },
                    ]}
                  >
                    Business / Office
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Occupants Count */}
            <View style={[styles.counterContainer, { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.counterTitle, Typography.headlineMd, { fontSize: 16, color: colors.text }]}>
                  {accountType === 'household' ? 'Number of Occupants' : 'Staff / Workers'}
                </Text>
                <Text style={[styles.counterSubtitle, Typography.bodyMd, { color: colors.textSecondary, fontSize: 13 }]}>
                  People living or working on the property
                </Text>
              </View>

              <View style={styles.counterControls}>
                <TouchableOpacity
                  style={[styles.counterBtn, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }]}
                  onPress={() => setOccupantsCount((prev) => Math.max(1, prev - 1))}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="remove" size={20} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.counterValue, Typography.headlineMd, { color: colors.text }]}>
                  {occupantsCount}
                </Text>
                <TouchableOpacity
                  style={[styles.counterBtn, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }]}
                  onPress={() => setOccupantsCount((prev) => prev + 1)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="add" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Building Type */}
            <View style={styles.cardSection}>
              <Text style={[styles.cardLabel, Typography.labelCaps, { color: colors.outline }]}>Building Structure</Text>
              <View style={styles.pillSelectorRow}>
                {[
                  { key: 'flat', label: 'Apartment / Flat' },
                  { key: 'duplex', label: 'Duplex / House' },
                  { key: 'self_contain', label: 'Self Contain' },
                  { key: 'commercial', label: 'Commercial' },
                ].map((b) => (
                  <TouchableOpacity
                    key={b.key}
                    style={[
                      styles.pillBtn,
                      { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant },
                      buildingType === b.key && [styles.pillBtnActive, { borderColor: colors.secondary, backgroundColor: isDark ? 'rgba(132, 204, 22, 0.1)' : 'rgba(132, 204, 22, 0.08)' }],
                    ]}
                    onPress={() => setBuildingType(b.key)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        Typography.metricUnit,
                        { color: buildingType === b.key ? colors.primary : colors.text, fontWeight: buildingType === b.key ? '700' : '500' },
                      ]}
                    >
                      {b.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Backup Power Toggles */}
            <View style={styles.cardSection}>
              <Text style={[styles.cardLabel, Typography.labelCaps, { color: colors.outline }]}>Alternative Energy Sources</Text>
              <View style={[styles.togglesCard, { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant }]}>
                <TouchableOpacity
                  style={styles.toggleItem}
                  onPress={() => setHasSolar(!hasSolar)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="solar-power-variant-outline" size={24} color={hasSolar ? colors.secondary : colors.outline} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toggleText, Typography.metricUnit, { color: colors.text }]}>Solar / Inverter System</Text>
                    <Text style={[styles.toggleSubtext, Typography.labelCaps, { color: colors.outline }]}>Battery backup storage</Text>
                  </View>
                  <MaterialIcons
                    name={hasSolar ? 'check-box' : 'check-box-outline-blank'}
                    size={24}
                    color={hasSolar ? colors.secondary : colors.outline}
                  />
                </TouchableOpacity>

                <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

                <TouchableOpacity
                  style={styles.toggleItem}
                  onPress={() => setHasGenerator(!hasGenerator)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="engine-outline" size={24} color={hasGenerator ? colors.secondary : colors.outline} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toggleText, Typography.metricUnit, { color: colors.text }]}>Standby Generator</Text>
                    <Text style={[styles.toggleSubtext, Typography.labelCaps, { color: colors.outline }]}>Fuel or diesel generator</Text>
                  </View>
                  <MaterialIcons
                    name={hasGenerator ? 'check-box' : 'check-box-outline-blank'}
                    size={24}
                    color={hasGenerator ? colors.secondary : colors.outline}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* STEP 2: Everyday Appliances */}
        {currentStep === 2 && (
          <View style={styles.stepContainer}>
            <View style={styles.stepTitleBox}>
              <Text style={[styles.stepTitle, Typography.headlineLg, { color: colors.text }]}>
                Everyday appliances
              </Text>
              <Text style={[styles.stepSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                Select the regular lighting and cooling appliances used in your space.
              </Text>
            </View>

            <View style={styles.applianceList}>
              {AVAILABLE_APPLIANCES.filter((a) => a.category === 'lighting' || a.category === 'cooling').map((app) => {
                const selected = !!selectedAppliances[app.type];
                const config = selectedAppliances[app.type] || { quantity: 1, frequency: 'daily' };

                return (
                  <View
                    key={app.type}
                    style={[
                      styles.applianceCard,
                      { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant },
                      selected && [styles.applianceCardSelected, { borderColor: colors.secondary }],
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.applianceHeader}
                      onPress={() => toggleAppliance(app.type)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.applianceIconWrap, { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainer }]}>
                        {app.iconType === 'community' ? (
                          <MaterialCommunityIcons name={app.icon as any} size={22} color={selected ? colors.secondary : colors.text} />
                        ) : (
                          <MaterialIcons name={app.icon as any} size={22} color={selected ? colors.secondary : colors.text} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.applianceName, Typography.headlineMd, { fontSize: 15, color: colors.text }]}>
                          {app.name}
                        </Text>
                        <Text style={[styles.applianceWatts, Typography.labelCaps, { color: colors.outline }]}>
                          ~{app.defaultWatts}W per unit
                        </Text>
                      </View>

                      <MaterialIcons
                        name={selected ? 'check-circle' : 'radio-button-unchecked'}
                        size={24}
                        color={selected ? colors.secondary : colors.outlineVariant}
                      />
                    </TouchableOpacity>

                    {selected && (
                      <View style={[styles.applianceControls, { borderTopColor: colors.outlineVariant }]}>
                        {/* Quantity Row */}
                        <View style={styles.applianceQtyRow}>
                          <Text style={[styles.controlLabel, Typography.labelCaps, { color: colors.outline }]}>Quantity</Text>
                          <View style={styles.miniCounter}>
                            <TouchableOpacity
                              style={[styles.miniCounterBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                              onPress={() => updateQuantity(app.type, -1)}
                              activeOpacity={0.7}
                            >
                              <MaterialIcons name="remove" size={16} color={colors.text} />
                            </TouchableOpacity>
                            <Text style={[styles.miniCounterValue, Typography.metricUnit, { color: colors.text }]}>
                              {config.quantity}
                            </Text>
                            <TouchableOpacity
                              style={[styles.miniCounterBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                              onPress={() => updateQuantity(app.type, 1)}
                              activeOpacity={0.7}
                            >
                              <MaterialIcons name="add" size={16} color={colors.text} />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Frequency Selector */}
                        <View style={styles.frequencyRow}>
                          {(['rarely', 'occasionally', 'daily', 'multiple_daily'] as UsageFrequencyEnum[]).map((f) => (
                            <TouchableOpacity
                              key={f}
                              style={[
                                styles.freqPill,
                                { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainerLow },
                                config.frequency === f && [styles.freqPillActive, { backgroundColor: colors.secondary }],
                              ]}
                              onPress={() => updateFrequency(app.type, f)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.freqText,
                                  Typography.labelCaps,
                                  { color: config.frequency === f ? (isDark ? colors.background : colors.white) : colors.outline },
                                ]}
                              >
                                {f === 'multiple_daily' ? 'Constant' : f}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* STEP 3: Heavy Loads & Cooking */}
        {currentStep === 3 && (
          <View style={styles.stepContainer}>
            <View style={styles.stepTitleBox}>
              <Text style={[styles.stepTitle, Typography.headlineLg, { color: colors.text }]}>
                Heavy appliances & cooking
              </Text>
              <Text style={[styles.stepSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                Heavy appliances like heaters, ACs, and pumps account for most electricity consumption.
              </Text>
            </View>

            <View style={styles.applianceList}>
              {AVAILABLE_APPLIANCES.filter((a) => a.category === 'heavy' || a.category === 'cooking').map((app) => {
                const selected = !!selectedAppliances[app.type];
                const config = selectedAppliances[app.type] || { quantity: 1, frequency: 'daily' };

                return (
                  <View
                    key={app.type}
                    style={[
                      styles.applianceCard,
                      { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant },
                      selected && [styles.applianceCardSelected, { borderColor: colors.secondary }],
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.applianceHeader}
                      onPress={() => toggleAppliance(app.type)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.applianceIconWrap, { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainer }]}>
                        {app.iconType === 'community' ? (
                          <MaterialCommunityIcons name={app.icon as any} size={22} color={selected ? colors.secondary : colors.text} />
                        ) : (
                          <MaterialIcons name={app.icon as any} size={22} color={selected ? colors.secondary : colors.text} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.applianceName, Typography.headlineMd, { fontSize: 15, color: colors.text }]}>
                          {app.name}
                        </Text>
                        <Text style={[styles.applianceWatts, Typography.labelCaps, { color: colors.outline }]}>
                          ~{app.defaultWatts}W per unit (High Load)
                        </Text>
                      </View>

                      <MaterialIcons
                        name={selected ? 'check-circle' : 'radio-button-unchecked'}
                        size={24}
                        color={selected ? colors.secondary : colors.outlineVariant}
                      />
                    </TouchableOpacity>

                    {selected && (
                      <View style={[styles.applianceControls, { borderTopColor: colors.outlineVariant }]}>
                        {/* Quantity Row */}
                        <View style={styles.applianceQtyRow}>
                          <Text style={[styles.controlLabel, Typography.labelCaps, { color: colors.outline }]}>Quantity</Text>
                          <View style={styles.miniCounter}>
                            <TouchableOpacity
                              style={[styles.miniCounterBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                              onPress={() => updateQuantity(app.type, -1)}
                              activeOpacity={0.7}
                            >
                              <MaterialIcons name="remove" size={16} color={colors.text} />
                            </TouchableOpacity>
                            <Text style={[styles.miniCounterValue, Typography.metricUnit, { color: colors.text }]}>
                              {config.quantity}
                            </Text>
                            <TouchableOpacity
                              style={[styles.miniCounterBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                              onPress={() => updateQuantity(app.type, 1)}
                              activeOpacity={0.7}
                            >
                              <MaterialIcons name="add" size={16} color={colors.text} />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Frequency Selector */}
                        <View style={styles.frequencyRow}>
                          {(['rarely', 'occasionally', 'daily', 'multiple_daily'] as UsageFrequencyEnum[]).map((f) => (
                            <TouchableOpacity
                              key={f}
                              style={[
                                styles.freqPill,
                                { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainerLow },
                                config.frequency === f && [styles.freqPillActive, { backgroundColor: colors.secondary }],
                              ]}
                              onPress={() => updateFrequency(app.type, f)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.freqText,
                                  Typography.labelCaps,
                                  { color: config.frequency === f ? (isDark ? colors.background : colors.white) : colors.outline },
                                ]}
                              >
                                {f === 'multiple_daily' ? 'Heavy / Constant' : f}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* STEP 4: Estimated Baseline Summary & Disclaimer */}
        {currentStep === 4 && (
          <View style={styles.stepContainer}>
            <View style={styles.stepTitleBox}>
              <Text style={[styles.stepTitle, Typography.headlineLg, { color: colors.text }]}>
                You're all set
              </Text>
              <Text style={[styles.stepSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                Here is your preliminary daily consumption baseline calculated from your appliances.
              </Text>
            </View>

            {/* Estimated Daily kWh Card */}
            <View style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
              <Text style={[styles.summaryCardSubtitle, Typography.labelCaps, { color: colors.secondary }]}>
                ESTIMATED DAILY BASELINE
              </Text>
              <View style={styles.kwhRow}>
                <Text style={[styles.kwhValue, Typography.displayMetrics, { color: colors.white }]}>
                  {calculateTotalDailyKwh()}
                </Text>
                <Text style={[styles.kwhUnit, Typography.headlineMd, { color: colors.secondary }]}>
                  kWh / day
                </Text>
              </View>
              <Text style={[styles.monthlyKwhEst, Typography.metricUnit, { color: 'rgba(255,255,255,0.7)' }]}>
                ≈ {Math.round(calculateTotalDailyKwh() * 30)} kWh / month
              </Text>
            </View>

            {/* Key Drivers Breakdown */}
            <View style={styles.cardSection}>
              <Text style={[styles.cardLabel, Typography.labelCaps, { color: colors.outline }]}>Configured Appliances</Text>
              <View style={[styles.breakdownCard, { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant }]}>
                {Object.entries(selectedAppliances).map(([type, config], i) => {
                  const itemInfo = AVAILABLE_APPLIANCES.find((a) => a.type === type);
                  const dailyKwh = EnergyService.calculateEstimatedDailyKwh(type, config.quantity, config.frequency);

                  return (
                    <View key={type}>
                      {i > 0 && <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />}
                      <View style={styles.breakdownRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.breakdownName, Typography.metricUnit, { color: colors.text }]}>
                            {itemInfo?.name || type} ({config.quantity}x)
                          </Text>
                          <Text style={[styles.breakdownFreq, Typography.labelCaps, { color: colors.outline }]}>
                            Usage: {config.frequency}
                          </Text>
                        </View>
                        <Text style={[styles.breakdownKwh, Typography.metricUnit, { color: colors.secondary, fontWeight: '700' }]}>
                          ~{dailyKwh} kWh/d
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Regulatory Estimation Disclaimer */}
            <View style={[styles.disclaimerBox, { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.08)' : 'rgba(132, 204, 22, 0.15)', borderColor: colors.secondary }]}>
              <MaterialIcons name="info-outline" size={22} color={colors.secondary} />
              <Text style={[styles.disclaimerText, Typography.metricUnit, { color: colors.textSecondary, flex: 1 }]}>
                Your appliance profile estimates your baseline energy loads. These values are <Text style={{ fontWeight: '700', color: colors.text }}>estimates only</Text> to help you plan your monthly electricity purchases.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer Navigation */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.outlineVariant }]}>
        {currentStep < totalSteps ? (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => setCurrentStep((prev) => prev + 1)}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryBtnText, Typography.headlineMd, { color: isDark ? colors.background : colors.white, fontSize: 16 }]}>
              Continue
            </Text>
            <MaterialIcons name="arrow-forward" size={20} color={isDark ? colors.background : colors.white} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleFinish}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={isDark ? colors.background : colors.white} />
            ) : (
              <>
                <Text style={[styles.primaryBtnText, Typography.headlineMd, { color: isDark ? colors.background : colors.white, fontSize: 16 }]}>
                  Go to Dashboard
                </Text>
                <MaterialIcons name="check" size={20} color={isDark ? colors.background : colors.white} />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
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
    paddingHorizontal: Spacing.containerMargin,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Rounded.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndicatorWrap: {
    alignItems: 'center',
    gap: 4,
  },
  stepIndicatorText: {
    fontWeight: '800',
    letterSpacing: 1,
  },
  progressBarBg: {
    width: 120,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  skipBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  skipText: {
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: Spacing.containerMargin,
    paddingTop: Spacing.md,
    paddingBottom: 100,
  },
  stepContainer: {
    gap: Spacing.lg,
  },
  stepTitleBox: {
    gap: Spacing.xs,
  },
  stepTitle: {},
  stepSubtitle: {
    lineHeight: 22,
  },
  cardSection: {
    gap: Spacing.xs,
  },
  cardLabel: {
    textTransform: 'uppercase',
    paddingLeft: 2,
  },
  accountTypeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  accountTypeBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Rounded.lg,
    borderWidth: 1,
    gap: Spacing.xs,
    minHeight: 80,
  },
  accountTypeBtnActive: {
    borderWidth: 2,
  },
  accountTypeText: {
    fontWeight: '700',
  },
  counterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  counterTitle: {},
  counterSubtitle: {
    marginTop: 2,
  },
  counterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  counterBtn: {
    width: 44,
    height: 44,
    borderRadius: Rounded.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    fontSize: 18,
    minWidth: 24,
    textAlign: 'center',
  },
  pillSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  pillBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Rounded.full,
    borderWidth: 1,
  },
  pillBtnActive: {
    borderWidth: 1.5,
  },
  pillText: {
    fontSize: 13,
  },
  togglesCard: {
    borderRadius: Rounded.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    minHeight: 56,
  },
  toggleText: {
    fontWeight: '600',
  },
  toggleSubtext: {
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: Spacing.md,
  },
  applianceList: {
    gap: Spacing.sm,
  },
  applianceCard: {
    borderRadius: Rounded.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  applianceCardSelected: {
    borderWidth: 1.5,
  },
  applianceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
    minHeight: 64,
  },
  applianceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applianceName: {
    fontWeight: '600',
  },
  applianceWatts: {
    marginTop: 2,
  },
  applianceControls: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    gap: Spacing.sm,
  },
  applianceQtyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlLabel: {
    fontSize: 12,
  },
  miniCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  miniCounterBtn: {
    width: 36,
    height: 36,
    borderRadius: Rounded.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCounterValue: {
    minWidth: 28,
    textAlign: 'center',
    fontWeight: '700',
  },
  frequencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  freqPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Rounded.full,
  },
  freqPillActive: {},
  freqText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  summaryCard: {
    padding: Spacing.xl,
    borderRadius: Rounded.xl,
    alignItems: 'center',
    gap: Spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryCardSubtitle: {
    letterSpacing: 1.5,
  },
  kwhRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  kwhValue: {},
  kwhUnit: {},
  monthlyKwhEst: {
    marginTop: Spacing.xs,
  },
  breakdownCard: {
    borderRadius: Rounded.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  breakdownName: {
    fontWeight: '600',
  },
  breakdownFreq: {
    marginTop: 2,
    textTransform: 'capitalize',
  },
  breakdownKwh: {},
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Rounded.lg,
    borderWidth: 1,
  },
  disclaimerText: {
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: Spacing.containerMargin,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  primaryBtn: {
    height: 52,
    borderRadius: Rounded.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  primaryBtnText: {
    fontWeight: '700',
  },
});
