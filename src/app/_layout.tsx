import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { AppProvider } from '@/context/AppContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';

SplashScreen.preventAutoHideAsync();

function ThemedApp() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        {/* Main Tab Navigator */}
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />

        {/* Authentication/Onboarding Flow */}
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="signup" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="energy-setup" options={{ presentation: 'card', animation: 'slide_from_right' }} />

        {/* Transactional/Modal Screens */}
        <Stack.Screen name="add-meter" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="manage-meters" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="verify-meter" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="buy-electricity" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="fund-wallet" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="payment-success" options={{ presentation: 'card', animation: 'fade' }} />
        <Stack.Screen name="notifications" options={{ presentation: 'card', animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}

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
    <ThemeProvider>
      <AppProvider>
        <ThemedApp />
      </AppProvider>
    </ThemeProvider>
  );
}
