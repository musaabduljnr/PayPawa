import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AuthService,
  EnergyService,
  WalletService,
  WalletFundingService,
  LedgerService,
  PaymentMethodType,
  MetersService,
  ElectricityService,
  NotificationsService,
  NotificationPreferencesService,
  SmartAlertsService,
  ConsumptionAnalyticsService,
  MeterReadingService,
  RecordMeterReadingResult,
  EnergyIntelligenceService,
  LoggerService,
  SupportService,
} from '@/services';
import type {
  AppNotification,
  NotificationPreferences,
} from '@/types/notifications';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/notifications';
export type { AppNotification, NotificationPreferences };
import type { 
  UserProfile, 
  EnergyProfile, 
  UserAppliance, 
  ApplianceItemInput,
  AccountTypeEnum 
} from '@/types/auth';
import type {
  ConsumptionAnalyticsResponse,
  ApplianceContributionEstimate,
  MeterReading,
} from '@/types/consumption';
import type {
  AIChatMessage,
  SuggestedQuestion,
  AIQueryOptions,
  StructuredInsightsAnalytics,
  AIEngineHealthStatus,
} from '@/types/ai';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { AIAnalyticsEngine } from '@/services/ai/ai-analytics-engine.service';

export interface Meter {
  id: string;
  name: string;
  number: string;
  disco: string;
  address: string;
  customerName?: string;
  tariffCode?: string;
  active: boolean;
}

export interface Transaction {
  id: string;
  title: string;
  type: 'purchase' | 'funding';
  date: string;
  createdAt?: string;
  amount: number;
  units?: number;
  token?: string;
  status: 'Completed' | 'Pending' | 'Failed';
  reference: string;
  meterNumber?: string;
  description?: string;
  errorMessage?: string;
}

interface AppContextProps {
  // Auth & Session State
  session: Session | null;
  user: User | null;
  userProfile: UserProfile | null;
  energyProfile: EnergyProfile | null;
  appliances: UserAppliance[];
  isLoadingAuth: boolean;
  isLoggedIn: boolean;
  isOnboarded: boolean;
  userName: string;
  userEmail: string;
  userPhone: string;
  accountType: AccountTypeEnum;

  // Wallet & Meter State
  walletBalance: number;
  meters: Meter[];
  activeMeterId: string | null;
  activeMeter?: Meter;
  isSwitchingMeter: boolean;
  transactions: Transaction[];
  notifications: AppNotification[];
  unreadCount: number;
  notificationPreferences: NotificationPreferences;
  updateNotificationPreferences: (
    partial: Partial<Omit<NotificationPreferences, 'userId'>>
  ) => Promise<void>;
  refreshNotifications: (overrideMeterId?: string | null) => Promise<void>;

