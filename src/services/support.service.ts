import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type SupportCategory =
  | 'FAILED_PURCHASE'
  | 'WALLET_FUNDING'
  | 'MISSING_TOKEN'
  | 'METER_VALIDATION'
  | 'INCORRECT_DEBIT'
  | 'DUPLICATE_DEBIT'
  | 'APP_LOGIN_SECURITY'
  | 'RECEIPT_REQUEST'
  | 'DISCO_DOWNTIME'
  | 'REFUND_REQUEST'
  | 'ACCOUNT_SETTINGS'
  | 'TARIFF_QUERY'
  | 'METER_REPLACEMENT'
  | 'GENERAL_INQUIRY'
  | 'ELECTRICITY_PURCHASE'
  | 'FAILED_TRANSACTION'
  | 'PENDING_TRANSACTION'
  | 'REFUND_REVERSAL'
  | 'INCORRECT_BALANCE'
  | 'METER_REGISTRATION'
  | 'METER_VERIFICATION'
  | 'CONSUMPTION_ANALYTICS'
  | 'NOTIFICATIONS'
  | 'ACCOUNT_SECURITY'
  | 'APP_BUG'
  | 'GENERAL_ENQUIRY';

export type SupportPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type SupportStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'WAITING_FOR_CUSTOMER'
  | 'RESOLVED'
  | 'CLOSED';

export interface SupportTicket {
  id: string;
  caseNumber: string;
  customerId: string;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportStatus;
  subject: string;
  description: string;
  assignedStaffId?: string | null;
  relatedMeterId?: string | null;
  relatedWalletTxId?: string | null;
  relatedElectricityTxId?: string | null;
  internalReference?: string | null;
  providerReference?: string | null;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  reopenedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount?: number;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorUserId: string;
  isStaff: boolean;
  message: string;
  createdAt: string;
  readAt?: string | null;
}

export interface SupportFaq {
  id: string;
  category: string;
  question: string;
  answer: string;
  displayOrder: number;
}

export interface CreateTicketInput {
  category: SupportCategory;
  subject: string;
  description: string;
  priority?: SupportPriority;
  relatedMeterId?: string | null;
  relatedWalletTxId?: string | null;
  relatedElectricityTxId?: string | null;
  internalReference?: string | null;
  providerReference?: string | null;
}

