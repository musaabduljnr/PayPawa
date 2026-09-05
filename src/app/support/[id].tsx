import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';
import { CustomAlert } from '@/context/AlertContext';
import {
  SupportService,
  SupportTicket,
  SupportMessage,
  SupportStatus,
} from '@/services/support.service';

export default function TicketDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  const { refreshSupportCount } = useApp();

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const channelRef = useRef<any>(null);

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      const res = await SupportService.getTicketDetails(id);
      if (res.success && res.ticket) {
        setTicket(res.ticket);
        setMessages(res.messages);
        await SupportService.markTicketRead(id);
        refreshSupportCount?.();
      }
    } catch (e) {
      console.warn('Error fetching ticket details:', e);
    }
  }, [id, refreshSupportCount]);

  useEffect(() => {
    setIsLoading(true);
    fetchDetails().finally(() => setIsLoading(false));

    // Realtime listener
    if (id) {
      channelRef.current = SupportService.subscribeToTicket(
        id,
        (newMsg) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          SupportService.markTicketRead(id);
          refreshSupportCount?.();
          setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
        },
        (newStatus) => {
          setTicket((prev) => (prev ? { ...prev, status: newStatus } : null));
        }
      );
    }

    // Active polling fallback (every 5s) to guarantee zero latency on staff replies
    const pollTimer = setInterval(() => {
      fetchDetails();
    }, 5000);

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
      clearInterval(pollTimer);
    };
  }, [id, fetchDetails, refreshSupportCount]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchDetails();
    setIsRefreshing(false);
  };

  const handleSend = async () => {
    if (!id || !inputText.trim() || isSending) return;

    const msgToSend = inputText.trim();
    setInputText('');
    setIsSending(true);

    try {
      const res = await SupportService.replyToTicket(id, msgToSend);
      if (res.success) {
        if (res.status && ticket) {
          setTicket({ ...ticket, status: res.status });
        }
        await fetchDetails();
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      } else {
        CustomAlert.alert(
          'Error',
          res.error || 'Unable to send reply. Please check your connection.',
          [{ text: 'Dismiss', style: 'default' }],
          { type: 'error' }
        );
        setInputText(msgToSend);
      }
    } catch (err: any) {
      CustomAlert.alert(
        'Error',
        err?.message || 'A network error occurred.',
        [{ text: 'Dismiss', style: 'default' }],
        { type: 'error' }
      );
      setInputText(msgToSend);
    } finally {
      setIsSending(false);
    }
  };

  const handleCloseTicket = () => {
    if (!id || actionLoading) return;
    CustomAlert.alert(
      'Close Ticket',
      'Are you sure you want to mark this support request as resolved and closed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Close Ticket',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const res = await SupportService.closeTicket(id);
              if (res.success) {
                setTicket((prev) => (prev ? { ...prev, status: 'CLOSED' } : null));
                CustomAlert.alert('Ticket Closed', 'Your ticket has been closed.', [{ text: 'OK', style: 'default' }], { type: 'success' });
              }
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
      { type: 'warning' }
    );
  };

  const handleReopenTicket = () => {
    if (!id || actionLoading) return;
    CustomAlert.alert(
      'Reopen Ticket',
      'Would you like to reopen this ticket for further follow-up with our support team?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen Ticket',
          style: 'default',
          onPress: async () => {
            setActionLoading(true);
            try {
              const res = await SupportService.reopenTicket(id, 'Customer requested follow-up');
              if (res.success) {
                setTicket((prev) => (prev ? { ...prev, status: 'OPEN' } : null));
                await fetchDetails();
                CustomAlert.alert('Ticket Reopened', 'Your ticket is now open. You can post a new message.', [{ text: 'OK', style: 'default' }], { type: 'success' });
              }
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
      { type: 'info' }
    );
  };

  const getStatusColor = (status?: SupportStatus) => {
    switch (status) {
      case 'OPEN':
        return colors.primary;
      case 'IN_PROGRESS':
      case 'ASSIGNED':
        return '#0284c7';
      case 'WAITING':
      case 'WAITING_FOR_CUSTOMER':
        return '#d97706';
      case 'RESOLVED':
        return isDark ? colors.secondary : colors.secondaryDark;
      case 'CLOSED':
        return colors.outline;
      default:
        return colors.textSecondary;
    }
  };

  const statusColor = getStatusColor(ticket?.status);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.outlineVariant }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.surfaceContainer }]}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.topBarTitle, Typography.headlineMd, { color: colors.text }]}>
            {ticket?.caseNumber || 'Ticket Details'}
          </Text>
          <Text style={[styles.topBarSubtitle, Typography.labelCaps, { color: statusColor }]}>
            {ticket?.status ? ticket.status.replace(/_/g, ' ') : 'Loading...'}
          </Text>
        </View>

        {ticket?.status === 'RESOLVED' || ticket?.status === 'CLOSED' ? (
          <TouchableOpacity
            style={[styles.actionIconBtn, { backgroundColor: colors.surfaceContainer }]}
            onPress={handleReopenTicket}
            disabled={actionLoading}
            accessibilityLabel="Reopen Ticket"
          >
            <MaterialIcons name="replay" size={20} color={isDark ? colors.secondary : colors.primary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionIconBtn, { backgroundColor: colors.surfaceContainer }]}
            onPress={handleCloseTicket}
            disabled={actionLoading}
            accessibilityLabel="Close Ticket"
          >
            <MaterialIcons name="check" size={20} color={colors.outline} />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
        >
          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, Typography.bodyMd, { color: colors.textSecondary }]}>
                Loading ticket messages...
              </Text>
            </View>
          ) : ticket ? (
            <>
              {/* Ticket Meta Context Card */}
              <View style={[styles.ticketMetaCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
                <View style={styles.metaHeader}>
                  <View style={[styles.categoryChip, { backgroundColor: colors.surfaceContainer }]}>
                    <Text style={[styles.categoryChipText, Typography.labelCaps, { color: colors.textSecondary }]}>
                      {ticket.category.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <View style={[styles.priorityBadge, { backgroundColor: `${statusColor}18` }]}>
                    <Text style={[styles.priorityText, Typography.labelCaps, { color: statusColor }]}>
                      {ticket.priority} Priority
                    </Text>
                  </View>
                </View>

                <Text style={[styles.ticketSubject, Typography.headlineMd, { color: colors.text }]}>
                  {ticket.subject}
                </Text>

                {(ticket.internalReference || ticket.providerReference) && (
                  <View style={[styles.referenceRow, { borderTopColor: colors.outlineVariant }]}>
                    <MaterialIcons name="receipt-long" size={14} color={colors.outline} />
                    <Text style={[styles.referenceText, Typography.labelCaps, { color: colors.outline }]}>
                      {ticket.internalReference ? `Internal Ref: ${ticket.internalReference}` : ''}
                      {ticket.providerReference ? ` • Gateway Ref: ${ticket.providerReference}` : ''}
                    </Text>
                  </View>
                )}
              </View>

              {/* Status Resolution Banner */}
              {ticket.status === 'RESOLVED' && (
                <View style={[styles.resolvedBanner, { backgroundColor: 'rgba(132,204,22,0.12)', borderColor: isDark ? colors.secondary : colors.secondaryDark }]}>
                  <MaterialIcons name="check-circle" size={20} color={isDark ? colors.secondary : colors.secondaryDark} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resolvedBannerTitle, Typography.labelCaps, { color: isDark ? colors.secondary : colors.secondaryDark }]}>
                      Ticket Resolved by Support
                    </Text>
                    <Text style={[styles.resolvedBannerBody, Typography.bodyMd, { color: colors.textSecondary }]}>
                      {ticket.resolutionNotes || 'Our specialist has provided resolution. If you need further assistance, tap Reopen.'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.reopenSmallBtn} onPress={handleReopenTicket}>
                    <Text style={[styles.reopenSmallBtnText, Typography.labelCaps, { color: isDark ? colors.secondary : colors.primary }]}>
                      Reopen
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Message Feed */}
              <View style={styles.messagesList}>
                {messages.map((msg, index) => {
                  const isStaff = msg.isStaff;
                  return (
                    <View
                      key={msg.id || index}
                      style={[
                        styles.messageRow,
                        isStaff ? styles.messageRowLeft : styles.messageRowRight,
                      ]}
                    >
                      {isStaff && (
                        <View style={[styles.staffAvatar, { backgroundColor: isDark ? colors.secondary : colors.primary }]}>
                          <MaterialIcons name="support-agent" size={16} color={isDark ? colors.background : colors.white} />
                        </View>
                      )}

                      <View
                        style={[
                          styles.messageBubble,
                          isStaff
                            ? [
                                styles.staffBubble,
                                {
                                  backgroundColor: colors.surface,
                                  borderColor: colors.outlineVariant,
                                },
                              ]
                            : [
                                styles.customerBubble,
                                {
                                  backgroundColor: isDark ? colors.secondary : colors.primary,
                                },
                              ],
                        ]}
                      >
                        {isStaff && (
                          <Text style={[styles.staffSenderTitle, Typography.labelCaps, { color: isDark ? colors.secondary : colors.primary }]}>
                            PayPawa Support Specialist
                          </Text>
                        )}
                        <Text
                          style={[
                            styles.messageText,
                            Typography.bodyMd,
                            {
                              color: isStaff
                                ? colors.text
                                : (isDark ? colors.background : colors.white),
                            },
                          ]}
                        >
                          {msg.message}
                        </Text>
                        <Text
                          style={[
                            styles.messageTime,
                            Typography.labelCaps,
                            {
                              color: isStaff
                                ? colors.outline
                                : (isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)'),
                            },
                          ]}
                        >
                          {new Date(msg.createdAt).toLocaleTimeString('en-NG', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}
        </ScrollView>

        {/* Composer Bar */}
        <View style={[styles.composerWrap, { backgroundColor: colors.surface, borderTopColor: colors.outlineVariant }]}>
          {ticket?.status === 'CLOSED' ? (
            <View style={styles.closedComposerRow}>
              <Text style={[styles.closedText, Typography.bodyMd, { color: colors.textSecondary }]}>
                This ticket is closed.
              </Text>
              <TouchableOpacity onPress={handleReopenTicket}>
                <Text style={[styles.reopenLink, Typography.labelCaps, { color: isDark ? colors.secondary : colors.primary }]}>
                  Reopen Ticket to reply
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.composerRow}>
              <TextInput
                style={[
                  styles.composerInput,
                  {
                    backgroundColor: colors.surfaceContainerLow,
                    borderColor: colors.outlineVariant,
                    color: colors.text,
                  },
                ]}
                placeholder="Type your message..."
                placeholderTextColor={colors.outline}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={1000}
                editable={!isSending}
              />
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: isDark ? colors.secondary : colors.primary,
                    opacity: !inputText.trim() || isSending ? 0.4 : 1,
                  },
                ]}
                onPress={handleSend}
                disabled={!inputText.trim() || isSending}
                accessibilityLabel="Send message"
              >
                {isSending ? (
                  <ActivityIndicator size="small" color={isDark ? colors.background : colors.white} />
                ) : (
                  <MaterialIcons name="send" size={20} color={isDark ? colors.background : colors.white} />
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.containerMargin,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: { fontSize: 16 },
  topBarSubtitle: { fontSize: 10, marginTop: 1 },
  actionIconBtn: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: Spacing.containerMargin,
    paddingBottom: 24,
  },
  loadingWrap: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: { fontSize: 13 },
  ticketMetaCard: {
    borderRadius: Rounded.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  metaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  categoryChipText: { fontSize: 10 },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Rounded.full,
  },
  priorityText: { fontSize: 10, fontWeight: '700' },
  ticketSubject: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: Spacing.xs,
  },
  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    paddingTop: Spacing.xs,
    marginTop: Spacing.xs,
  },
  referenceText: { fontSize: 10 },
  resolvedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Rounded.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  resolvedBannerTitle: { fontSize: 11, fontWeight: '700' },
  resolvedBannerBody: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  reopenSmallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reopenSmallBtnText: { fontSize: 11, fontWeight: '700' },
  messagesList: {
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  staffAvatar: {
    width: 28,
    height: 28,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: Rounded.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  customerBubble: {
    borderBottomRightRadius: 2,
  },
  staffBubble: {
    borderWidth: 1,
    borderBottomLeftRadius: 2,
  },
  staffSenderTitle: {
    fontSize: 10,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 9,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  composerWrap: {
    paddingHorizontal: Spacing.containerMargin,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Rounded.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 14,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedComposerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  closedText: { fontSize: 13 },
  reopenLink: { fontSize: 13, fontWeight: '700' },
});
