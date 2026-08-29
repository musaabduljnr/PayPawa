import { supabase } from './supabase';
import type { 
  UserProfile, 
  UserProfileUpdate, 
  SignUpParams, 
  SignInParams 
} from '@/types/auth';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

export class AuthService {
  /**
   * Translates technical Supabase Auth errors into clear, friendly user messages.
   */
  static mapAuthError(err: any): string {
    if (!err) return 'An unexpected error occurred. Please try again.';
    const msg = (err.message || '').toLowerCase();
    const code = (err.code || '').toLowerCase();

    if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) {
      return 'Incorrect email or password. Please check your details and try again.';
    }
    if (msg.includes('user already registered') || msg.includes('already exists') || code === 'user_already_exists') {
      return 'An account with this email address already exists. Please sign in instead.';
    }
    if (msg.includes('password should be at least') || msg.includes('weak_password')) {
      return 'Your password must be at least 6 characters long.';
    }
    if (msg.includes('valid email') || msg.includes('invalid_email')) {
      return 'Please enter a valid email address.';
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
      return 'Unable to connect to server. Please check your internet connection and try again.';
    }
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
      return 'Too many attempts. Please wait a moment and try again.';
    }

    return err.message || 'Authentication failed. Please try again.';
  }

  /**
   * Registers a new user with Supabase Auth.
   * Supabase automatically creates the profile row and initial wallet via DB trigger.
   */
  static async signUp(params: SignUpParams): Promise<{
    success: boolean;
    user?: User | null;
    session?: Session | null;
    profile?: UserProfile | null;
    error?: string;
  }> {
    try {
      const email = params.email.trim().toLowerCase();
      const fullName = params.fullName.trim();
      const password = params.password;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: params.phone || null,
            account_type: params.accountType || 'household',
          },
        },
      });

      if (error) throw error;
      if (!data.user) {
        throw new Error('User creation failed. No user returned.');
      }

      // Fetch or fallback-create the user profile
      let profile = await this.getProfile(data.user.id);
      if (!profile) {
        // Fallback upsert in case trigger had a delayed execution
        const { data: profileData, error: profileErr } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            full_name: fullName,
            email,
            phone: params.phone || null,
            account_type: params.accountType || 'household',
            onboarding_completed: false,
            is_onboarded: false,
          })
          .select()
          .single();

        if (!profileErr && profileData) {
          profile = profileData as UserProfile;
        }
      }

      return {
        success: true,
        user: data.user,
        session: data.session,
        profile,
      };
    } catch (err: any) {
      console.warn('[AuthService.signUp] Error:', err);
      return {
        success: false,
        error: this.mapAuthError(err),
      };
    }
  }

  /**
   * Authenticates an existing user via Supabase Auth.
   */
  static async signIn(params: SignInParams): Promise<{
    success: boolean;
    user?: User | null;
    session?: Session | null;
    profile?: UserProfile | null;
    error?: string;
  }> {
    try {
      const email = params.email.trim().toLowerCase();
      const password = params.password;

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data.user) {
        throw new Error('Sign in failed. No user returned.');
      }

      const profile = await this.getProfile(data.user.id);

      return {
        success: true,
        user: data.user,
        session: data.session,
        profile,
      };
    } catch (err: any) {
      console.warn('[AuthService.signIn] Error:', err);
      return {
        success: false,
        error: this.mapAuthError(err),
      };
    }
  }

  /**
   * Signs out the currently authenticated user.
   */
  static async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.warn('[AuthService.signOut] Error:', err);
      return { success: false, error: this.mapAuthError(err) };
    }
  }

  /**
   * Retrieves the current Supabase session.
   */
  static async getSession(): Promise<Session | null> {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) return null;
      return data.session;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves the current Supabase user.
   */
  static async getUser(): Promise<User | null> {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return data.user;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves the user profile row from Supabase.
   */
  static async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) return null;
      return data as UserProfile;
    } catch {
      return null;
    }
  }

  /**
   * Updates user profile fields in Supabase.
   */
  static async updateProfile(
    userId: string,
    updates: UserProfileUpdate
  ): Promise<{ success: boolean; profile?: UserProfile; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, profile: data as UserProfile };
    } catch (err: any) {
      console.warn('[AuthService.updateProfile] Error:', err);
      return { success: false, error: this.mapAuthError(err) };
    }
  }

  /**
   * Subscribes to Supabase Auth state changes.
   */
  static onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void
  ) {
    return supabase.auth.onAuthStateChange(callback);
  }
}
