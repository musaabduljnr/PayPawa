import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { AppProvider } from '@/context/AppContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { AlertProvider } from '@/context/AlertContext';

SplashScreen.preventAutoHideAsync();

function ThemedApp() {
  const { colors, isDark } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
        initialRouteName="index"
      >
        {/* Root Route Gatekeeper */}
        <Stack.Screen name="index" options={{ animation: 'fade' }} />

        {/* Authentication/Onboarding Flow */}
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="signup" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="energy-setup" options={{ presentation: 'card', animation: 'slide_from_right' }} />

        {/* Main Tab Navigator */}
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />

        {/* Transactional/Modal Screens */}
        <Stack.Screen name="personal-info" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="add-meter" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="manage-meters" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="verify-meter" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="buy-electricity" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="fund-wallet" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="payment-success" options={{ presentation: 'card', animation: 'fade' }} />
        <Stack.Screen name="notifications" options={{ presentation: 'card', animation: 'slide_from_right' }} />
      </Stack>
    </View>
  );
}

import { AppErrorBoundary } from '@/components/AppErrorBoundary';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppProvider>
            <AlertProvider>
              <ThemedApp />
            </AlertProvider>
          </AppProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
