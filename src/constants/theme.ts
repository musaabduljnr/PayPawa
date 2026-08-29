import { Platform } from 'react-native';

export type ColorPalette = {
  primary: string;
  secondary: string;
  secondaryDark: string;
  background: string;
  surface: string;
  cardBg: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  outline: string;
  outlineVariant: string;
  error: string;
  errorBg: string;
  onErrorText: string;
  successBg: string;
  white: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  surfaceVariant: string;
  backgroundSelected: string;
  backgroundElement: string;
};

export const LightColors: ColorPalette = {
  primary: '#0f172a',
  secondary: '#84cc16',
  secondaryDark: '#416900',
  background: '#fcf8fa',
  surface: '#ffffff',
  cardBg: '#f8fafc',
  cardBorder: '#e2e8f0',
  text: '#1b1b1d',
  textSecondary: '#45464d',
  outline: '#76777d',
  outlineVariant: '#c6c6cd',
  error: '#ba1a1a',
  errorBg: '#ffdad6',
  onErrorText: '#93000a',
  successBg: '#E7F6D1',
  white: '#ffffff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f6f3f5',
  surfaceContainer: '#f0edef',
  surfaceContainerHigh: '#eae7e9',
  surfaceContainerHighest: '#e4e2e4',
  surfaceVariant: '#eae7e9',
  backgroundSelected: '#f0edef',
  backgroundElement: '#ffffff',
};

export const DarkColors: ColorPalette = {
  primary: '#e8edf5',           // Light text on dark bg
  secondary: '#84cc16',         // Same green accent
  secondaryDark: '#acf847',     // Brighter green for dark surfaces
  background: '#0d1117',        // Deep dark background
  surface: '#161b22',           // Card surface
  cardBg: '#1c2128',            // Slightly elevated card
  cardBorder: '#30363d',        // Subtle border
  text: '#e6edf3',              // High contrast text
  textSecondary: '#8b949e',     // Muted secondary text
  outline: '#6e7681',           // Outline
  outlineVariant: '#30363d',    // Subtle divider
  error: '#f85149',
  errorBg: '#3d1212',
  onErrorText: '#ff7b72',
  successBg: '#1a2f0f',
  white: '#ffffff',
  surfaceContainerLowest: '#0d1117',
  surfaceContainerLow: '#161b22',
  surfaceContainer: '#1c2128',
  surfaceContainerHigh: '#21262d',
  surfaceContainerHighest: '#30363d',
  surfaceVariant: '#21262d',
  backgroundSelected: '#1c2128',
  backgroundElement: '#161b22',
};

// Static light export — kept for files that haven't migrated to useTheme() yet
const BaseColors: ColorPalette = LightColors;

export const Colors = {
  ...BaseColors,
  light: BaseColors,
  dark: DarkColors,
};

export type ThemeColor = keyof ColorPalette;

export function getColors(isDark: boolean): ColorPalette {
  return isDark ? DarkColors : LightColors;
}

export const Fonts = {
  mono: Platform.select({ ios: 'SpaceMono', android: 'SpaceMono', default: 'monospace' }),
};

export const Spacing = {
  base: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  containerMargin: 20,
  cardGap: 16,
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
} as const;

export const Rounded = {
  sm: 4,
  default: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const Typography = {
  displayMetrics: {
    fontFamily: 'Inter_700Bold',
    fontSize: 48,
    lineHeight: 56,
    letterSpacing: -0.02,
  },
  headlineLg: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.01,
  },
  headlineLgMobile: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    lineHeight: 32,
  },
  headlineMd: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    lineHeight: 28,
  },
  bodyLg: {
    fontFamily: 'Inter_400Regular',
    fontSize: 18,
    lineHeight: 28,
  },
  bodyMd: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  labelCaps: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.05,
  },
  metricUnit: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 20,
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
