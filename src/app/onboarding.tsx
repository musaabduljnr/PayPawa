import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingSlide {
  id: string;
  badge: string;
  title: string;
  highlight: string;
  description: string;
  iconName: string;
  iconType: 'community' | 'material';
  tags: string[];
}

const SLIDES: OnboardingSlide[] = [
  {
    id: '1',
    badge: '⚡ FAST & RELIABLE VENDING',
    title: 'Instant Electricity',
    highlight: 'Recharge & Tokens',
    description:
      'Buy prepaid STS meter tokens and pay postpaid bills across all 11 Nigerian DISCOs (IKEDC, EKEDC, AEDC, IBEDC, YEDC, and more) with 0% gateway fees and instant delivery.',
    iconName: 'lightning-bolt-circle',
    iconType: 'community',
    tags: ['IKEDC', 'EKEDC', 'AEDC', 'IBEDC', 'YEDC', 'KAEDCO'],
  },
  {
    id: '2',
    badge: '📊 ENERGY INTELLIGENCE',
    title: 'Smart Appliance',
    highlight: 'Power Analytics',
    description:
      'Profile your home or business appliances. Understand which heavy loads (ACs, deep freezers, pumping machines) consume the most power and calculate your baseline daily kWh.',
    iconName: 'chart-timeline-variant-shimmer',
    iconType: 'community',
    tags: ['Daily kWh Baseline', 'Heavy Load Detection', 'Cost Optimization'],
  },
  {
    id: '3',
    badge: '🔒 SAFE & SECURE WALLET',
    title: 'Zero Token Loss',
    highlight: 'Lifetime History',
    description:
      'Never lose a 20-digit STS token again. Every transaction is stored securely with instant receipt generation, SMS backup, and seamless wallet-to-meter payments.',
    iconName: 'shield-check-outline',
    iconType: 'community',
    tags: ['Instant STS Token', 'PDF Receipts', 'Automated History'],
  },
];

export default function OnboardingScreen() {
  const { colors, isDark } = useTheme();
  const { isLoggedIn } = useApp();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollOffset / SCREEN_WIDTH);
    if (index !== currentIndex && index >= 0 && index < SLIDES.length) {
      setCurrentIndex(index);
    }
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      router.push({ pathname: '/signup', params: { mode: 'signup' } });
    }
  };

  const navigateToSignUp = () => {
    router.push({ pathname: '/signup', params: { mode: 'signup' } });
  };

  const navigateToSignIn = () => {
    router.push({ pathname: '/signup', params: { mode: 'signin' } });
  };

  // If already logged in, redirect to dashboard inside useEffect
  React.useEffect(() => {
    if (isLoggedIn) {
      router.replace('/(tabs)/home');
    }
  }, [isLoggedIn]);

  if (isLoggedIn) {
    return null;
  }

  const renderSlide = ({ item }: { item: OnboardingSlide }) => {
    return (
      <View style={[styles.slideContainer, { width: SCREEN_WIDTH }]}>
        {/* Graphic & Icon Centerpiece */}
        <View style={styles.graphicWrap}>
          <View style={[styles.glowRing, { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.08)' : 'rgba(132, 204, 22, 0.15)' }]}>
            <View style={[styles.innerCircle, { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: isDark ? colors.outlineVariant : '#E5E7EB' }]}>
              {item.iconType === 'community' ? (
                <MaterialCommunityIcons name={item.iconName as any} size={64} color={colors.secondary} />
              ) : (
                <MaterialIcons name={item.iconName as any} size={64} color={colors.secondary} />
              )}
            </View>
          </View>
        </View>

        {/* Content Section */}
        <View style={styles.textContainer}>
          {/* Badge */}
          <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.15)' : 'rgba(132, 204, 22, 0.2)' }]}>
            <Text style={[styles.badgeText, Typography.labelCaps, { color: colors.secondary }]}>
              {item.badge}
            </Text>
          </View>

          {/* Heading */}
          <Text style={[styles.title, Typography.headlineLg, { color: colors.text }]}>
            {item.title}{'\n'}
            <Text style={{ color: colors.secondary }}>{item.highlight}</Text>
          </Text>

          {/* Description */}
          <Text style={[styles.description, Typography.bodyMd, { color: colors.textSecondary }]}>
            {item.description}
          </Text>

          {/* Tag Pills */}
          <View style={styles.tagRow}>
            {item.tags.map((tag, i) => (
              <View
                key={i}
                style={[
                  styles.tagPill,
                  {
                    backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainerLow,
                    borderColor: colors.outlineVariant,
                  },
                ]}
              >
                <Text style={[styles.tagText, Typography.labelCaps, { color: colors.textSecondary }]}>
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header with Skip Option */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={[styles.logoBadge, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons name="bolt" size={20} color={colors.secondary} />
          </View>
          <Text style={[styles.logoText, Typography.headlineMd, { color: colors.primary, fontSize: 18 }]}>
            Smart<Text style={{ color: colors.secondary }}>Electricity</Text>
          </Text>
        </View>

        <TouchableOpacity onPress={navigateToSignIn} style={styles.skipBtn} activeOpacity={0.7}>
          <Text style={[styles.skipText, Typography.metricUnit, { color: colors.secondary }]}>
            Log In
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Carousel */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
        style={styles.carousel}
      />

      {/* Bottom Controls */}
      <View style={styles.footer}>
        {/* Pagination Dots */}
        <View style={styles.paginationRow}>
          {SLIDES.map((_, index) => {
            const isActive = index === currentIndex;
            return (
              <View
                key={index}
                style={[
                  styles.dot,
                  isActive
                    ? [styles.activeDot, { backgroundColor: colors.secondary }]
                    : [styles.inactiveDot, { backgroundColor: colors.outlineVariant }],
                ]}
              />
            );
          })}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={navigateToSignUp}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryBtnText, Typography.headlineMd, { color: isDark ? colors.background : colors.white, fontSize: 16 }]}>
              Get Started
            </Text>
            <MaterialIcons name="arrow-forward" size={20} color={isDark ? colors.background : colors.white} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              {
                backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface,
                borderColor: colors.outlineVariant,
              },
            ]}
            onPress={navigateToSignIn}
            activeOpacity={0.8}
          >
            <Text style={[styles.secondaryBtnText, Typography.metricUnit, { color: colors.text }]}>
              Already have an account? <Text style={{ color: colors.secondary, fontWeight: '700' }}>Log In</Text>
            </Text>
          </TouchableOpacity>
        </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.containerMargin,
    paddingVertical: Spacing.sm,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  skipBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  skipText: {
    fontWeight: '700',
  },
  carousel: {
    flex: 1,
  },
  slideContainer: {
    flex: 1,
    paddingHorizontal: Spacing.containerMargin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  graphicWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.lg,
  },
  glowRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Rounded.full,
    marginBottom: Spacing.md,
  },
  badgeText: {
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  description: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.md,
    maxWidth: 320,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.xs,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Rounded.full,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: Spacing.containerMargin,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.lg,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 24,
  },
  inactiveDot: {
    width: 8,
  },
  actionRow: {
    gap: Spacing.sm,
  },
  primaryBtn: {
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
  },
  primaryBtnText: {
    fontWeight: '700',
  },
  secondaryBtn: {
    height: 48,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
  },
});
