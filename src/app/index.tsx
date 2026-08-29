import React, { useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function Index() {
  const { isLoadingAuth, isLoggedIn, isOnboarded } = useApp();

  if (isLoadingAuth) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.logoCircle}>
          <MaterialCommunityIcons name="bolt" size={36} color={Colors.secondary} />
        </View>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.lg }} />
        <Text style={[styles.loadingText, Typography.bodyMd]}>Loading your energy profile...</Text>
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

  // 2. Unauthenticated / First launch -> Send to Onboarding Flow
  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.containerMargin,
  },
  logoCircle: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
});
