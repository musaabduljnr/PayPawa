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
import Svg, { Circle, Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
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
  tags: string[];
  illustrationType: 'vending' | 'analytics' | 'security';
}

const SLIDES: OnboardingSlide[] = [
  {
    id: '1',
    badge: 'FAST & RELIABLE VENDING',
    title: 'Instant Electricity',
    highlight: 'Recharge & Tokens',
    description: 'Buy prepaid STS meter tokens & pay bills across all 11 DISCOs with 0% gateway fees.',
    tags: ['IKEDC', 'EKEDC', 'AEDC', 'IBEDC', 'YEDC', 'KAEDCO'],
    illustrationType: 'vending',
  },
  {
    id: '2',
    badge: 'ENERGY INTELLIGENCE',
    title: 'Smart Appliance',
    highlight: 'Power Analytics',
    description: 'Profile your appliances, track heavy power loads, and predict your daily kWh usage.',
    tags: ['Daily Baseline', 'Load Detection', 'Cost Optimization'],
    illustrationType: 'analytics',
  },
  {
    id: '3',
    badge: 'SECURE WALLET',
    title: 'Zero Token Loss',
    highlight: 'Lifetime Storage',
    description: 'Never lose a 20-digit STS token again. Automatic cloud backup & instant receipts.',
    tags: ['20-Digit STS', 'PDF Receipts', 'Instant Backup'],
    illustrationType: 'security',
  },
];

