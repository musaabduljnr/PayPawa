/**
 * Supabase Database TypeScript Definitions
 * Schema Version: 2.0.0
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type MeterTypeEnum = 'prepaid' | 'postpaid';

export type VerificationStatusEnum = 'pending' | 'verified' | 'failed' | 'expired';

export type ElectricityTxStatusEnum =
  | 'created'
  | 'processing'
  | 'successful'
  | 'failed'
  | 'pending'
  | 'timeout'
  | 'reversed'
  | 'unknown';

export type WalletTxTypeEnum =
  | 'funding'
  | 'purchase_debit'
  | 'refund_credit'
  | 'reversal_debit'
  | 'adjustment';

export type PaymentMethodEnum = 'card' | 'bank_transfer' | 'ussd' | 'wallet';

export type PaymentStatusEnum =
  | 'initiated'
  | 'pending'
  | 'successful'
  | 'failed'
  | 'abandoned';

export type NotificationTypeEnum =
  | 'purchase'
  | 'funding'
  | 'alert'
  | 'info'
  | 'billing';

export type AccountTypeEnum = 'household' | 'business';
export type ApplianceTypeEnum =
  | 'light_bulb'
  | 'television'
  | 'refrigerator'
  | 'freezer'
  | 'fan'
  | 'air_conditioner'
  | 'electric_cooker'
  | 'microwave'
  | 'water_heater'
  | 'pumping_machine'
  | 'pressing_iron'
  | 'washing_machine'
  | 'other';

export type UsageFrequencyEnum = 'rarely' | 'occasionally' | 'daily' | 'multiple_daily';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          phone_number: string | null;
          avatar_url: string | null;
          account_type: AccountTypeEnum;
          is_onboarded: boolean;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email: string;
          phone?: string | null;
          phone_number?: string | null;
          avatar_url?: string | null;
          account_type?: AccountTypeEnum;
          is_onboarded?: boolean;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          phone?: string | null;
          phone_number?: string | null;
          avatar_url?: string | null;
          account_type?: AccountTypeEnum;
          is_onboarded?: boolean;
          onboarding_completed?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      energy_profiles: {
        Row: {
          id: string;
          user_id: string;
          account_type: AccountTypeEnum;
          occupants_count: number;
          building_type: string | null;
          primary_cooking_source: string | null;
          has_solar: boolean;
          has_generator: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_type?: AccountTypeEnum;
          occupants_count?: number;
          building_type?: string | null;
          primary_cooking_source?: string | null;
          has_solar?: boolean;
          has_generator?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          account_type?: AccountTypeEnum;
          occupants_count?: number;
          building_type?: string | null;
          primary_cooking_source?: string | null;
          has_solar?: boolean;
          has_generator?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_appliances: {
        Row: {
          id: string;
          user_id: string;
          appliance_type: ApplianceTypeEnum | string;
          quantity: number;
          usage_frequency: UsageFrequencyEnum | string;
          weekly_hours: number;
          estimated_daily_kwh: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          appliance_type: ApplianceTypeEnum | string;
          quantity?: number;
          usage_frequency?: UsageFrequencyEnum | string;
          weekly_hours?: number;
          estimated_daily_kwh?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          appliance_type?: ApplianceTypeEnum | string;
          quantity?: number;
          usage_frequency?: UsageFrequencyEnum | string;
          weekly_hours?: number;
          estimated_daily_kwh?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      wallet_accounts: {
        Row: {
          id: string;
          user_id: string;
          balance_kobo: number;
          currency: string;
          is_locked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          balance_kobo?: number;
          currency?: string;
          is_locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          balance_kobo?: number;
          currency?: string;
          is_locked?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      meters: {
        Row: {
          id: string;
          user_id: string;
          meter_number: string;
          disco_code: string;
          disco_name: string;
          meter_type: MeterTypeEnum;
          nickname: string;
          customer_name: string | null;
          address: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          meter_number: string;
          disco_code: string;
          disco_name: string;
          meter_type?: MeterTypeEnum;
          nickname: string;
          customer_name?: string | null;
          address?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          meter_number?: string;
          disco_code?: string;
          disco_name?: string;
          meter_type?: MeterTypeEnum;
          nickname?: string;
          customer_name?: string | null;
          address?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      meter_verifications: {
        Row: {
          id: string;
          user_id: string;
          meter_number: string;
          disco_code: string;
          customer_name: string | null;
          customer_address: string | null;
          tariff_code: string | null;
          status: VerificationStatusEnum;
          raw_provider_response: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          meter_number: string;
          disco_code: string;
          customer_name?: string | null;
          customer_address?: string | null;
          tariff_code?: string | null;
          status?: VerificationStatusEnum;
          raw_provider_response?: Json | null;
          created_at?: string;
        };
        Update: {
          status?: VerificationStatusEnum;
          raw_provider_response?: Json | null;
        };
        Relationships: [];
      };
      payment_attempts: {
        Row: {
          id: string;
          user_id: string;
          wallet_id: string;
          reference: string;
          amount_kobo: number;
          method: PaymentMethodEnum;
          status: PaymentStatusEnum;
          provider: string;
          provider_reference: string | null;
          idempotency_key: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          wallet_id: string;
          reference: string;
          amount_kobo: number;
          method: PaymentMethodEnum;
          status?: PaymentStatusEnum;
          provider: string;
          provider_reference?: string | null;
          idempotency_key?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: PaymentStatusEnum;
          provider_reference?: string | null;
          metadata?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      wallet_transactions: {
        Row: {
          id: string;
          user_id: string;
          wallet_id: string;
          type: WalletTxTypeEnum;
          amount_kobo: number;
          balance_before_kobo: number;
          balance_after_kobo: number;
          reference: string;
          description: string;
          idempotency_key: string | null;
          related_electricity_tx_id: string | null;
          related_payment_attempt_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          wallet_id: string;
          type: WalletTxTypeEnum;
          amount_kobo: number;
          balance_before_kobo: number;
          balance_after_kobo: number;
          reference: string;
          description: string;
          idempotency_key?: string | null;
          related_electricity_tx_id?: string | null;
          related_payment_attempt_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          description?: string;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      electricity_transactions: {
        Row: {
          id: string;
          user_id: string;
          wallet_id: string;
          meter_id: string | null;
          meter_number: string;
          meter_type: 'prepaid' | 'postpaid' | null;
          disco_code: string;
          disco_name: string | null;
          amount_kobo: number;
          service_fee_kobo: number;
          customer_charge_kobo: number;
          units_kwh: number | null;
          tariff_per_kwh_kobo: number | null;
          token: string | null;
          token_serial_number: string | null;
          status: ElectricityTxStatusEnum;
          reference: string;
          provider_name: string;
          provider_transaction_id: string | null;
          idempotency_key: string;
          failure_code: string | null;
          failure_message: string | null;
          error_message: string | null;
          retry_count: number;
          last_polled_at: string | null;
          completed_at: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          wallet_id: string;
          meter_id?: string | null;
          meter_number: string;
          meter_type?: 'prepaid' | 'postpaid' | null;
          disco_code: string;
          disco_name?: string | null;
          amount_kobo: number;
          service_fee_kobo?: number;
          customer_charge_kobo?: number;
          units_kwh?: number | null;
          tariff_per_kwh_kobo?: number | null;
          token?: string | null;
          token_serial_number?: string | null;
          status?: ElectricityTxStatusEnum;
          reference: string;
          provider_name: string;
          provider_transaction_id?: string | null;
          idempotency_key: string;
          failure_code?: string | null;
          failure_message?: string | null;
          error_message?: string | null;
          retry_count?: number;
          last_polled_at?: string | null;
          completed_at?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          units_kwh?: number | null;
          tariff_per_kwh_kobo?: number | null;
          token?: string | null;
          token_serial_number?: string | null;
          status?: ElectricityTxStatusEnum;
          provider_transaction_id?: string | null;
          failure_code?: string | null;
          failure_message?: string | null;
          error_message?: string | null;
          retry_count?: number;
          last_polled_at?: string | null;
          completed_at?: string | null;
          metadata?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      consumption_records: {
        Row: {
          id: string;
          user_id: string;
          meter_id: string;
          date: string;
          units_consumed_kwh: number;
          estimated_cost_kobo: number;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          meter_id: string;
          date: string;
          units_consumed_kwh: number;
          estimated_cost_kobo?: number;
          recorded_at?: string;
        };
        Update: {
          units_consumed_kwh?: number;
          estimated_cost_kobo?: number;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationTypeEnum;
          title: string;
          body: string;
          is_read: boolean;
          data: Json | null;
          meter_id: string | null;
          severity: string | null;
          read_at: string | null;
          expires_at: string | null;
          delivery_status: string | null;
          delivery_channel: string | null;
          deduplication_key: string | null;
          related_transaction_id: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: NotificationTypeEnum;
          title: string;
          body: string;
          is_read?: boolean;
          data?: Json | null;
          meter_id?: string | null;
          severity?: string | null;
          read_at?: string | null;
          expires_at?: string | null;
          delivery_status?: string | null;
          delivery_channel?: string | null;
          deduplication_key?: string | null;
          related_transaction_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          is_read?: boolean;
          data?: Json | null;
          meter_id?: string | null;
          severity?: string | null;
          read_at?: string | null;
          expires_at?: string | null;
          delivery_status?: string | null;
          delivery_channel?: string | null;
          deduplication_key?: string | null;
          related_transaction_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          low_balance_enabled: boolean;
          unusual_usage_enabled: boolean;
          recharge_reminder_enabled: boolean;
          purchase_updates_enabled: boolean;
          wallet_funding_enabled: boolean;
          ai_insights_enabled: boolean;
          channel_in_app: boolean;
          channel_push: boolean;
          channel_email: boolean;
          channel_sms: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          low_balance_enabled?: boolean;
          unusual_usage_enabled?: boolean;
          recharge_reminder_enabled?: boolean;
          purchase_updates_enabled?: boolean;
          wallet_funding_enabled?: boolean;
          ai_insights_enabled?: boolean;
          channel_in_app?: boolean;
          channel_push?: boolean;
          channel_email?: boolean;
          channel_sms?: boolean;
          updated_at?: string;
        };
        Update: {
          low_balance_enabled?: boolean;
          unusual_usage_enabled?: boolean;
          recharge_reminder_enabled?: boolean;
          purchase_updates_enabled?: boolean;
          wallet_funding_enabled?: boolean;
          ai_insights_enabled?: boolean;
          channel_in_app?: boolean;
          channel_push?: boolean;
          channel_email?: boolean;
          channel_sms?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      system_alert_events: {
        Row: {
          id: string;
          severity: 'low' | 'medium' | 'high' | 'critical';
          category: string;
          event_type: string;
          message: string;
          correlation_id: string | null;
          user_id: string | null;
          meter_id: string | null;
          transaction_id: string | null;
          payment_attempt_id: string | null;
          metadata: Json | null;
          is_resolved: boolean;
          resolved_at: string | null;
          resolved_by_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          severity: 'low' | 'medium' | 'high' | 'critical';
          category: string;
          event_type: string;
          message: string;
          correlation_id?: string | null;
          user_id?: string | null;
          meter_id?: string | null;
          transaction_id?: string | null;
          payment_attempt_id?: string | null;
          metadata?: Json | null;
          is_resolved?: boolean;
          resolved_at?: string | null;
          resolved_by_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          is_resolved?: boolean;
          resolved_at?: string | null;
          resolved_by_user_id?: string | null;
        };
        Relationships: [];
      };
      provider_health_telemetry: {
        Row: {
          id: string;
          provider_name: string;
          service_type: string;
          status: string;
          latency_ms: number;
          error_code: string | null;
          error_message: string | null;
          endpoint: string | null;
          correlation_id: string | null;
          transaction_id: string | null;
          payment_attempt_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider_name: string;
          service_type?: string;
          status: string;
          latency_ms?: number;
          error_code?: string | null;
          error_message?: string | null;
          endpoint?: string | null;
          correlation_id?: string | null;
          transaction_id?: string | null;
          payment_attempt_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          status?: string;
          latency_ms?: number;
          error_code?: string | null;
          error_message?: string | null;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          id: string;
          identifier: string;
          action: string;
          window_start: string;
          count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          identifier: string;
          action: string;
          window_start: string;
          count?: number;
          created_at?: string;
        };
        Update: {
          count?: number;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_name: string;
          entity_id: string | null;
          old_values: Json | null;
          new_values: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_name: string;
          entity_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      consumption_events: {
        Row: {
          id: string;
          user_id: string;
          meter_id: string | null;
          transaction_id: string | null;
          event_type: 'PURCHASE' | 'METER_READING' | 'ESTIMATED_USAGE' | 'ADJUSTMENT';
          units: number | null;
          units_source: 'PROVIDER' | 'USER_REPORTED' | 'METER' | 'IOT' | 'ESTIMATED' | 'INFERRED' | 'UNAVAILABLE';
          amount_kobo: number;
          currency: string;
          confidence: number;
          occurred_at: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          meter_id?: string | null;
          transaction_id?: string | null;
          event_type: 'PURCHASE' | 'METER_READING' | 'ESTIMATED_USAGE' | 'ADJUSTMENT';
          units?: number | null;
          units_source?: 'PROVIDER' | 'USER_REPORTED' | 'METER' | 'IOT' | 'ESTIMATED' | 'INFERRED' | 'UNAVAILABLE';
          amount_kobo?: number;
          currency?: string;
          confidence?: number;
          occurred_at: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          units?: number | null;
          units_source?: 'PROVIDER' | 'USER_REPORTED' | 'METER' | 'IOT' | 'ESTIMATED' | 'INFERRED' | 'UNAVAILABLE';
          confidence?: number;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      meter_readings: {
        Row: {
          id: string;
          user_id: string;
          meter_id: string;
          reading_value: number;
          unit: string;
          reading_type: 'cumulative' | 'interval' | 'delta';
          source: 'PROVIDER' | 'USER_REPORTED' | 'METER' | 'IOT' | 'ESTIMATED' | 'INFERRED' | 'UNAVAILABLE';
          is_anomalous: boolean;
          anomaly_reason: string | null;
          recorded_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          meter_id: string;
          reading_value: number;
          unit?: string;
          reading_type?: 'cumulative' | 'interval' | 'delta';
          source?: 'PROVIDER' | 'USER_REPORTED' | 'METER' | 'IOT' | 'ESTIMATED' | 'INFERRED' | 'UNAVAILABLE';
          is_anomalous?: boolean;
          anomaly_reason?: string | null;
          recorded_at: string;
          created_at?: string;
        };
        Update: {
          reading_value?: number;
          is_anomalous?: boolean;
          anomaly_reason?: string | null;
        };
        Relationships: [];
      };
      consumption_analytics_snapshots: {
        Row: {
          id: string;
          user_id: string;
          meter_id: string | null;
          period: '7d' | '30d' | '90d' | '1y' | 'all';
          metrics: Json;
          calculated_at: string;
          data_through: string;
          version: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          meter_id?: string | null;
          period: '7d' | '30d' | '90d' | '1y' | 'all';
          metrics: Json;
          calculated_at?: string;
          data_through: string;
          version?: string;
        };
        Update: {
          metrics?: Json;
          calculated_at?: string;
          data_through?: string;
        };
        Relationships: [];
      };
      ai_conversations: {
        Row: {
          id: string;
          user_id: string;
          meter_id: string | null;
          title: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          meter_id?: string | null;
          title?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_messages: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          meter_id: string | null;
          role: 'user' | 'assistant' | 'system';
          content: string;
          structured_response: Json | null;
          insight_type: string | null;
          confidence: string | null;
          evidence: Json | null;
          recommendations: Json | null;
          limitations: Json | null;
          is_helpful: boolean | null;
          feedback_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          meter_id?: string | null;
          role: 'user' | 'assistant' | 'system';
          content: string;
          structured_response?: Json | null;
          insight_type?: string | null;
          confidence?: string | null;
          evidence?: Json | null;
          recommendations?: Json | null;
          limitations?: Json | null;
          is_helpful?: boolean | null;
          feedback_reason?: string | null;
          created_at?: string;
        };
        Update: {
          is_helpful?: boolean | null;
          feedback_reason?: string | null;
        };
        Relationships: [];
      };
      ai_audit_logs: {
        Row: {
          id: string;
          user_id: string;
          meter_id: string | null;
          request_type: string;
          provider: string;
          model: string;
          latency_ms: number;
          tokens_in: number;
          tokens_out: number;
          estimated_cost_usd: number;
          success: boolean;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          meter_id?: string | null;
          request_type: string;
          provider: string;
          model: string;
          latency_ms?: number;
          tokens_in?: number;
          tokens_out?: number;
          estimated_cost_usd?: number;
          success?: boolean;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          success?: boolean;
        };
        Relationships: [];
      };
      ai_rate_limits: {
        Row: {
          user_id: string;
          minute_window_start: string;
          minute_request_count: number;
          daily_window_start: string;
          daily_request_count: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          minute_window_start?: string;
          minute_request_count?: number;
          daily_window_start?: string;
          daily_request_count?: number;
          updated_at?: string;
        };
        Update: {
          minute_window_start?: string;
          minute_request_count?: number;
          daily_window_start?: string;
          daily_request_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_forecast_accuracy_logs: {
        Row: {
          id: string;
          user_id: string;
          meter_id: string;
          predicted_window_min_days: number;
          predicted_window_max_days: number;
          prediction_timestamp: string;
          actual_purchase_timestamp: string | null;
          actual_purchase_id: string | null;
          actual_interval_days: number | null;
          error_days: number | null;
          confidence: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          meter_id: string;
          predicted_window_min_days: number;
          predicted_window_max_days: number;
          prediction_timestamp?: string;
          actual_purchase_timestamp?: string | null;
          actual_purchase_id?: string | null;
          actual_interval_days?: number | null;
          error_days?: number | null;
          confidence?: string | null;
          created_at?: string;
        };
        Update: {
          actual_purchase_timestamp?: string | null;
          actual_purchase_id?: string | null;
          actual_interval_days?: number | null;
          error_days?: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      credit_wallet_from_payment: {
        Args: {
          p_user_id: string;
          p_payment_attempt_id: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      debit_wallet_for_electricity: {
        Args: {
          p_user_id: string;
          p_amount_kobo: number;
          p_electricity_tx_id: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      refund_electricity_purchase: {
        Args: {
          p_user_id: string;
          p_electricity_tx_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      execute_electricity_purchase_init: {
        Args: {
          p_user_id: string;
          p_meter_id: string | null;
          p_meter_number: string;
          p_meter_type: string;
          p_disco_code: string;
          p_disco_name: string;
          p_amount_kobo: number;
          p_service_fee_kobo: number;
          p_reference: string;
          p_idempotency_key: string;
          p_provider_name: string;
        };
        Returns: {
          success: boolean;
          is_duplicate?: boolean;
          status?: ElectricityTxStatusEnum;
          transaction_id?: string;
          wallet_id?: string;
          wallet_tx_id?: string;
          reference?: string;
          token?: string | null;
          units_kwh?: number | null;
          amount_kobo?: number;
          total_charge_kobo?: number;
          new_balance_kobo?: number;
          error_code?: string;
          error_message?: string;
        };
      };
      finalize_electricity_purchase_success: {
        Args: {
          p_transaction_id: string;
          p_provider_tx_id: string | null;
          p_token: string;
          p_units_kwh: number | null;
          p_tariff_per_kwh_kobo: number | null;
          p_metadata?: Json | null;
        };
        Returns: Json;
      };
      finalize_electricity_purchase_failure: {
        Args: {
          p_transaction_id: string;
          p_failure_code: string;
          p_failure_message: string;
        };
        Returns: Json;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Enums: {
      meter_type_enum: MeterTypeEnum;
      verification_status_enum: VerificationStatusEnum;
      electricity_tx_status_enum: ElectricityTxStatusEnum;
      wallet_tx_type_enum: WalletTxTypeEnum;
      payment_method_enum: PaymentMethodEnum;
      payment_status_enum: PaymentStatusEnum;
      notification_type_enum: NotificationTypeEnum;
      account_type_enum: AccountTypeEnum;
      appliance_type_enum: ApplianceTypeEnum;
      usage_frequency_enum: UsageFrequencyEnum;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