export class SupportService {
  /**
   * Retrieves all support tickets for a given customer with status filtering.
   */
  static async getTickets(
    customerId: string,
    filter: 'ALL' | 'ACTIVE' | 'RESOLVED' = 'ALL'
  ): Promise<{ success: boolean; data: SupportTicket[]; error?: string }> {
    try {
      if (!customerId) {
        return { success: false, data: [], error: 'Customer ID required' };
      }

      let query = (supabase as any)
        .from('support_cases')
        .select('*')
        .eq('customer_id', customerId)
        .order('updated_at', { ascending: false });

      if (filter === 'ACTIVE') {
        query = query.in('status', ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'WAITING_FOR_CUSTOMER']);
      } else if (filter === 'RESOLVED') {
        query = query.in('status', ['RESOLVED', 'CLOSED']);
      }

      const { data, error } = await query;
      if (error) throw error;

      const tickets: SupportTicket[] = (data || []).map((row: any) => ({
        id: row.id,
        caseNumber: row.case_number,
        customerId: row.customer_id,
        category: row.category as SupportCategory,
        priority: row.priority as SupportPriority,
        status: row.status as SupportStatus,
        subject: row.subject,
        description: row.description,
        assignedStaffId: row.assigned_staff_id,
        relatedMeterId: row.related_meter_id,
        relatedWalletTxId: row.related_wallet_tx_id,
        relatedElectricityTxId: row.related_electricity_tx_id,
        internalReference: row.internal_reference,
        providerReference: row.provider_reference,
        resolutionNotes: row.resolution_notes,
        resolvedAt: row.resolved_at,
        closedAt: row.closed_at,
        reopenedAt: row.reopened_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return { success: true, data: tickets };
    } catch (err: any) {
      console.warn('[SupportService.getTickets] Error:', err);
      return { success: false, data: [], error: err.message };
    }
  }

  /**
   * Retrieves full details and message history for a single ticket.
   */
  static async getTicketDetails(ticketId: string): Promise<{
    success: boolean;
    ticket?: SupportTicket;
    messages: SupportMessage[];
    error?: string;
  }> {
    try {
      if (!ticketId) {
        return { success: false, messages: [], error: 'Ticket ID required' };
      }

      // 1. Fetch ticket metadata
      const { data: ticketRow, error: ticketError } = await (supabase as any)
        .from('support_cases')
        .select('*')
        .eq('id', ticketId)
        .single();

      if (ticketError || !ticketRow) {
        throw ticketError || new Error('Ticket not found');
      }

      // 2. Fetch customer-visible messages (is_internal = false)
      const { data: notesData, error: notesError } = await (supabase as any)
        .from('support_case_notes')
        .select('*')
        .eq('case_id', ticketId)
        .eq('is_internal', false)
        .order('created_at', { ascending: true });

      if (notesError) throw notesError;

      const ticket: SupportTicket = {
        id: ticketRow.id,
        caseNumber: ticketRow.case_number,
        customerId: ticketRow.customer_id,
        category: ticketRow.category as SupportCategory,
        priority: ticketRow.priority as SupportPriority,
        status: ticketRow.status as SupportStatus,
        subject: ticketRow.subject,
        description: ticketRow.description,
        assignedStaffId: ticketRow.assigned_staff_id,
        relatedMeterId: ticketRow.related_meter_id,
        relatedWalletTxId: ticketRow.related_wallet_tx_id,
        relatedElectricityTxId: ticketRow.related_electricity_tx_id,
        internalReference: ticketRow.internal_reference,
        providerReference: ticketRow.provider_reference,
        resolutionNotes: ticketRow.resolution_notes,
        resolvedAt: ticketRow.resolved_at,
        closedAt: ticketRow.closed_at,
        reopenedAt: ticketRow.reopened_at,
        createdAt: ticketRow.created_at,
        updatedAt: ticketRow.updated_at,
      };

      const messages: SupportMessage[] = (notesData || []).map((n: any) => ({
        id: n.id,
        ticketId: n.case_id,
        authorUserId: n.author_user_id,
        isStaff: n.author_user_id !== ticketRow.customer_id,
        message: n.note,
        createdAt: n.created_at,
        readAt: n.read_by_customer_at,
      }));

      return { success: true, ticket, messages };
    } catch (err: any) {
      console.warn('[SupportService.getTicketDetails] Error:', err);
      return { success: false, messages: [], error: err.message };
    }
  }

  /**
   * Submits a new customer support ticket via RPC.
   */
  static async createTicket(input: CreateTicketInput): Promise<{
    success: boolean;
    ticketId?: string;
    caseNumber?: string;
    error?: string;
  }> {
    try {
      const { data, error } = await (supabase as any).rpc('customer_create_support_ticket', {
        p_category: input.category,
        p_subject: input.subject,
        p_description: input.description,
        p_priority: input.priority || 'MEDIUM',
        p_related_meter_id: input.relatedMeterId || null,
        p_related_wallet_tx_id: input.relatedWalletTxId || null,
        p_related_electricity_tx_id: input.relatedElectricityTxId || null,
        p_internal_reference: input.internalReference || null,
        p_provider_reference: input.providerReference || null,
      });

      if (error) throw error;
      const res = data as any;
      return {
        success: res?.success || false,
        ticketId: res?.ticket_id,
        caseNumber: res?.case_number,
      };
    } catch (err: any) {
      console.warn('[SupportService.createTicket] Error:', err);
      return { success: false, error: err.message || 'Unable to submit ticket' };
    }
  }

  /**
   * Customer replies to an existing ticket.
   */
  static async replyToTicket(
    ticketId: string,
    message: string
  ): Promise<{ success: boolean; noteId?: string; status?: SupportStatus; error?: string }> {
    try {
      if (!message.trim()) {
        return { success: false, error: 'Message cannot be empty' };
      }

      const { data, error } = await (supabase as any).rpc('customer_reply_to_ticket', {
        p_ticket_id: ticketId,
        p_message: message.trim(),
      });

      if (error) throw error;
      const res = data as any;
      return {
        success: res?.success || false,
        noteId: res?.note_id,
        status: res?.status as SupportStatus,
      };
    } catch (err: any) {
      console.warn('[SupportService.replyToTicket] Error:', err);
      return { success: false, error: err.message || 'Failed to send reply' };
    }
  }

  /**
   * Customer closes a ticket.
   */
  static async closeTicket(ticketId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await (supabase as any).rpc('customer_close_ticket', {
        p_ticket_id: ticketId,
      });

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.warn('[SupportService.closeTicket] Error:', err);
      return { success: false, error: err.message || 'Failed to close ticket' };
    }
  }

  /**
   * Customer reopens a resolved or closed ticket.
   */
  static async reopenTicket(
    ticketId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await (supabase as any).rpc('customer_reopen_ticket', {
        p_ticket_id: ticketId,
        p_reason: reason || 'Customer requested follow-up',
      });

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.warn('[SupportService.reopenTicket] Error:', err);
      return { success: false, error: err.message || 'Failed to reopen ticket' };
    }
  }

