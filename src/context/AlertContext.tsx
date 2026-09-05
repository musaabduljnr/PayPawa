import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';
import { Typography, Rounded, Spacing } from '@/constants/theme';

export type AlertType = 'info' | 'success' | 'warning' | 'error' | 'confirm';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface AlertOptions {
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AlertButton[];
  dismissable?: boolean;
}

interface AlertContextValue {
  showAlert: (options: AlertOptions) => void;
  hideAlert: () => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

// Global static dispatcher for non-hook call sites
let globalShowAlert: ((options: AlertOptions) => void) | null = null;
let globalHideAlert: (() => void) | null = null;

export const CustomAlert = {
  alert: (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: { type?: AlertType; dismissable?: boolean }
  ) => {
    if (globalShowAlert) {
      globalShowAlert({
        title,
        message,
        type: options?.type || (buttons && buttons.some(b => b.style === 'destructive') ? 'confirm' : 'info'),
        buttons: buttons || [{ text: 'OK', style: 'default' }],
        dismissable: options?.dismissable ?? true,
      });
    } else {
      console.warn('[CustomAlert] Provider not mounted yet:', title, message);
    }
  },
  hide: () => {
    if (globalHideAlert) globalHideAlert();
  },
};

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  const [alertConfig, setAlertConfig] = useState<AlertOptions | null>(null);
  const [visible, setVisible] = useState(false);

  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const hideAlert = useCallback(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.85,
        duration: 150,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setAlertConfig(null);
    });
  }, [scaleAnim, opacityAnim]);

  const showAlert = useCallback(
    (options: AlertOptions) => {
      setAlertConfig(options);
      setVisible(true);

      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [scaleAnim, opacityAnim]
  );

  // Set global dispatchers
  globalShowAlert = showAlert;
  globalHideAlert = hideAlert;

  const getIconConfig = (type?: AlertType) => {
    switch (type) {
      case 'success':
        return {
          name: 'check-circle-outline',
          color: colors.secondaryDark,
          bgColor: colors.successBg,
        };
      case 'error':
        return {
          name: 'error-outline',
          color: colors.error,
          bgColor: colors.errorBg,
        };
      case 'warning':
      case 'confirm':
        return {
          name: 'warning-amber',
          color: '#f59e0b',
          bgColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7',
        };
      case 'info':
      default:
        return {
          name: 'info-outline',
          color: colors.secondaryDark,
          bgColor: isDark ? colors.surfaceContainerHigh : colors.surfaceContainer,
        };
    }
  };

  const iconConfig = getIconConfig(alertConfig?.type);
  const buttons = alertConfig?.buttons && alertConfig.buttons.length > 0
    ? alertConfig.buttons
    : [{ text: 'OK', style: 'default' as const }];

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}

      <Modal
        transparent
        visible={visible}
        animationType="none"
        onRequestClose={() => {
          if (alertConfig?.dismissable !== false) {
            hideAlert();
          }
        }}
        statusBarTranslucent
      >
        <TouchableWithoutFeedback
          onPress={() => {
            if (alertConfig?.dismissable !== false) {
              hideAlert();
            }
          }}
        >
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <Animated.View
                style={[
                  styles.dialogCard,
                  {
                    backgroundColor: colors.cardBg,
                    borderColor: colors.cardBorder,
                    opacity: opacityAnim,
                    transform: [{ scale: scaleAnim }],
                  },
                ]}
              >
                {/* Status Icon Header */}
                <View style={[styles.iconCircle, { backgroundColor: iconConfig.bgColor }]}>
                  <MaterialIcons name={iconConfig.name as any} size={28} color={iconConfig.color} />
                </View>

                {/* Dialog Content */}
                <Text style={[styles.dialogTitle, Typography.headlineMd, { color: colors.primary }]}>
                  {alertConfig?.title}
                </Text>

                {alertConfig?.message ? (
                  <Text style={[styles.dialogMessage, Typography.bodyMd, { color: colors.textSecondary }]}>
                    {alertConfig.message}
                  </Text>
                ) : null}

                {/* Button Action Bar */}
                <View
                  style={[
                    styles.buttonRow,
                    buttons.length > 2 ? styles.buttonColumn : null,
                  ]}
                >
                  {buttons.map((btn, index) => {
                    const isCancel = btn.style === 'cancel';
                    const isDestructive = btn.style === 'destructive';

                    let btnBg = colors.secondaryDark;
                    let textColor = '#ffffff';
                    let borderColor = 'transparent';

                    if (isCancel) {
                      btnBg = isDark ? colors.surfaceContainerHigh : colors.surfaceContainerLow;
                      textColor = colors.text;
                      borderColor = colors.outlineVariant;
                    } else if (isDestructive) {
                      btnBg = colors.error;
                      textColor = '#ffffff';
                    }

                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.actionButton,
                          {
                            backgroundColor: btnBg,
                            borderColor,
                            borderWidth: isCancel ? 1 : 0,
                            flex: buttons.length <= 2 ? 1 : undefined,
                            width: buttons.length > 2 ? '100%' : undefined,
                          },
                        ]}
                        activeOpacity={0.8}
                        onPress={() => {
                          hideAlert();
                          if (btn.onPress) {
                            btn.onPress();
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.actionButtonText,
                            Typography.headlineMd,
                            { fontSize: 15, color: textColor },
                          ]}
                          numberOfLines={1}
                        >
                          {btn.text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAlertModal() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlertModal must be used within an AlertProvider');
  }
  return context;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  dialogCard: {
    width: Math.min(SCREEN_WIDTH - 48, 380),
    borderRadius: Rounded.xl,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
      },
    }),
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  dialogTitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'Inter_700Bold',
  },
  dialogMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  buttonColumn: {
    flexDirection: 'column',
    gap: 10,
  },
  actionButton: {
    height: 46,
    borderRadius: Rounded.full,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  actionButtonText: {
    fontFamily: 'Inter_600SemiBold',
  },
});
