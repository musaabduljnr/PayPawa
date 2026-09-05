import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';

const DISCO_OPTIONS = [
  'YEDC (Prepaid)',
  'EKEDC / IKEDC (Prepaid)',
  'BEDC (Prepaid)',
  'AEDC (Prepaid)',
  'PHEDC (Prepaid)',
  'KAEDCO (Prepaid)',
];

export default function AddMeterScreen() {
  const { addMeter, meters } = useApp();
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [disco, setDisco] = useState('');
  const [meterNumber, setMeterNumber] = useState('');
  const [nickname, setNickname] = useState('');
  const [showDiscoList, setShowDiscoList] = useState(false);
  const [isFocused, setIsFocused] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const meterInputRef = useRef<TextInput>(null);
  const nicknameInputRef = useRef<TextInput>(null);

  const handleVerify = () => {
    const newErrors: Record<string, string> = {};
    if (!disco) newErrors.disco = 'Please select a distribution company';
    if (!meterNumber) {
      newErrors.meterNumber = 'Meter number is required';
    } else if (meterNumber.replace(/\s/g, '').length < 11) {
      newErrors.meterNumber = 'Enter the 11-13 digit number on your meter';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    router.push({
      pathname: '/verify-meter',
      params: { disco, meterNumber, nickname },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.topBar, { borderBottomColor: colors.outlineVariant }]}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.surfaceContainer }]}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, Typography.headlineMd, { color: colors.text }]}>
            {meters.length === 0 ? 'Add Your First Meter' : 'Add New Meter'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Illustration */}
          <View
            style={[
              styles.illustration,
              {
                backgroundColor: isDark ? colors.surfaceContainerLow : colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <View
              style={[
                styles.illustrationCircle,
                { backgroundColor: isDark ? 'rgba(132,204,22,0.15)' : 'rgba(132,204,22,0.1)' },
              ]}
            >
              <MaterialCommunityIcons name="lightning-bolt-circle" size={72} color={colors.secondaryDark} />
            </View>
            <View style={styles.illustrationTextWrap}>
              <Text
                style={[
                  styles.illustrationTitle,
                  Typography.headlineLgMobile,
                  { color: isDark ? colors.text : colors.primary },
                ]}
              >
                Connect your meter
              </Text>
              <Text style={[styles.illustrationSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                Enter your prepaid meter number to start tracking your electricity.
              </Text>
            </View>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* DISCO Selector */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, Typography.metricUnit, { color: colors.textSecondary }]}>
                Distribution Company (DISCO)
              </Text>
              <TouchableOpacity
                style={[
                  styles.inputWrapper,
                  { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
                  errors.disco ? { borderColor: colors.error } : null,
                  showDiscoList
                    ? [styles.inputFocused, { borderColor: isDark ? colors.secondary : colors.primary }]
                    : null,
                ]}
                onPress={() => setShowDiscoList(!showDiscoList)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    Typography.bodyMd,
                    { flex: 1, color: disco ? colors.text : colors.outline },
                  ]}
                >
                  {disco || 'Select your provider...'}
                </Text>
                <MaterialIcons
                  name={showDiscoList ? 'expand-less' : 'expand-more'}
                  size={22}
                  color={colors.outline}
                />
              </TouchableOpacity>
              {errors.disco ? (
                <Text style={[styles.errorText, Typography.labelCaps, { color: colors.error }]}>{errors.disco}</Text>
              ) : null}

              {showDiscoList && (
                <View
                  style={[
                    styles.dropdownList,
                    { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
                  ]}
                >
                  {DISCO_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.dropdownItem,
                        { borderBottomColor: colors.outlineVariant },
                        disco === opt
                          ? [
                              styles.dropdownItemActive,
                              { backgroundColor: isDark ? 'rgba(132,204,22,0.12)' : 'rgba(132,204,22,0.06)' },
                            ]
                          : null,
                      ]}
                      onPress={() => {
                        setDisco(opt);
                        setShowDiscoList(false);
                        setErrors((prev) => ({ ...prev, disco: '' }));
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          Typography.bodyMd,
                          { color: colors.text },
                          disco === opt ? { color: colors.secondaryDark, fontWeight: '600' } : null,
                        ]}
                      >
                        {opt}
                      </Text>
                      {disco === opt && <MaterialIcons name="check" size={18} color={colors.secondaryDark} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Meter Number */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, Typography.metricUnit, { color: colors.textSecondary }]}>Meter Number</Text>
              <Pressable
                style={[
                  styles.inputWrapper,
                  { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
                  isFocused === 'meterNumber'
                    ? [styles.inputFocused, { borderColor: isDark ? colors.secondary : colors.primary }]
                    : null,
                  errors.meterNumber ? { borderColor: colors.error } : null,
                ]}
                onPress={() => meterInputRef.current?.focus()}
              >
                <MaterialCommunityIcons name="counter" size={20} color={colors.outline} style={{ marginRight: 8 }} />
                <TextInput
                  ref={meterInputRef}
                  style={[styles.input, { color: colors.text }]}
                  placeholder="e.g. 0419 8273 645"
                  placeholderTextColor={colors.outline}
                  keyboardType="number-pad"
                  maxLength={19}
                  value={meterNumber}
                  onChangeText={(text) => {
                    setMeterNumber(text);
                    setErrors((prev) => ({ ...prev, meterNumber: '' }));
                  }}
                  onFocus={() => setIsFocused('meterNumber')}
                  onBlur={() => setIsFocused(null)}
                />
              </Pressable>
              <Text style={[styles.hintText, Typography.labelCaps, { color: colors.outline }]}>
                Enter the 11-13 digit number on your meter.
              </Text>
              {errors.meterNumber ? (
                <Text style={[styles.errorText, Typography.labelCaps, { color: colors.error }]}>
                  {errors.meterNumber}
                </Text>
              ) : null}
            </View>

            {/* Meter Nickname */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, Typography.metricUnit, { color: colors.textSecondary }]}>
                Meter Nickname (Optional)
              </Text>
              <Pressable
                style={[
                  styles.inputWrapper,
                  { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
                  isFocused === 'nickname'
                    ? [styles.inputFocused, { borderColor: isDark ? colors.secondary : colors.primary }]
                    : null,
                ]}
                onPress={() => nicknameInputRef.current?.focus()}
              >
                <TextInput
                  ref={nicknameInputRef}
                  style={[styles.input, { color: colors.text }]}
                  placeholder="e.g. Home, Office"
                  placeholderTextColor={colors.outline}
                  value={nickname}
                  onChangeText={setNickname}
                  onFocus={() => setIsFocused('nickname')}
                  onBlur={() => setIsFocused(null)}
                />
                <MaterialIcons name="edit" size={20} color={colors.outline} />
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Sticky CTA */}
        <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.outlineVariant }]}>
          <TouchableOpacity
            style={[styles.verifyBtn, { backgroundColor: isDark ? colors.secondary : colors.primary }]}
            onPress={handleVerify}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.verifyBtnText,
                Typography.headlineMd,
                { color: isDark ? colors.background : colors.white },
              ]}
            >
              Verify Meter
            </Text>
            <MaterialIcons
              name="arrow-forward"
              size={20}
              color={isDark ? colors.background : colors.white}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  illustration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
    padding: Spacing.md,
    borderRadius: Rounded.lg,
    borderWidth: 1,
  },
  illustrationCircle: {
    width: 80,
    height: 80,
    borderRadius: Rounded.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationTextWrap: { flex: 1 },
  illustrationTitle: { fontSize: 18 },
  illustrationSubtitle: { fontSize: 13, marginTop: 4 },
  form: { gap: Spacing.lg },
  inputGroup: { gap: Spacing.xs },
  label: {},
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1,
    borderRadius: Rounded.default,
    paddingHorizontal: Spacing.md,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    paddingVertical: 0,
    height: '100%',
  },
  inputFocused: {
    shadowColor: '#84cc16',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  inputError: {},
  hintText: { textTransform: 'none', marginTop: 2 },
  errorText: {},
  dropdownList: {
    borderWidth: 1,
    borderRadius: Rounded.default,
    marginTop: Spacing.xs,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  dropdownItemActive: {},
  dropdownItemText: {},
  dropdownItemTextActive: {},
  stickyFooter: {
    padding: Spacing.containerMargin,
    borderTopWidth: 1,
  },
  verifyBtn: {
    height: 52,
    borderRadius: Rounded.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyBtnText: {},
});
