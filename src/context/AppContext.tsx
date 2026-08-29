import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
} from '@/services';
import type { 
  UserProfile, 
  EnergyProfile, 
  UserAppliance, 
  ApplianceItemInput,
  AccountTypeEnum 
} from '@/types/auth';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';

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
  amount: number;
  units?: number;
  token?: string;
  status: 'Completed' | 'Pending' | 'Failed';
  reference: string;
  meterNumber?: string;
}

export interface AppNotification {
  id: string;
  type: 'purchase' | 'funding' | 'alert' | 'info';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
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
  transactions: Transaction[];
  notifications: AppNotification[];
  unreadCount: number;

  // Actions
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string; profile?: UserProfile | null }>;
  signup: (
    name: string,
    email: string,
    password?: string,
    phone?: string,
    accountType?: AccountTypeEnum
  ) => Promise<{ success: boolean; error?: string; profile?: UserProfile | null }>;
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
  buyElectricity: (
    amount: number,
    phone?: string
  ) => Promise<{ success: boolean; token?: string; transaction?: Transaction; errorMessage?: string }>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [energyProfile, setEnergyProfile] = useState<EnergyProfile | null>(null);
  const [appliances, setAppliances] = useState<UserAppliance[]>([]);
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

  const unreadCount = notifications.filter((n) => !n.read).length;

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
            amount: item.amountNaira,
            units: item.unitsKwh,
            token: item.token,
            status: item.status,
            reference: item.reference,
            meterNumber: item.meterNumber,
          }));
          setTransactions(mappedTx);
        } else {
          setTransactions([]);
        }
      } catch {
        setTransactions([]);
      }

      // Fetch notifications from Supabase
      const { data: notifData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (notifData && notifData.length > 0) {
        setNotifications(
          notifData.map((n) => ({
            id: n.id,
            type: n.type as any,
            title: n.title,
            body: n.body,
            read: n.is_read,
            createdAt: n.created_at,
          }))
        );
      } else {
        setNotifications([]);
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
      return { success: true, profile: res.profile };
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
      return { success: true, profile: res.profile };
    }

    return { success: false, error: res.error };
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

  const selectMeter = (id: string) => {
    setActiveMeterId(id);
  };

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
          amount: item.amountNaira,
          units: item.unitsKwh,
          token: item.token,
          status: item.status,
          reference: item.reference,
          meterNumber: item.meterNumber,
        }));
        setTransactions(mappedTx);
      }
    } catch (e) {
      console.error('Error refreshing transactions:', e);
    }
  }, [user?.id, session?.user?.id]);

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
          title: 'Token Purchase Successful ⚡',
          body: `₦${amount.toLocaleString()} token purchased. ${result.unitsKwh || ''} kWh credited. Token: ${result.token}.`,
          read: false,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      return { success: true, token: result.token, transaction: newTx };
    }

    // If failed, re-sync wallet in case of refund
    if (user?.id) {
      supabase
        .from('wallet_accounts')
        .select('balance_kobo')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setWalletBalance(data.balance_kobo / 100);
        });
    }

    return {
      success: false,
      errorMessage: result.errorMessage || 'Failed to vend electricity token from provider',
    };
  };

  // ── Notifications Actions ───────────────────────────
  const markNotificationRead = (id: string) => {
    NotificationsService.markRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllNotificationsRead = () => {
    NotificationsService.markAllRead('current-user');
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const isLoggedIn = !!session?.user || !!user;
  const isOnboarded = !!userProfile?.onboarding_completed || !!userProfile?.is_onboarded;
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
        transactions,
        notifications,
        unreadCount,
        login,
        signup,
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
        buyElectricity,
        markNotificationRead,
        markAllNotificationsRead,
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
