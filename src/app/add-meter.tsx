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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';

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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, Typography.headlineMd]}>
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
          <View style={styles.illustration}>
            <View style={styles.illustrationCircle}>
              <MaterialCommunityIcons name="lightning-bolt-circle" size={72} color={Colors.secondaryDark} />
            </View>
            <View style={styles.illustrationTextWrap}>
              <Text style={[styles.illustrationTitle, Typography.headlineLgMobile]}>Connect your meter</Text>
              <Text style={[styles.illustrationSubtitle, Typography.bodyMd]}>
                Enter your prepaid meter number to start tracking your electricity.
              </Text>
            </View>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* DISCO Selector */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, Typography.metricUnit]}>Distribution Company (DISCO)</Text>
              <TouchableOpacity
                style={[
                  styles.inputWrapper,
                  errors.disco ? styles.inputError : null,
                  showDiscoList ? styles.inputFocused : null,
                ]}
                onPress={() => setShowDiscoList(!showDiscoList)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    Typography.bodyMd,
                    { flex: 1, color: disco ? Colors.text : Colors.outline },
                  ]}
                >
                  {disco || 'Select your provider...'}
                </Text>
                <MaterialIcons
                  name={showDiscoList ? 'expand-less' : 'expand-more'}
                  size={22}
                  color={Colors.outline}
                />
              </TouchableOpacity>
              {errors.disco ? (
                <Text style={[styles.errorText, Typography.labelCaps]}>{errors.disco}</Text>
              ) : null}

              {showDiscoList && (
                <View style={styles.dropdownList}>
                  {DISCO_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.dropdownItem, disco === opt ? styles.dropdownItemActive : null]}
                      onPress={() => {
                        setDisco(opt);
                        setShowDiscoList(false);
                        setErrors((prev) => ({ ...prev, disco: '' }));
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          Typography.bodyMd,
                          disco === opt ? styles.dropdownItemTextActive : null,
                        ]}
                      >
                        {opt}
                      </Text>
                      {disco === opt && <MaterialIcons name="check" size={18} color={Colors.secondaryDark} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Meter Number */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, Typography.metricUnit]}>Meter Number</Text>
              <Pressable
                style={[
                  styles.inputWrapper,
                  isFocused === 'meterNumber' ? styles.inputFocused : null,
                  errors.meterNumber ? styles.inputError : null,
                ]}
                onPress={() => meterInputRef.current?.focus()}
              >
                <MaterialCommunityIcons name="counter" size={20} color={Colors.outline} style={{ marginRight: 8 }} />
                <TextInput
                  ref={meterInputRef}
                  style={styles.input}
                  placeholder="e.g. 0419 8273 645"
                  placeholderTextColor={Colors.outline}
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
              <Text style={[styles.hintText, Typography.labelCaps]}>
                Enter the 11-13 digit number on your meter.
              </Text>
              {errors.meterNumber ? (
                <Text style={[styles.errorText, Typography.labelCaps]}>{errors.meterNumber}</Text>
              ) : null}
            </View>

            {/* Meter Nickname */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, Typography.metricUnit]}>Meter Nickname (Optional)</Text>
              <Pressable
                style={[
                  styles.inputWrapper,
                  isFocused === 'nickname' ? styles.inputFocused : null,
                ]}
                onPress={() => nicknameInputRef.current?.focus()}
              >
                <TextInput
                  ref={nicknameInputRef}
                  style={styles.input}
                  placeholder="e.g. Home, Office"
                  placeholderTextColor={Colors.outline}
                  value={nickname}
                  onChangeText={setNickname}
                  onFocus={() => setIsFocused('nickname')}
                  onBlur={() => setIsFocused(null)}
                />
                <MaterialIcons name="edit" size={20} color={Colors.outline} />
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Sticky CTA */}
        <View style={styles.stickyFooter}>
          <TouchableOpacity style={styles.verifyBtn} onPress={handleVerify}>
            <Text style={[styles.verifyBtnText, Typography.headlineMd]}>Verify Meter</Text>
            <MaterialIcons name="arrow-forward" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  illustration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  illustrationCircle: {
    width: 80,
    height: 80,
    borderRadius: Rounded.xl,
    backgroundColor: 'rgba(132,204,22,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationTextWrap: { flex: 1 },
  illustrationTitle: { color: Colors.primary, fontSize: 18 },
  illustrationSubtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 4 },
  form: { gap: Spacing.lg },
  inputGroup: { gap: Spacing.xs },
  label: { color: Colors.textSecondary },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Rounded.default,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    paddingVertical: 0,
    height: '100%',
  },
  inputFocused: {
    borderColor: Colors.primary,
    shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  inputError: { borderColor: Colors.error },
  hintText: { color: Colors.outline, textTransform: 'none', marginTop: 2 },
  errorText: { color: Colors.error },
  dropdownList: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Rounded.default,
    marginTop: Spacing.xs,
    overflow: 'hidden',
    shadowColor: Colors.primary,
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
    borderBottomColor: Colors.outlineVariant,
  },
  dropdownItemActive: { backgroundColor: 'rgba(132,204,22,0.05)' },
  dropdownItemText: { color: Colors.text },
  dropdownItemTextActive: { color: Colors.secondaryDark, fontWeight: '600' },
  stickyFooter: {
    padding: Spacing.containerMargin,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
  },
  verifyBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Rounded.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyBtnText: { color: Colors.white },
});
