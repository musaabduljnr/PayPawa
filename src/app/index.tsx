import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Image, StatusBar, Animated } from 'react-native';
import { Redirect } from 'expo-router';
import { useApp } from '@/context/AppContext';

export default function SplashScreen() {
  const { isLoadingAuth, isLoggedIn, isOnboarded } = useApp();
  const [minTimerElapsed, setMinTimerElapsed] = useState(false);
  const fadeAnim = useState(() => new Animated.Value(0))[0];
  const scaleAnim = useState(() => new Animated.Value(0.92))[0];

  useEffect(() => {
    // Subtle, elegant logo entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Enforce 2.5 second splash display duration (2-3 seconds per technical requirements)
    const timer = setTimeout(() => {
      setMinTimerElapsed(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [fadeAnim, scaleAnim]);

  // While splash duration is active or authentication state is initializing
  if (!minTimerElapsed || isLoadingAuth) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <Animated.View
          style={[
            styles.logoWrapper,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Image
            source={require('@/assets/images/paypawa-logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel="PayPawa Logo"
          />
        </Animated.View>
      </View>
    );
  }

  // 1. Authenticated -> Check if Personalization Energy Setup is completed
  if (isLoggedIn) {
    if (!isOnboarded) {
      return <Redirect href="/energy-setup" />;
    }
    return <Redirect href="/(tabs)/home" />;
  }

  // 2. Unauthenticated / First launch -> Route to Onboarding Flow
  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 32,
  },
  logoImage: {
    width: 240,
    height: 100,
  },
});