  // Actions
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string; profile?: UserProfile | null; isOnboarded?: boolean }>;
  signup: (
    name: string,
    email: string,
    password?: string,
    phone?: string,
    accountType?: AccountTypeEnum
  ) => Promise<{ success: boolean; error?: string; profile?: UserProfile | null; isOnboarded?: boolean }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  completeOnboarding: (
    profileData: {
      accountType: AccountTypeEnum;
      occupantsCount: number;
      buildingType?: string;
      primaryCookingSource?: string;
      hasSolar?: boolean;
      hasGenerator?: boolean;
    },
    appliances: ApplianceItemInput[]
  ) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (
    name: string,
    email?: string,
    phone?: string,
    accountType?: AccountTypeEnum
  ) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
  refreshEnergyProfile: () => Promise<void>;

  // Meter & Wallet Actions
  addMeter: (
    disco: string,
    number: string,
    name: string,
    address: string,
    customerName?: string,
    tariffCode?: string
  ) => Meter;
  selectMeter: (id: string) => void;
  deleteMeter: (id: string) => void;
  renameMeter: (id: string, name: string) => void;
  fundWallet: (
    amount: number,
    method?: PaymentMethodType
  ) => Promise<{
    success: boolean;
    reference?: string;
    paymentAttemptId?: string;
    checkoutUrl?: string;
    virtualAccount?: any;
    ussdCode?: string;
    newBalanceNaira?: number;
    errorMessage?: string;
  }>;
  refreshWallet: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  consumptionAnalytics: ConsumptionAnalyticsResponse | null;
  aiAnalytics: StructuredInsightsAnalytics | null;
  aiEngineStatus: AIEngineHealthStatus;
  checkAIEngineHealth: () => Promise<{ status: AIEngineHealthStatus; provider: string; model: string; message: string; latencyMs: number }>;
  applianceEstimates: ApplianceContributionEstimate[];
  refreshAnalytics: (period?: '7d' | '30d' | '90d' | '1y') => Promise<void>;
  recordMeterReading: (
    meterId: string,
    readingValue: number,
    recordedAt?: string
  ) => Promise<RecordMeterReadingResult>;
  askEnergyAssistant: (
    question: string,
    options?: Partial<AIQueryOptions>
  ) => Promise<{ success: boolean; message: AIChatMessage; errorMessage?: string }>;
  suggestedQuestions: SuggestedQuestion[];
  aiMessages: AIChatMessage[];
  isAiLoading: boolean;
  recordAiFeedback: (messageId: string, isHelpful: boolean, reason?: string) => Promise<boolean>;
  clearAiChat: () => void;
  buyElectricity: (
    amount: number,
    phone?: string
  ) => Promise<{ success: boolean; token?: string; transaction?: Transaction; errorMessage?: string }>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  addNotification: (notif: {
    type: AppNotification['type'];
    title: string;
    body: string;
  }) => void;
  unreadSupportCount: number;
  refreshSupportCount: () => Promise<void>;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [energyProfile, setEnergyProfile] = useState<EnergyProfile | null>(null);
  const [appliances, setAppliances] = useState<UserAppliance[]>([]);
  const [consumptionAnalytics, setConsumptionAnalytics] = useState<ConsumptionAnalyticsResponse | null>(null);
  const [aiAnalytics, setAiAnalytics] = useState<StructuredInsightsAnalytics | null>(null);
  const [aiEngineStatus, setAiEngineStatus] = useState<AIEngineHealthStatus>('CONNECTED');
  const analyticsReqSeqRef = useRef<number>(0);
  const notifReqSeqRef = useRef<number>(0);
  const questionsReqSeqRef = useRef<number>(0);
  const meterAbortControllerRef = useRef<AbortController | null>(null);
  const [isSwitchingMeter, setIsSwitchingMeter] = useState<boolean>(false);
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState<SuggestedQuestion[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Fallback / Display properties derived from Profile or local state
  const [localName, setLocalName] = useState('Customer');
  const [localEmail, setLocalEmail] = useState('');
  const [localPhone, setLocalPhone] = useState('');
  const [localAccountType, setLocalAccountType] = useState<AccountTypeEnum>('household');
  const [walletBalance, setWalletBalance] = useState(0);

  const [meters, setMeters] = useState<Meter[]>([]);
  const [activeMeterId, setActiveMeterId] = useState<string | null>(null);
  const activeMeter = meters.find((m) => m.id === activeMeterId) || (meters.length > 0 ? meters[0] : undefined);

  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    userId: '',
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  });

  // Authoritative unread count dynamically scoped to active meter
  const unreadCount = useMemo(() => {
    return notifications.filter(
      (n) => !n.read && (n.meterId === null || n.meterId === undefined || n.meterId === activeMeterId)
    ).length;
  }, [notifications, activeMeterId]);

  // Support replies unread count
  const [unreadSupportCount, setUnreadSupportCount] = useState<number>(0);

  const refreshSupportCount = useCallback(async () => {
    const activeUserId = user?.id || session?.user?.id;
    if (!activeUserId) {
      setUnreadSupportCount(0);
      return;
    }
    try {
      const count = await SupportService.getUnreadSupportCount();
      setUnreadSupportCount(count);
    } catch (e) {
      console.warn('[AppContext] Error fetching unread support count:', e);
    }
  }, [user?.id, session?.user?.id]);

  // ── Sync User & Profile Data ────────────────────────
  const syncProfileData = useCallback(async (userId: string) => {
    try {
      const profile = await AuthService.getProfile(userId);
      if (profile) {
        setUserProfile(profile);
        setLocalName(profile.full_name || 'Customer');
        setLocalEmail(profile.email || '');
        setLocalPhone(profile.phone || profile.phone_number || '');
        setLocalAccountType(profile.account_type || 'household');
      }

      const eProfile = await EnergyService.getEnergyProfile(userId);
      if (eProfile) setEnergyProfile(eProfile);

      const apps = await EnergyService.getUserAppliances(userId);
      if (apps) setAppliances(apps);

      // Fetch meters from Supabase
      const { data: meterData } = await supabase
        .from('meters')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (meterData && meterData.length > 0) {
        const mappedMeters: Meter[] = meterData.map((m) => ({
          id: m.id,
          name: m.nickname || 'Meter',
          number: m.meter_number,
          disco: `${m.disco_name || m.disco_code?.toUpperCase()} (${m.meter_type === 'postpaid' ? 'Postpaid' : 'Prepaid'})`,
          address: m.address || 'Service Address',
          customerName: m.customer_name || 'Customer',
          tariffCode: 'Active Band',
          active: m.is_active,
        }));
        setMeters(mappedMeters);
        const activeM = mappedMeters.find((m) => m.active) || mappedMeters[0];
        setActiveMeterId(activeM.id);
      } else {
        setMeters([]);
        setActiveMeterId(null);
      }

      // Fetch wallet balance from Supabase
      const { data: walletData } = await supabase
        .from('wallet_accounts')
        .select('balance_kobo')
        .eq('user_id', userId)
        .maybeSingle();

      if (walletData) {
        setWalletBalance(Math.floor((walletData.balance_kobo || 0) / 100));
      } else {
        setWalletBalance(0);
      }

      // Fetch unified activity ledger from Supabase
      try {
        const { items } = await LedgerService.getUnifiedActivity(userId, 'all', 30, 0);
        if (items && items.length > 0) {
          const mappedTx: Transaction[] = items.map((item) => ({
            id: item.id,
            title: item.title,
            type: item.type === 'funding' ? 'funding' : 'purchase',
            date: item.dateFormatted,
            createdAt: item.createdAt,
            amount: item.amountNaira,
            units: item.unitsKwh,
            token: item.token,
            status: item.status,
            reference: item.reference,
            meterNumber: item.meterNumber,
            description: item.description,
          }));
          setTransactions(mappedTx);
        } else {
          setTransactions([]);
        }
      } catch {
        setTransactions([]);
      }

      // Fetch notification preferences and meter-isolated notifications
      try {
        const [prefs, fetchedNotifs] = await Promise.all([
          NotificationPreferencesService.getPreferences(userId),
          NotificationsService.getNotifications(userId, activeMeterId),
        ]);
        setNotificationPreferences(prefs);
        setNotifications(fetchedNotifs);
      } catch (err) {
        console.warn('[AppContext.syncProfileData] Error loading notifications:', err);
      }
    } catch (err) {
      console.warn('[AppContext.syncProfileData] Error syncing profile:', err);
    }
  }, []);

  // ── Auth Initialization & Listener ───────────────────
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const initialSession = await AuthService.getSession();
        if (isMounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
          if (initialSession?.user) {
            await syncProfileData(initialSession.user.id);
          }
        }
      } catch (err) {
        console.warn('[AppContext] Initial session check error:', err);
      } finally {
        if (isMounted) setIsLoadingAuth(false);
      }
    }

    initAuth();

    const { data: authListener } = AuthService.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        await syncProfileData(newSession.user.id);
      } else {
        setUserProfile(null);
        setEnergyProfile(null);
        setAppliances([]);
      }
      setIsLoadingAuth(false);
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [syncProfileData]);

  // ── Auth Actions ────────────────────────────────────
  const login = async (email: string, password?: string) => {
    const res = await AuthService.signIn({
      email,
      password: password || 'P@ssword123!',
    });

    if (res.success && res.user) {
      setUser(res.user);
      setSession(res.session || null);
      if (res.profile) {
        setUserProfile(res.profile);
        setLocalName(res.profile.full_name);
        setLocalEmail(res.profile.email);
      }
      await syncProfileData(res.user.id);
      const eProfile = await EnergyService.getEnergyProfile(res.user.id);
      const userIsOnboarded = !!res.profile?.onboarding_completed || !!res.profile?.is_onboarded || !!eProfile;
      return { success: true, profile: res.profile, isOnboarded: userIsOnboarded };
    }

    return { success: false, error: res.error };
  };

  const signup = async (
    name: string,
    email: string,
    password?: string,
    phone?: string,
    accountType?: AccountTypeEnum
  ) => {
    const res = await AuthService.signUp({
      fullName: name,
      email,
      password: password || 'P@ssword123!',
      phone,
      accountType: accountType || 'household',
    });

    if (res.success && res.user) {
      setUser(res.user);
      setSession(res.session || null);
      if (res.profile) {
        setUserProfile(res.profile);
        setLocalName(res.profile.full_name);
        setLocalEmail(res.profile.email);
      }
      await syncProfileData(res.user.id);
      const eProfile = await EnergyService.getEnergyProfile(res.user.id);
      const userIsOnboarded = !!res.profile?.onboarding_completed || !!res.profile?.is_onboarded || !!eProfile;
      return { success: true, profile: res.profile, isOnboarded: userIsOnboarded };
    }

    return { success: false, error: res.error };
  };

  const resetPassword = async (email: string) => {
    return AuthService.resetPasswordForEmail(email);
  };

  const logout = async () => {
    try {
      await AuthService.signOut();
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
    setSession(null);
    setUser(null);
    setUserProfile(null);
    setEnergyProfile(null);
    setAppliances([]);
    setLocalName('');
    setLocalEmail('');
    setLocalPhone('');
    setWalletBalance(0);
    setMeters([]);
    setActiveMeterId(null);
    setTransactions([]);
    setNotifications([]);
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await syncProfileData(user.id);
    }
  };

  const refreshEnergyProfile = async () => {
    if (user?.id) {
      const eProfile = await EnergyService.getEnergyProfile(user.id);
      if (eProfile) setEnergyProfile(eProfile);
      const apps = await EnergyService.getUserAppliances(user.id);
      if (apps) setAppliances(apps);
    }
  };

  const completeOnboarding = async (
    profileData: {
      accountType: AccountTypeEnum;
      occupantsCount: number;
      buildingType?: string;
      primaryCookingSource?: string;
      hasSolar?: boolean;
      hasGenerator?: boolean;
    },
    applianceList: ApplianceItemInput[]
  ) => {
    if (!user?.id) {
      return { success: false, error: 'User is not authenticated' };
    }

    const res = await EnergyService.saveCompleteEnergyProfile(
      user.id,
      profileData,
      applianceList
    );

    if (res.success) {
      await syncProfileData(user.id);
      return { success: true };
    }

    return { success: false, error: res.error };
  };

  const updateProfile = async (
    name: string,
    email?: string,
    phone?: string,
    accType?: AccountTypeEnum
  ) => {
    if (name.trim()) setLocalName(name.trim());
    if (email?.trim()) setLocalEmail(email.trim());
    if (phone?.trim()) setLocalPhone(phone.trim());
    if (accType) setLocalAccountType(accType);

    if (user?.id) {
      const res = await AuthService.updateProfile(user.id, {
        full_name: name.trim(),
        phone: phone ? phone.trim() : undefined,
        account_type: accType,
      });

      if (res.success && res.profile) {
        setUserProfile(res.profile);
        return { success: true };
      }
      return { success: false, error: res.error };
    }

    return { success: true };
  };

  // ── Meter Actions ───────────────────────────────────
  const addMeter = (
    disco: string,
    number: string,
    name: string,
    address: string,
    customerName?: string,
    tariffCode?: string
  ) => {
    const newMeter: Meter = {
      id: Math.random().toString(36).substring(7),
      name: name || `Meter ${meters.length + 1}`,
      number,
      disco,
      address: address || 'No Address Provided',
      customerName: customerName || 'Verified Customer',
      tariffCode: tariffCode || 'Band A (Prepaid)',
      active: true,
    };
    setMeters((prev) => [...prev, newMeter]);
    setActiveMeterId(newMeter.id);

    if (user?.id) {
      const isPostpaid = disco.toLowerCase().includes('postpaid');
      (async () => {
        try {
          const { data } = await supabase
            .from('meters')
            .insert({
              user_id: user.id,
              meter_number: number.replace(/\s/g, ''),
              disco_code: disco.toLowerCase().replace(/[^a-z]/g, ''),
              disco_name: disco,
              meter_type: isPostpaid ? 'postpaid' : 'prepaid',
              nickname: name || `Meter ${meters.length + 1}`,
              customer_name: customerName || null,
              address: address || null,
              is_active: meters.length === 0,
            })
            .select()
            .single();

          if (data) {
            setMeters((prev) =>
              prev.map((m) => (m.id === newMeter.id ? { ...m, id: data.id } : m))
            );
            setActiveMeterId((cur) => (cur === newMeter.id ? data.id : cur));
          }
        } catch (err) {
          console.warn('Error persisting meter to Supabase:', err);
        }
      })();
    }

    return newMeter;
  };

  const refreshNotifications = useCallback(async (overrideMeterId?: string | null) => {
    const activeUserId = user?.id || session?.user?.id;
    if (!activeUserId) return;
    const reqSeq = ++notifReqSeqRef.current;
    const targetMeterId = overrideMeterId !== undefined ? overrideMeterId : activeMeterId;
    try {
      const items = await NotificationsService.getNotifications(activeUserId, targetMeterId);
      if (reqSeq === notifReqSeqRef.current) {
        setNotifications(items);
      }
    } catch (e) {
      console.warn('[AppContext] Error refreshing notifications:', e);
    }
  }, [user?.id, session?.user?.id, activeMeterId]);

  const refreshSuggestedQuestions = useCallback(async (overrideMeterId?: string | null) => {
    const activeUserId = user?.id || session?.user?.id;
    if (!activeUserId) return;
    const reqSeq = ++questionsReqSeqRef.current;
    const targetMeterId = overrideMeterId !== undefined ? overrideMeterId : (activeMeterId || null);
    try {
      const questions = await EnergyIntelligenceService.getSuggestedQuestions(activeUserId, targetMeterId);
      if (reqSeq === questionsReqSeqRef.current) {
        setSuggestedQuestions(questions);
      }
    } catch (e) {
      console.warn('[AppContext] Could not refresh suggested questions:', e);
    }
  }, [user?.id, session?.user?.id, activeMeterId]);

  const refreshAnalytics = useCallback(async (
    period: '7d' | '30d' | '90d' | '1y' = '30d',
    overrideMeterId?: string | null
  ) => {
    const activeUserId = user?.id || session?.user?.id;
    if (!activeUserId) return;
    const reqSeq = ++analyticsReqSeqRef.current;
    const effectiveMeterId = overrideMeterId !== undefined ? overrideMeterId : (activeMeterId || null);
    try {
      const [analytics, aiResult] = await Promise.all([
        ConsumptionAnalyticsService.getConsumptionAnalytics(
          activeUserId,
          effectiveMeterId,
          period
        ),
        AIAnalyticsEngine.analyzeMeterData(
          activeUserId,
          effectiveMeterId,
          period
        ).catch((err) => {
          console.warn('[AppContext] AI Analytics calculation encountered error:', err);
          return null;
        }),
      ]);
      if (reqSeq === analyticsReqSeqRef.current) {
        setConsumptionAnalytics(analytics);
        if (aiResult) {
          setAiAnalytics(aiResult);
        }
        setIsSwitchingMeter(false);

        // Non-blocking background Smart Alert evaluation for active meter
        if (effectiveMeterId) {
          const meterObj = meters.find((m) => m.id === effectiveMeterId);
          SmartAlertsService.evaluateMeterAlerts({
            userId: activeUserId,
            meterId: effectiveMeterId,
            meterNumber: meterObj?.number,
            meterNickname: meterObj?.name,
            consumptionAnalytics: analytics,
            actualRemainingKwh: null,
            estimatedRemainingKwh: (analytics.consumption as any)?.remainingUnitsKwh || null,
            appliancesCount: appliances.length,
          }).then((newAlerts) => {
            if (newAlerts && newAlerts.length > 0) {
              setNotifications((prev) => [...newAlerts, ...prev]);
            }
          }).catch((e) => console.warn('[AppContext] Smart alerts evaluation error:', e));
        }
      }
    } catch (err) {
      console.error('Error refreshing consumption analytics:', err);
      if (reqSeq === analyticsReqSeqRef.current) {
        setIsSwitchingMeter(false);
      }
    }
  }, [user?.id, session?.user?.id, activeMeterId, meters, appliances.length]);

  const selectMeter = useCallback((id: string) => {
    LoggerService.info('meter-manager', 'meter.switched', {
      userId: user?.id || session?.user?.id,
      meterId: id,
      metadata: { previousMeterId: activeMeterId, newMeterId: id },
    });

    // 1. Cancel in-flight meter operations immediately
    if (meterAbortControllerRef.current) {
      meterAbortControllerRef.current.abort();
    }
    meterAbortControllerRef.current = new AbortController();

    // 2. Set authoritative switching state & active meter ID
    setIsSwitchingMeter(true);
    setActiveMeterId(id);

    // 3. Invalidate old meter analytics snapshot immediately so stale meter numbers never show
    setConsumptionAnalytics(null);
    setAiAnalytics(null);

    // 4. Immediately refresh notifications, questions, and analytics strictly scoped to the newly selected meter
    refreshNotifications(id);
    refreshSuggestedQuestions(id);
    refreshAnalytics('30d', id);
  }, [activeMeterId, user?.id, session?.user?.id, refreshNotifications, refreshSuggestedQuestions, refreshAnalytics]);

  const renameMeter = (id: string, name: string) => {
    MetersService.renameMeter('current-user', id, name);
    setMeters((prev) => prev.map((m) => (m.id === id ? { ...m, name: name.trim() || m.name } : m)));
  };

  const deleteMeter = (id: string) => {
    if (user?.id) {
      (async () => {
        try {
          await supabase
            .from('meters')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);
        } catch (err) {
          console.warn('Error deleting meter from Supabase:', err);
        }
      })();
    }
    setMeters((prev) => prev.filter((m) => m.id !== id));
    if (activeMeterId === id) {
      const remaining = meters.filter((m) => m.id !== id);
      const nextActive = remaining.length > 0 ? remaining[0] : null;
      setActiveMeterId(nextActive ? nextActive.id : null);
    }
  };

  // ── Wallet & Ledger Actions ──────────────────────────
  const refreshWallet = useCallback(async () => {
    const activeUserId = user?.id || session?.user?.id;
    if (!activeUserId) return;
    try {
      const { data: walletData } = await supabase
        .from('wallet_accounts')
        .select('balance_kobo')
        .eq('user_id', activeUserId)
        .maybeSingle();

      if (walletData) {
        setWalletBalance(Math.floor((walletData.balance_kobo || 0) / 100));
      }
    } catch (e) {
      console.error('Error refreshing wallet:', e);
    }
  }, [user?.id, session?.user?.id]);

  const refreshTransactions = useCallback(async () => {
    const activeUserId = user?.id || session?.user?.id;
    if (!activeUserId) return;
    try {
      const { items } = await LedgerService.getUnifiedActivity(activeUserId, 'all', 30, 0);
      if (items && items.length > 0) {
        const mappedTx: Transaction[] = items.map((item) => ({
          id: item.id,
          title: item.title,
          type: item.type === 'funding' ? 'funding' : 'purchase',
          date: item.dateFormatted,
          createdAt: item.createdAt,
          amount: item.amountNaira,
          units: item.unitsKwh,
          token: item.token,
          status: item.status,
          reference: item.reference,
          meterNumber: item.meterNumber,
          description: item.description,
        }));
        setTransactions(mappedTx);
      }
    } catch (e) {
      console.error('Error refreshing transactions:', e);
    }
  }, [user?.id, session?.user?.id]);

  // ── Appliance Contribution Estimates ─────────────────
  const applianceEstimates = useMemo(() => {
    return ConsumptionAnalyticsService.getApplianceEstimates(appliances);
  }, [appliances]);

  // ── AI Engine Health Check ─────────────────────────
  const checkAIEngineHealth = useCallback(async () => {
    const health = await AIAnalyticsEngine.checkHealth();
    setAiEngineStatus(health.status);
    return health;
  }, []);

  // ── Record Manual Meter Reading ──────────────────────
  const recordMeterReading = useCallback(async (
    meterId: string,
    readingValue: number,
    recordedAt?: string
  ) => {
    const activeUserId = user?.id || session?.user?.id;
    if (!activeUserId) {
      return { success: false, errorMessage: 'User must be signed in.' };
    }
    const result = await MeterReadingService.recordReading(activeUserId, meterId, readingValue, recordedAt);
    if (result.success) {
      await refreshAnalytics();
    }
    return result;
  }, [user?.id, session?.user?.id, refreshAnalytics]);

  // ── Ask AI Energy Assistant ──────────────────────────
  const askEnergyAssistant = useCallback(async (
    question: string,
    options?: Partial<AIQueryOptions>
  ) => {
    if (isAiLoading) {
      return {
        success: false,
        message: {
          id: `MSG-${Date.now()}`,
          conversationId: `CONV-${Date.now()}`,
          userId: 'busy',
          meterId: activeMeterId || null,
          role: 'assistant' as const,
          content: 'Please wait for the previous question to finish generating.',
          createdAt: new Date().toISOString(),
        },
        errorMessage: 'Assistant is busy.',
      };
    }

    const activeUserId = user?.id || session?.user?.id;
    if (!activeUserId) {
      const errMessage: AIChatMessage = {
        id: `MSG-${Date.now()}`,
        conversationId: `CONV-${Date.now()}`,
        userId: 'anonymous',
        meterId: activeMeterId || null,
        role: 'assistant',
        content: 'Please sign in to access personalized energy intelligence.',
        createdAt: new Date().toISOString(),
      };
      return { success: false, message: errMessage, errorMessage: 'User must be signed in.' };
    }

    // Build short-term conversational context (last 4 message turns)
    const history = aiMessages.slice(-4).map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

    // Add user message to conversation list
    const userMsg: AIChatMessage = {
      id: `USER-MSG-${Date.now()}`,
      conversationId: options?.conversationId || `CONV-${Date.now()}`,
      userId: activeUserId,
      meterId: activeMeterId || null,
      role: 'user',
      content: question,
      createdAt: new Date().toISOString(),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    setIsAiLoading(true);

    try {
      const result = await EnergyIntelligenceService.askAssistant(activeUserId, {
        question,
        meterId: activeMeterId || null,
        period: options?.period || '30d',
        conversationId: options?.conversationId || userMsg.conversationId,
        forceDeterministic: options?.forceDeterministic,
        history: options?.history || history,
      });

      setAiMessages((prev) => [...prev, result.message]);
      return result;
    } catch (err: any) {
      const fallbackMsg: AIChatMessage = {
        id: `MSG-${Date.now()}`,
        conversationId: userMsg.conversationId,
        userId: activeUserId,
        meterId: activeMeterId || null,
        role: 'assistant',
        content: 'Unable to complete energy analysis at this moment. Please try again.',
        createdAt: new Date().toISOString(),
      };
      setAiMessages((prev) => [...prev, fallbackMsg]);
      return { success: false, message: fallbackMsg, errorMessage: err?.message };
    } finally {
      setIsAiLoading(false);
    }
  }, [user?.id, session?.user?.id, activeMeterId]);

  const recordAiFeedback = useCallback(async (
    messageId: string,
    isHelpful: boolean,
    reason?: string
  ) => {
    setAiMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, isHelpful, feedbackReason: reason } : m))
    );
    return EnergyIntelligenceService.recordFeedback({ messageId, isHelpful, reason });
  }, []);

  const clearAiChat = useCallback(() => {
    setAiMessages([]);
  }, []);

  // Trigger analytics, suggested questions & support count refresh when active meter or transactions change
  useEffect(() => {
    if ((user?.id || session?.user?.id) && !isSwitchingMeter) {
      refreshAnalytics();
      refreshSuggestedQuestions();
      refreshSupportCount();
    }
  }, [user?.id, session?.user?.id, activeMeterId, transactions.length, isSwitchingMeter, refreshAnalytics, refreshSuggestedQuestions, refreshSupportCount]);

  // ── Realtime Wallet & Ledger Listener ───────────────
  useEffect(() => {
    const activeUserId = user?.id || session?.user?.id;
    if (!activeUserId) return;

    const walletChannel = supabase
      .channel(`wallet-realtime-${activeUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallet_accounts',
          filter: `user_id=eq.${activeUserId}`,
        },
        (payload: any) => {
          if (payload.new && typeof payload.new.balance_kobo === 'number') {
            setWalletBalance(Math.floor(payload.new.balance_kobo / 100));
            refreshTransactions();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(walletChannel);
    };
  }, [user?.id, session?.user?.id, refreshTransactions]);

  // ── Realtime Support & Notification Listener ────────
  useEffect(() => {
    const activeUserId = user?.id || session?.user?.id;
    if (!activeUserId) return;

    // 1. Initial count check
    refreshSupportCount();

    // 2. Real-time channel for support notes, case updates, and notifications
    const supportChannel = supabase
      .channel(`support-realtime-${activeUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_case_notes',
          filter: 'is_internal=eq.false',
        },
        () => {
          refreshSupportCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_cases',
          filter: `customer_id=eq.${activeUserId}`,
        },
        () => {
          refreshSupportCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${activeUserId}`,
        },
        (payload: any) => {
          refreshNotifications();
          if (payload?.new?.type === 'support_reply') {
            refreshSupportCount();
          }
        }
      )
      .subscribe();

    // 3. Fallback active polling interval (every 20 seconds) while app is active
    const pollInterval = setInterval(() => {
      refreshSupportCount();
    }, 20000);

    return () => {
      supabase.removeChannel(supportChannel);
      clearInterval(pollInterval);
    };
  }, [user?.id, session?.user?.id, refreshSupportCount, refreshNotifications]);

  const fundWallet = async (
    amount: number,
    method: PaymentMethodType = 'card'
  ) => {
    const userId = user?.id;
    if (!userId) {
      return { success: false, errorMessage: 'User must be signed in to fund wallet.' };
    }

    const initResult = await WalletFundingService.initializeFunding({
      userId,
      amountNaira: amount,
      paymentMethod: method,
      customerEmail: user.email || localEmail || 'customer@smart-electricity.app',
      customerName: userProfile?.full_name || localName || 'Customer',
      customerPhone: userProfile?.phone || localPhone || '08012345678',
    });

    if (!initResult.success) {
      return { success: false, errorMessage: initResult.errorMessage };
    }

    // Verify and credit payment
    const verifyResult = await WalletFundingService.verifyAndCreditPayment(initResult.reference);

    if (verifyResult.success && verifyResult.newBalanceNaira !== undefined) {
      setWalletBalance(verifyResult.newBalanceNaira);
      await refreshTransactions();
      return {
        success: true,
        reference: initResult.reference,
        paymentAttemptId: initResult.paymentAttemptId,
        checkoutUrl: initResult.checkoutUrl,
        virtualAccount: initResult.virtualAccount,
        ussdCode: initResult.ussdCode,
        newBalanceNaira: verifyResult.newBalanceNaira,
      };
    }

    return {
      success: true,
      reference: initResult.reference,
      paymentAttemptId: initResult.paymentAttemptId,
      checkoutUrl: initResult.checkoutUrl,
      virtualAccount: initResult.virtualAccount,
      ussdCode: initResult.ussdCode,
    };
  };

  // ── Electricity Purchase Action ─────────────────────
  const buyElectricity = async (amount: number, phone?: string) => {
    if (walletBalance < amount) {
      return { success: false, errorMessage: 'Insufficient wallet balance. Please fund your wallet.' };
    }

    const currentActive = meters.find((m) => m.id === activeMeterId) || (meters.length > 0 ? meters[0] : undefined);
    const sanitizedMeterNumber = currentActive ? currentActive.number.replace(/\s/g, '') : '04198273645';
    const discoCode = currentActive?.disco ? currentActive.disco.toLowerCase().replace(/[^a-z]/g, '') : 'aedc';

    const result = await ElectricityService.purchaseElectricity({
      userId: user?.id || 'current-user',
      meterId: currentActive?.id,
      meterNumber: sanitizedMeterNumber,
      discoCode,
      amountNaira: amount,
      phone: phone || localPhone || '08012345678',
    });

    if (result.success && result.token) {
      // Synchronize authoritative wallet balance from Supabase
      if (user?.id) {
        try {
          const { data: walletData } = await supabase
            .from('wallet_accounts')
            .select('balance_kobo')
            .eq('user_id', user.id)
            .single();
          if (walletData) {
            setWalletBalance(walletData.balance_kobo / 100);
          } else {
            setWalletBalance((prev) => Math.max(0, prev - amount));
          }
        } catch {
          setWalletBalance((prev) => Math.max(0, prev - amount));
        }
      } else {
        setWalletBalance((prev) => Math.max(0, prev - amount));
      }

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const newTx: Transaction = {
        id: 'purchase_' + Date.now(),
        title: 'Token Purchase',
        type: 'purchase',
        date: 'Today, ' + now,
        createdAt: new Date().toISOString(),
        amount,
        units: result.unitsKwh,
        token: result.token,
        status: 'Completed',
        reference: result.reference,
        meterNumber: currentActive ? currentActive.number : sanitizedMeterNumber,
      };

      setTransactions((prev) => [newTx, ...prev]);

      setNotifications((prev) => [
        {
          id: 'notif_' + Date.now(),
          type: 'purchase',
          severity: 'success',
          title: 'Token Purchase Successful ⚡',
          body: `₦${amount.toLocaleString()} token purchased. ${result.unitsKwh ? result.unitsKwh + ' kWh credited. ' : ''}Token: ${result.token}.`,
          read: false,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      // Immediate cache invalidation & re-calculation
      if (user?.id) {
        AIAnalyticsEngine.invalidateUserCache(user.id);
      }
      refreshTransactions();
      refreshAnalytics();
      refreshSuggestedQuestions();

      return { success: true, token: result.token, transaction: newTx };
    }

    // If failed, record failed transaction in activity and re-sync wallet in case of refund
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const failedTx: Transaction = {
      id: 'failed_purchase_' + Date.now(),
      title: 'Token Purchase (Failed)',
      type: 'purchase',
      date: 'Today, ' + now,
      createdAt: new Date().toISOString(),
      amount,
      status: 'Failed',
      reference: result.reference || 'FAILED-' + Date.now(),
      meterNumber: currentActive ? currentActive.number : sanitizedMeterNumber,
      description: result.errorMessage || 'Purchase failed',
      errorMessage: result.errorMessage,
    };

    setTransactions((prev) => [failedTx, ...prev]);

    setNotifications((prev) => [
      {
        id: 'notif_' + Date.now(),
        type: 'alert',
        severity: 'critical',
        title: 'Token Purchase Failed ⚠️',
        body: `₦${amount.toLocaleString()} purchase could not be completed. ${result.errorMessage || 'Please try again.'}`,
        read: false,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);

    if (user?.id) {
      supabase
        .from('wallet_accounts')
        .select('balance_kobo')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setWalletBalance(data.balance_kobo / 100);
        });
      refreshTransactions();
      refreshAnalytics();
    }

    return {
      success: false,
      errorMessage: result.errorMessage || 'Failed to vend electricity token from provider',
    };
  };

  // ── Notifications Actions ───────────────────────────
  const updateNotificationPreferences = useCallback(
    async (partial: Partial<Omit<NotificationPreferences, 'userId'>>) => {
      const activeUserId = user?.id || session?.user?.id;
      if (!activeUserId) return;
      const updated = await NotificationPreferencesService.updatePreferences(activeUserId, partial);
      setNotificationPreferences(updated);
    },
    [user?.id, session?.user?.id]
  );

  const markNotificationRead = (id: string) => {
    const activeUserId = user?.id || session?.user?.id;
    NotificationsService.markRead(id, activeUserId);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllNotificationsRead = () => {
    const activeUserId = user?.id || session?.user?.id;
    const allIds = notifications.map((n) => n.id);
    if (activeUserId) {
      NotificationsService.markAllRead(activeUserId, allIds, activeMeterId);
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const addNotification = (notif: {
    type: AppNotification['type'];
    title: string;
    body: string;
  }) => {
    const activeUserId = user?.id || session?.user?.id;
    const tempId = 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newNotif: AppNotification = {
      id: tempId,
      userId: activeUserId || undefined,
      meterId: activeMeterId || null,
      type: notif.type,
      title: notif.title,
      body: notif.body,
      severity: 'info',
      read: false,
      createdAt: new Date().toISOString(),
    };

    setNotifications((prev) => [newNotif, ...prev]);

    if (activeUserId) {
      NotificationsService.createNotification(activeUserId, {
        ...notif,
        meterId: activeMeterId || null,
      }).then((created) => {
        if (created?.id) {
          setNotifications((prev) =>
            prev.map((n) => (n.id === tempId ? { ...n, id: created.id! } : n))
          );
        }
      }).catch((err) => console.warn('[AppContext] Error persisting notification:', err));
    }
  };

  const isLoggedIn = !!session?.user || !!user;
  const isOnboarded = !!userProfile?.onboarding_completed || !!userProfile?.is_onboarded || !!energyProfile;
  const displayName = userProfile?.full_name || localName;
  const displayEmail = userProfile?.email || user?.email || localEmail;
  const displayPhone = userProfile?.phone || userProfile?.phone_number || localPhone;
  const displayAccountType = userProfile?.account_type || localAccountType;

  return (
    <AppContext.Provider
      value={{
        session,
        user,
        userProfile,
        energyProfile,
        appliances,
        isLoadingAuth,
        isLoggedIn,
        isOnboarded,
        userName: displayName,
        userEmail: displayEmail,
        userPhone: displayPhone,
        accountType: displayAccountType,
        walletBalance,
        meters,
        activeMeterId,
        activeMeter,
        isSwitchingMeter,
        transactions,
        notifications,
        unreadCount,
        login,
        signup,
        resetPassword,
        logout,
        completeOnboarding,
        updateProfile,
        refreshProfile,
        refreshEnergyProfile,
        addMeter,
        selectMeter,
        deleteMeter,
        renameMeter,
        fundWallet,
        refreshWallet,
        refreshTransactions,
        consumptionAnalytics,
        aiAnalytics,
        aiEngineStatus,
        checkAIEngineHealth,
        applianceEstimates,
        refreshAnalytics,
        recordMeterReading,
        askEnergyAssistant,
        suggestedQuestions,
        aiMessages,
        isAiLoading,
        recordAiFeedback,
        clearAiChat,
        buyElectricity,
        markNotificationRead,
        markAllNotificationsRead,
        addNotification,
        notificationPreferences,
        updateNotificationPreferences,
        refreshNotifications,
        unreadSupportCount,
        refreshSupportCount,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