function SlideIllustration({ type, colors, isDark }: { type: 'vending' | 'analytics' | 'security'; colors: any; isDark: boolean }) {
  const primaryColor = colors.primary;
  const greenColor = colors.secondary;
  const darkGreen = colors.secondaryDark;

  if (type === 'vending') {
    return (
      <View style={styles.illustrationCard}>
        {/* Ambient Pulsing Glow Rings */}
        <View style={[styles.outerGlowRing, { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.08)' : 'rgba(132, 204, 22, 0.14)' }]}>
          <View style={[styles.innerGlowRing, { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.12)' : 'rgba(132, 204, 22, 0.22)' }]}>
            <View style={[styles.coreCircle, { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: isDark ? colors.outlineVariant : '#E5E7EB' }]}>
              <MaterialCommunityIcons name="lightning-bolt" size={54} color={greenColor} />
            </View>
          </View>
        </View>

        {/* Floating Accent Badge Top Right */}
        <View style={[styles.floatingBadgeTop, { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surface, borderColor: colors.outlineVariant }]}>
          <MaterialIcons name="bolt" size={14} color={darkGreen} />
          <Text style={[styles.floatingBadgeText, Typography.labelCaps, { color: colors.primary }]}>0% Gateway Fee</Text>
        </View>

        {/* Floating Accent Badge Bottom Left */}
        <View style={[styles.floatingBadgeBottom, { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surface, borderColor: colors.outlineVariant }]}>
          <MaterialCommunityIcons name="shield-check" size={14} color={darkGreen} />
          <Text style={[styles.floatingBadgeText, Typography.labelCaps, { color: colors.primary }]}>11 DISCOs Connected</Text>
        </View>
      </View>
    );
  }

  if (type === 'analytics') {
    return (
      <View style={styles.illustrationCard}>
        {/* Ambient Glow Rings */}
        <View style={[styles.outerGlowRing, { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.08)' : 'rgba(132, 204, 22, 0.14)' }]}>
          <View style={[styles.innerGlowRing, { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.12)' : 'rgba(132, 204, 22, 0.22)' }]}>
            <View style={[styles.coreCircle, { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: isDark ? colors.outlineVariant : '#E5E7EB' }]}>
              <MaterialCommunityIcons name="chart-timeline-variant-shimmer" size={50} color={greenColor} />
            </View>
          </View>
        </View>

        {/* Floating Accent Badge Top Right */}
        <View style={[styles.floatingBadgeTop, { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surface, borderColor: colors.outlineVariant }]}>
          <MaterialIcons name="trending-down" size={14} color={darkGreen} />
          <Text style={[styles.floatingBadgeText, Typography.labelCaps, { color: colors.primary }]}>-15% Power Waste</Text>
        </View>

        {/* Floating Accent Badge Bottom Left */}
        <View style={[styles.floatingBadgeBottom, { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surface, borderColor: colors.outlineVariant }]}>
          <MaterialIcons name="speed" size={14} color={darkGreen} />
          <Text style={[styles.floatingBadgeText, Typography.labelCaps, { color: colors.primary }]}>Daily kWh Predictor</Text>
        </View>
      </View>
    );
  }

  // Security slide
  return (
    <View style={styles.illustrationCard}>
      {/* Ambient Glow Rings */}
      <View style={[styles.outerGlowRing, { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.08)' : 'rgba(132, 204, 22, 0.14)' }]}>
        <View style={[styles.innerGlowRing, { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.12)' : 'rgba(132, 204, 22, 0.22)' }]}>
          <View style={[styles.coreCircle, { backgroundColor: isDark ? colors.surfaceContainerLow : colors.surface, borderColor: isDark ? colors.outlineVariant : '#E5E7EB' }]}>
            <MaterialCommunityIcons name="shield-lock-outline" size={52} color={greenColor} />
          </View>
        </View>
      </View>

      {/* Floating Accent Badge Top Right */}
      <View style={[styles.floatingBadgeTop, { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surface, borderColor: colors.outlineVariant }]}>
        <MaterialIcons name="lock" size={14} color={darkGreen} />
        <Text style={[styles.floatingBadgeText, Typography.labelCaps, { color: colors.primary }]}>20-Digit STS Safe</Text>
      </View>

      {/* Floating Accent Badge Bottom Left */}
      <View style={[styles.floatingBadgeBottom, { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.surface, borderColor: colors.outlineVariant }]}>
        <MaterialIcons name="receipt-long" size={14} color={darkGreen} />
        <Text style={[styles.floatingBadgeText, Typography.labelCaps, { color: colors.primary }]}>Instant PDF Receipts</Text>
      </View>
    </View>
  );
}

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

  const navigateToSignUp = () => {
    router.push({ pathname: '/signup', params: { mode: 'signup' } });
  };

  const navigateToSignIn = () => {
    router.push({ pathname: '/signup', params: { mode: 'signin' } });
  };

  // Auto-slide carousel interval (3.5 seconds)
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % SLIDES.length;
        flatListRef.current?.scrollToIndex({
          index: nextIndex,
          animated: true,
        });
        return nextIndex;
      });
    }, 3500);

    return () => clearInterval(timer);
  }, []);

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
        {/* Graphic & Illustration Centerpiece */}
        <SlideIllustration type={item.illustrationType} colors={colors} isDark={isDark} />

        {/* Content Section */}
        <View style={styles.textContainer}>
          {/* Badge */}
          <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.15)' : 'rgba(132, 204, 22, 0.2)' }]}>
            <Text style={[styles.badgeText, Typography.labelCaps, { color: colors.secondaryDark }]}>
              {item.badge}
            </Text>
          </View>

          {/* Heading */}
          <Text style={[styles.title, Typography.headlineLg, { color: colors.text }]}>
            {item.title}{'\n'}
            <Text style={{ color: colors.secondaryDark }}>{item.highlight}</Text>
          </Text>

          {/* Compact Description */}
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
      {/* Top Header with PayPawa Branding */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={[styles.logoBadge, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons name="bolt" size={20} color={colors.secondary} />
          </View>
          <Text style={[styles.logoText, Typography.headlineMd, { color: colors.primary, fontSize: 20 }]}>
            Pay<Text style={{ color: colors.secondary }}>Pawa</Text>
          </Text>
        </View>
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
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
        }}
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
                    ? [styles.activeDot, { backgroundColor: colors.secondaryDark }]
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
              Already have an account? <Text style={{ color: colors.secondaryDark, fontWeight: '700' }}>Log In</Text>
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
  carousel: {
    flex: 1,
  },
  slideContainer: {
    flex: 1,
    paddingHorizontal: Spacing.containerMargin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationCard: {
    width: 260,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: Spacing.md,
  },
  outerGlowRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerGlowRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  floatingBadgeTop: {
    position: 'absolute',
    top: 10,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Rounded.full,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  floatingBadgeBottom: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Rounded.full,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  floatingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Rounded.full,
    marginBottom: Spacing.sm,
  },
  badgeText: {
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.xs,
    fontSize: 24,
    lineHeight: 30,
  },
  description: {
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.sm,
    maxWidth: 310,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
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
    paddingTop: Spacing.xs,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  activeDot: {
    width: 24,
  },
  inactiveDot: {
    width: 6,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
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
