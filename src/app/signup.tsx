import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import type { AccountTypeEnum } from '@/types/auth';

export default function SignUp() {
  const { colors, isDark } = useTheme();
  const { signup, login, resetPassword } = useApp();
  const params = useLocalSearchParams<{ mode?: 'signup' | 'signin' }>();

  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [accountType, setAccountType] = useState<AccountTypeEnum>('household');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Forgot Password State
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  useEffect(() => {
    if (params.mode === 'signin') {
      setMode('signin');
    } else if (params.mode === 'signup') {
      setMode('signup');
    }
  }, [params.mode]);

  const handleResetPassword = async () => {
    setForgotError(null);
    setForgotSuccess(null);

    const trimmed = forgotEmail.trim();
    if (!trimmed) {
      setForgotError('Please enter your registered email address.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(trimmed)) {
      setForgotError('Please enter a valid email address.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await resetPassword(trimmed);
      if (res.success) {
        setForgotSuccess('Password reset link sent! Check your inbox for instructions.');
      } else {
        setForgotError(res.error || 'Failed to send password reset email. Please try again.');
      }
    } catch (err: any) {
      setForgotError('An unexpected error occurred. Please check network connection.');
    } finally {
      setForgotLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (mode === 'signup') {
      if (!fullName.trim()) newErrors.fullName = 'Full Name is required';
    }

    if (!email.trim()) {
      newErrors.email = 'Email Address is required';
    } else if (!/\S+@\S+\.\S+/.test(email.trim())) {
      newErrors.email = 'Enter a valid email address';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    setServerError(null);
    if (!validateForm()) return;

    setLoading(true);
    try {
      if (mode === 'signup') {
        const result = await signup(
          fullName.trim(),
          email.trim(),
          password,
          phone.trim() || undefined,
          accountType
        );

        if (result.success) {
          if (result.isOnboarded || result.profile?.onboarding_completed || result.profile?.is_onboarded) {
            router.replace('/(tabs)/home');
          } else {
            router.replace('/energy-setup');
          }
        } else {
          setServerError(result.error || 'Failed to create account. Please try again.');
        }
      } else {
        const result = await login(email.trim(), password);

        if (result.success) {
          if (result.isOnboarded || result.profile?.onboarding_completed || result.profile?.is_onboarded) {
            router.replace('/(tabs)/home');
          } else {
            router.replace('/energy-setup');
          }
        } else {
          setServerError(result.error || 'Invalid email or password. Please try again.');
        }
      }
    } catch (err: any) {
      setServerError('An unexpected error occurred. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = (newMode: 'signup' | 'signin') => {
    setMode(newMode);
    setServerError(null);
    setErrors({});
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Top Bar Navigation with PayPawa Branding */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant }]}
              onPress={() => router.replace('/onboarding')}
              activeOpacity={0.7}
              accessibilityLabel="Back to onboarding"
            >
              <MaterialIcons name="chevron-left" size={24} color={colors.text} />
            </TouchableOpacity>
            <Image
              source={require('@/assets/images/paypawa-logo.png')}
              style={styles.headerLogo}
              resizeMode="contain"
              accessibilityLabel="PayPawa Logo"
            />
            <View style={{ width: 40 }} />
          </View>

          {/* Tab Mode Switcher */}
          <View style={[styles.tabSwitcher, { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surfaceContainerHigh }]}>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                mode === 'signup' && [styles.tabBtnActive, { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surface }],
              ]}
              onPress={() => toggleMode('signup')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  Typography.metricUnit,
                  { color: mode === 'signup' ? colors.text : colors.outline, fontWeight: mode === 'signup' ? '700' : '500' },
                ]}
              >
                Create Account
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                mode === 'signin' && [styles.tabBtnActive, { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surface }],
              ]}
              onPress={() => toggleMode('signin')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  Typography.metricUnit,
                  { color: mode === 'signin' ? colors.text : colors.outline, fontWeight: mode === 'signin' ? '700' : '500' },
                ]}
              >
                Sign In
              </Text>
            </TouchableOpacity>
          </View>

          {/* Titles */}
          <View style={styles.titleSection}>
            <Text style={[styles.title, Typography.headlineLg, { color: colors.text }]}>
              {mode === 'signup' ? 'Create your PayPawa account' : 'Welcome back'}
            </Text>
            {mode === 'signin' && (
              <Text style={[styles.subtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                Sign in to access your saved meters, electricity tokens, and wallet.
              </Text>
            )}
          </View>

          {/* Server Error Banner */}
          {serverError ? (
            <View style={[styles.errorBanner, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2', borderColor: colors.error }]}>
              <MaterialIcons name="error-outline" size={20} color={colors.error} />
              <Text style={[styles.errorBannerText, Typography.metricUnit, { color: colors.error }]}>{serverError}</Text>
            </View>
          ) : null}

          {/* Form */}
          <View style={styles.form}>
            {/* Full Name (Sign Up only) */}
            {mode === 'signup' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, Typography.metricUnit, { color: colors.textSecondary }]}>Full Name</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant },
                    isFocused === 'fullName' ? [styles.inputFocused, { borderColor: colors.secondary }] : null,
                    errors.fullName ? [styles.inputError, { borderColor: colors.error }] : null,
                  ]}
                >
                  <TextInput
                    style={[styles.input, Typography.bodyMd, { color: colors.text }]}
                    placeholder="e.g. John Doe"
                    placeholderTextColor={colors.outline}
                    value={fullName}
                    onChangeText={(text) => {
                      setFullName(text);
                      if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: '' }));
                    }}
                    onFocus={() => setIsFocused('fullName')}
                    onBlur={() => setIsFocused(null)}
                    editable={!loading}
                  />
                </View>
                {errors.fullName ? (
                  <Text style={[styles.errorText, Typography.labelCaps, { color: colors.error }]}>{errors.fullName}</Text>
                ) : null}
              </View>
            )}

            {/* Email Address */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, Typography.metricUnit, { color: colors.textSecondary }]}>Email Address</Text>
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant },
                  isFocused === 'email' ? [styles.inputFocused, { borderColor: colors.secondary }] : null,
                  errors.email ? [styles.inputError, { borderColor: colors.error }] : null,
                ]}
              >
                <TextInput
                  style={[styles.input, Typography.bodyMd, { color: colors.text }]}
                  placeholder="e.g. john@example.com"
                  placeholderTextColor={colors.outline}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  onFocus={() => setIsFocused('email')}
                  onBlur={() => setIsFocused(null)}
                  editable={!loading}
                />
              </View>
              {errors.email ? (
                <Text style={[styles.errorText, Typography.labelCaps, { color: colors.error }]}>{errors.email}</Text>
              ) : null}
            </View>

            {/* Phone Number (Sign Up only) */}
            {mode === 'signup' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, Typography.metricUnit, { color: colors.textSecondary }]}>Phone Number (Optional)</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant },
                    isFocused === 'phone' ? [styles.inputFocused, { borderColor: colors.secondary }] : null,
                  ]}
                >
                  <TextInput
                    style={[styles.input, Typography.bodyMd, { color: colors.text }]}
                    placeholder="e.g. 08012345678"
                    placeholderTextColor={colors.outline}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    onFocus={() => setIsFocused('phone')}
                    onBlur={() => setIsFocused(null)}
                    editable={!loading}
                  />
                </View>
              </View>
            )}

            {/* Account Type Selector (Sign Up only) */}
            {mode === 'signup' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, Typography.metricUnit, { color: colors.textSecondary }]}>Account Type</Text>
                <View style={styles.accountTypeRow}>
                  <TouchableOpacity
                    style={[
                      styles.accountTypeBtn,
                      { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant },
                      accountType === 'household' && [styles.accountTypeBtnActive, { borderColor: colors.secondary, backgroundColor: 'rgba(132, 204, 22, 0.1)' }],
                    ]}
                    onPress={() => setAccountType('household')}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons
                      name="home-outline"
                      size={20}
                      color={accountType === 'household' ? colors.secondary : colors.outline}
                    />
                    <Text
                      style={[
                        styles.accountTypeText,
                        Typography.metricUnit,
                        { color: accountType === 'household' ? colors.secondary : colors.text },
                      ]}
                    >
                      Household
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.accountTypeBtn,
                      { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant },
                      accountType === 'business' && [styles.accountTypeBtnActive, { borderColor: colors.secondary, backgroundColor: 'rgba(132, 204, 22, 0.1)' }],
                    ]}
                    onPress={() => setAccountType('business')}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons
                      name="domain"
                      size={20}
                      color={accountType === 'business' ? colors.secondary : colors.outline}
                    />
                    <Text
                      style={[
                        styles.accountTypeText,
                        Typography.metricUnit,
                        { color: accountType === 'business' ? colors.secondary : colors.text },
                      ]}
                    >
                      Business / Shop
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, Typography.metricUnit, { color: colors.textSecondary }]}>Password</Text>
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: colors.outlineVariant },
                  isFocused === 'password' ? [styles.inputFocused, { borderColor: colors.secondary }] : null,
                  errors.password ? [styles.inputError, { borderColor: colors.error }] : null,
                ]}
              >
                <TextInput
                  style={[styles.input, Typography.bodyMd, { color: colors.text, flex: 1 }]}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
                  placeholderTextColor={colors.outline}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  onFocus={() => setIsFocused('password')}
                  onBlur={() => setIsFocused(null)}
                  editable={!loading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={22}
                    color={colors.outline}
                  />
                </TouchableOpacity>
              </View>
              {errors.password ? (
                <Text style={[styles.errorText, Typography.labelCaps, { color: colors.error }]}>{errors.password}</Text>
              ) : null}

              {/* Forgot Password Link (Sign In Mode) */}
              {mode === 'signin' && (
                <TouchableOpacity
                  onPress={() => {
                    setForgotEmail(email);
                    setForgotError(null);
                    setForgotSuccess(null);
                    setIsForgotModalOpen(true);
                  }}
                  style={styles.forgotBtn}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.forgotText, Typography.metricUnit, { color: colors.secondary }]}>
                    Forgot Password?
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }, loading ? styles.buttonDisabled : null]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Text style={[styles.buttonText, Typography.headlineMd, { color: isDark ? colors.background : colors.white, fontSize: 16 }]}>
                  {mode === 'signup' ? 'Create Account' : 'Sign In'}
                </Text>
                <MaterialIcons name="arrow-forward" size={20} color={isDark ? colors.background : colors.white} />
              </>
            )}
          </TouchableOpacity>

          {/* Mode Switch Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, Typography.bodyMd, { color: colors.textSecondary }]}>
              {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            </Text>
            <TouchableOpacity onPress={() => toggleMode(mode === 'signup' ? 'signin' : 'signup')} disabled={loading}>
              <Text style={[styles.signInText, Typography.headlineMd, { color: colors.secondary, fontSize: 15 }]}>
                {mode === 'signup' ? 'Sign In' : 'Create Account'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Recovery Modal */}
      <Modal
        visible={isForgotModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsForgotModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconWrap, { backgroundColor: 'rgba(132, 204, 22, 0.15)' }]}>
                <MaterialIcons name="lock-reset" size={28} color={colors.secondary} />
              </View>
              <TouchableOpacity onPress={() => setIsForgotModalOpen(false)} style={styles.modalCloseBtn}>
                <MaterialIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalTitle, Typography.headlineLg, { color: colors.text }]}>
              Reset Password
            </Text>
            <Text style={[styles.modalSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
              Enter your registered email address and we'll send you instructions to reset your password.
            </Text>

            {forgotSuccess ? (
              <View style={[styles.successBanner, { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.15)' : '#ECFDF5', borderColor: colors.secondary }]}>
                <MaterialIcons name="check-circle-outline" size={20} color={colors.secondary} />
                <Text style={[styles.bannerText, Typography.metricUnit, { color: colors.secondary }]}>{forgotSuccess}</Text>
              </View>
            ) : null}

            {forgotError ? (
              <View style={[styles.errorBannerModal, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2', borderColor: colors.error }]}>
                <MaterialIcons name="error-outline" size={20} color={colors.error} />
                <Text style={[styles.bannerText, Typography.metricUnit, { color: colors.error }]}>{forgotError}</Text>
              </View>
            ) : null}

            <View style={styles.modalInputGroup}>
              <Text style={[styles.label, Typography.metricUnit, { color: colors.textSecondary }]}>Registered Email</Text>
              <View style={[styles.inputWrapper, { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surfaceContainer, borderColor: colors.outlineVariant }]}>
                <TextInput
                  style={[styles.input, Typography.bodyMd, { color: colors.text }]}
                  placeholder="e.g. john@example.com"
                  placeholderTextColor={colors.outline}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={forgotEmail}
                  onChangeText={(text) => {
                    setForgotEmail(text);
                    if (forgotError) setForgotError(null);
                  }}
                  editable={!forgotLoading}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary, marginTop: Spacing.md }, forgotLoading ? styles.buttonDisabled : null]}
              onPress={handleResetPassword}
              disabled={forgotLoading}
              activeOpacity={0.85}
            >
              {forgotLoading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={[styles.buttonText, Typography.headlineMd, { color: isDark ? colors.background : colors.white, fontSize: 16 }]}>
                  Send Reset Link
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.containerMargin,
    paddingBottom: Spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Rounded.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 135,
    height: 36,
  },
  tabSwitcher: {
    flexDirection: 'row',
    borderRadius: Rounded.lg,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Rounded.md,
  },
  tabBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {},
  titleSection: {
    marginBottom: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    lineHeight: 22,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Rounded.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorBannerText: {
    flex: 1,
  },
  form: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  label: {
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1,
    borderRadius: Rounded.md,
    paddingHorizontal: Spacing.md,
  },
  input: {
    flex: 1,
    height: '100%',
  },
  inputFocused: {
    borderWidth: 1.5,
  },
  inputError: {},
  accountTypeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  accountTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    height: 48,
    borderRadius: Rounded.md,
    borderWidth: 1,
  },
  accountTypeBtnActive: {
    borderWidth: 2,
  },
  accountTypeText: {
    fontWeight: '600',
  },
  eyeIcon: {
    padding: Spacing.xs,
  },
  errorText: {
    marginTop: 2,
  },
  button: {
    height: 52,
    borderRadius: Rounded.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: Spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    paddingVertical: Spacing.md,
  },
  footerText: {},
  signInText: {
    fontWeight: '700',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: Spacing.xs,
    paddingVertical: 4,
  },
  forgotText: {
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: Spacing.containerMargin,
  },
  modalContent: {
    borderRadius: Rounded.lg,
    padding: Spacing.lg,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  modalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalTitle: {
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Rounded.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorBannerModal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Rounded.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
  },
  modalInputGroup: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
});