  /**
   * Gets total count of unread staff replies across all customer tickets.
   */
  static async getUnreadSupportCount(): Promise<number> {
    try {
      const { data, error } = await (supabase as any).rpc('customer_get_unread_support_count');
      if (error) throw error;
      return typeof data === 'number' ? data : 0;
    } catch (err) {
      console.warn('[SupportService.getUnreadSupportCount] Error:', err);
      return 0;
    }
  }

  /**
   * Marks all staff notes for a specific ticket as read.
   */
  static async markTicketRead(ticketId: string): Promise<boolean> {
    try {
      const { data, error } = await (supabase as any).rpc('customer_mark_ticket_read', {
        p_ticket_id: ticketId,
      });
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('[SupportService.markTicketRead] Error:', err);
      return false;
    }
  }

  /**
   * Retrieves published Frequently Asked Questions (FAQs).
   */
  static async getFaqs(category?: string): Promise<SupportFaq[]> {
    try {
      let query = (supabase as any)
        .from('support_faqs')
        .select('*')
        .eq('is_published', true)
        .order('display_order', { ascending: true });

      if (category && category !== 'ALL') {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        category: row.category,
        question: row.question,
        answer: row.answer,
        displayOrder: row.display_order,
      }));
    } catch (err) {
      console.warn('[SupportService.getFaqs] Error:', err);
      return [];
    }
  }

  /**
   * Subscribes to real-time message and status updates for a ticket.
   */
  static subscribeToTicket(
    ticketId: string,
    onMessage: (message: SupportMessage) => void,
    onStatusChange?: (status: SupportStatus) => void
  ): RealtimeChannel {
    const channel = (supabase as any).channel(`support-ticket-${ticketId}`);

    // Listen to new notes
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_case_notes',
          filter: `case_id=eq.${ticketId}`,
        },
        (payload: any) => {
          if (payload.new && !payload.new.is_internal) {
            onMessage({
              id: payload.new.id,
              ticketId: payload.new.case_id,
              authorUserId: payload.new.author_user_id,
              isStaff: true,
              message: payload.new.note,
              createdAt: payload.new.created_at,
              readAt: payload.new.read_by_customer_at,
            });
          }
        }
      )
      // Listen to ticket status updates
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_cases',
          filter: `id=eq.${ticketId}`,
        },
        (payload: any) => {
          if (payload.new?.status && onStatusChange) {
            onStatusChange(payload.new.status as SupportStatus);
          }
        }
      )
      .subscribe();

    return channel;
  }
}
