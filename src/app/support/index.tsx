import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';
import { SupportService, SupportTicket, SupportFaq, SupportCategory } from '@/services/support.service';

export default function SupportCenterScreen() {
  const { colors, isDark } = useTheme();
  const { user, session, unreadSupportCount, refreshSupportCount } = useApp();
  const activeUserId = user?.id || session?.user?.id || '';

  const [activeTab, setActiveTab] = useState<'tickets' | 'faqs'>('tickets');
  const [ticketFilter, setTicketFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ALL');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [faqs, setFaqs] = useState<SupportFaq[]>([]);
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [faqSearch, setFaqSearch] = useState('');
  const [faqCategory, setFaqCategory] = useState<string>('ALL');

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTickets = useCallback(async () => {
    if (!activeUserId) return;
    try {
      const res = await SupportService.getTickets(activeUserId, ticketFilter);
      if (res.success) {
        setTickets(res.data);
      }
    } catch (e) {
      console.warn('Error loading tickets:', e);
    }
  }, [activeUserId, ticketFilter]);

  const fetchFaqs = useCallback(async () => {
    try {
      const data = await SupportService.getFaqs();
      setFaqs(data);
    } catch (e) {
      console.warn('Error loading FAQs:', e);
    }
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchTickets(), fetchFaqs(), refreshSupportCount?.()]);
    setIsLoading(false);
  }, [fetchTickets, fetchFaqs, refreshSupportCount]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchTickets(), fetchFaqs(), refreshSupportCount?.()]);
    setIsRefreshing(false);
  };

  const handleQuickReport = (category: SupportCategory, prefillSubject: string) => {
    router.push({
      pathname: '/support/new-ticket' as any,
      params: { category, subject: prefillSubject },
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return colors.primary;
      case 'IN_PROGRESS':
      case 'ASSIGNED':
        return '#0284c7'; // Sky blue
      case 'WAITING':
      case 'WAITING_FOR_CUSTOMER':
        return '#d97706'; // Amber
      case 'RESOLVED':
        return isDark ? colors.secondary : colors.secondaryDark;
      case 'CLOSED':
        return colors.outline;
      default:
        return colors.textSecondary;
    }
  };

  const formatCategory = (cat: string) => {
    return cat
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const filteredFaqs = faqs.filter((faq) => {
    const matchesSearch =
      faq.question.toLowerCase().includes(faqSearch.toLowerCase()) ||
      faq.answer.toLowerCase().includes(faqSearch.toLowerCase());
    const matchesCat = faqCategory === 'ALL' || faq.category === faqCategory;
    return matchesSearch && matchesCat;
  });

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
            Support Center
          </Text>
          <Text style={[styles.topBarSubtitle, Typography.labelCaps, { color: colors.textSecondary }]}>
            PayPawa Care Desk
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.newTicketBtn, { backgroundColor: isDark ? colors.secondary : colors.primary }]}
          onPress={() => router.push('/support/new-ticket' as any)}
          accessibilityLabel="Create ticket"
        >
          <MaterialIcons name="add" size={22} color={isDark ? colors.background : colors.white} />
        </TouchableOpacity>
      </View>

      {/* Segment Tab Selector */}
      <View style={[styles.tabSelectorBar, { borderBottomColor: colors.outlineVariant }]}>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            activeTab === 'tickets' && {
              borderBottomColor: isDark ? colors.secondary : colors.primary,
              borderBottomWidth: 2,
            },
          ]}
          onPress={() => setActiveTab('tickets')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialIcons
              name="confirmation-number"
              size={18}
              color={activeTab === 'tickets' ? (isDark ? colors.secondary : colors.primary) : colors.outline}
            />
            <Text
              style={[
                styles.tabBtnText,
                Typography.metricUnit,
                {
                  color: activeTab === 'tickets' ? (isDark ? colors.secondary : colors.primary) : colors.outline,
                  fontWeight: activeTab === 'tickets' ? '700' : '500',
                },
              ]}
            >
              My Tickets
            </Text>
            {unreadSupportCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: colors.error }]}>
                <Text style={styles.unreadBadgeText}>
                  {unreadSupportCount > 9 ? '9+' : unreadSupportCount}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabBtn,
            activeTab === 'faqs' && {
              borderBottomColor: isDark ? colors.secondary : colors.primary,
              borderBottomWidth: 2,
            },
          ]}
          onPress={() => setActiveTab('faqs')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialIcons
              name="help-outline"
              size={18}
              color={activeTab === 'faqs' ? (isDark ? colors.secondary : colors.primary) : colors.outline}
            />
            <Text
              style={[
                styles.tabBtnText,
                Typography.metricUnit,
                {
                  color: activeTab === 'faqs' ? (isDark ? colors.secondary : colors.primary) : colors.outline,
                  fontWeight: activeTab === 'faqs' ? '700' : '500',
                },
              ]}
            >
              FAQ & Guides
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* TICKETS TAB */}
        {activeTab === 'tickets' && (
          <View>
            {/* Quick Report Issue Shortcuts */}
            <Text style={[styles.sectionTitle, Typography.labelCaps, { color: colors.textSecondary }]}>
              Quick Issue Reporter
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickReportsRow}>
              <TouchableOpacity
                style={[styles.quickCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
                onPress={() => handleQuickReport('FAILED_PURCHASE', 'Failed Electricity Purchase')}
                activeOpacity={0.8}
              >
                <View style={[styles.quickIconWrap, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                  <MaterialCommunityIcons name="lightning-bolt" size={20} color="#ef4444" />
                </View>
                <Text style={[styles.quickCardTitle, Typography.metricUnit, { color: colors.text }]}>
                  Failed Purchase
                </Text>
                <Text style={[styles.quickCardSub, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Token not vended
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
                onPress={() => handleQuickReport('MISSING_TOKEN', 'Missing Electricity Token')}
                activeOpacity={0.8}
              >
                <View style={[styles.quickIconWrap, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
                  <MaterialIcons name="vpn-key" size={20} color="#f59e0b" />
                </View>
                <Text style={[styles.quickCardTitle, Typography.metricUnit, { color: colors.text }]}>
                  Missing Token
                </Text>
                <Text style={[styles.quickCardSub, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Retrieve code
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
                onPress={() => handleQuickReport('WALLET_FUNDING', 'Wallet Funding Issue')}
                activeOpacity={0.8}
              >
                <View style={[styles.quickIconWrap, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
                  <MaterialIcons name="account-balance-wallet" size={20} color="#3b82f6" />
                </View>
                <Text style={[styles.quickCardTitle, Typography.metricUnit, { color: colors.text }]}>
                  Wallet Deposit
                </Text>
                <Text style={[styles.quickCardSub, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Bank credit delay
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
                onPress={() => handleQuickReport('METER_VERIFICATION', 'Meter Verification Issue')}
                activeOpacity={0.8}
              >
                <View style={[styles.quickIconWrap, { backgroundColor: 'rgba(168,85,247,0.12)' }]}>
                  <MaterialIcons name="speed" size={20} color="#a855f7" />
                </View>
                <Text style={[styles.quickCardTitle, Typography.metricUnit, { color: colors.text }]}>
                  Meter Issue
                </Text>
                <Text style={[styles.quickCardSub, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Lookup failure
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Filter Pills */}
            <View style={styles.filterPillsRow}>
              {(['ALL', 'ACTIVE', 'RESOLVED'] as const).map((filter) => {
                const isSelected = ticketFilter === filter;
                return (
                  <TouchableOpacity
                    key={filter}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: isSelected
                          ? (isDark ? colors.secondary : colors.primary)
                          : colors.surfaceContainer,
                      },
                    ]}
                    onPress={() => setTicketFilter(filter)}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        Typography.labelCaps,
                        {
                          color: isSelected ? (isDark ? colors.background : colors.white) : colors.textSecondary,
                        },
                      ]}
                    >
                      {filter}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Tickets List */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.loadingText, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Loading support tickets...
                </Text>
              </View>
            ) : tickets.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
                <View style={[styles.emptyIconWrap, { backgroundColor: colors.surfaceContainerHighest }]}>
                  <MaterialIcons name="headset-mic" size={36} color={colors.outline} />
                </View>
                <Text style={[styles.emptyTitle, Typography.headlineMd, { color: colors.text }]}>
                  No support tickets found
                </Text>
                <Text style={[styles.emptySubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Have an inquiry or issue with an electricity token or payment? Our support specialists are here to help.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyCta, { backgroundColor: isDark ? colors.secondary : colors.primary }]}
                  onPress={() => router.push('/support/new-ticket' as any)}
                >
                  <MaterialIcons name="add-comment" size={18} color={isDark ? colors.background : colors.white} />
                  <Text
                    style={[
                      styles.emptyCtaText,
                      Typography.metricUnit,
                      { color: isDark ? colors.background : colors.white },
                    ]}
                  >
                    Start a Conversation
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              tickets.map((t) => {
                const statusColor = getStatusColor(t.status);
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.ticketCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
                    onPress={() => router.push(`/support/${t.id}` as any)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.ticketCardHeader}>
                      <View style={styles.ticketNumberWrap}>
                        <MaterialIcons name="confirmation-number" size={16} color={colors.outline} />
                        <Text style={[styles.ticketCaseNumber, Typography.metricUnit, { color: colors.text }]}>
                          {t.caseNumber}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.statusText, Typography.labelCaps, { color: statusColor }]}>
                          {t.status.replace(/_/g, ' ')}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.ticketSubject, Typography.metricUnit, { color: colors.text }]} numberOfLines={2}>
                      {t.subject}
                    </Text>

                    <Text style={[styles.ticketDescription, Typography.bodyMd, { color: colors.textSecondary }]} numberOfLines={2}>
                      {t.description}
                    </Text>

                    <View style={[styles.ticketFooter, { borderTopColor: colors.outlineVariant }]}>
                      <View style={styles.ticketCategoryBadge}>
                        <Text style={[styles.ticketCategoryText, Typography.labelCaps, { color: colors.textSecondary }]}>
                          {formatCategory(t.category)}
                        </Text>
                      </View>

                      {t.internalReference && (
                        <Text style={[styles.ticketRefText, Typography.labelCaps, { color: colors.outline }]}>
                          Ref: {t.internalReference}
                        </Text>
                      )}

                      <Text style={[styles.ticketDateText, Typography.labelCaps, { color: colors.outline }]}>
                        {new Date(t.updatedAt || t.createdAt).toLocaleDateString('en-NG', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* FAQS TAB */}
        {activeTab === 'faqs' && (
          <View>
            {/* Search Input */}
            <View style={[styles.faqSearchBox, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              <MaterialIcons name="search" size={20} color={colors.outline} />
              <TextInput
                style={[styles.faqSearchInput, { color: colors.text }]}
                placeholder="Search troubleshooting questions..."
                placeholderTextColor={colors.outline}
                value={faqSearch}
                onChangeText={setFaqSearch}
              />
              {faqSearch.length > 0 && (
                <TouchableOpacity onPress={() => setFaqSearch('')}>
                  <MaterialIcons name="close" size={18} color={colors.outline} />
                </TouchableOpacity>
              )}
            </View>

            {/* Category Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.faqCategoryRow}>
              {['ALL', 'ELECTRICITY_PURCHASE', 'WALLET', 'METER', 'ACCOUNT'].map((cat) => {
                const isSelected = faqCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: isSelected
                          ? (isDark ? colors.secondary : colors.primary)
                          : colors.surfaceContainer,
                      },
                    ]}
                    onPress={() => setFaqCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        Typography.labelCaps,
                        {
                          color: isSelected ? (isDark ? colors.background : colors.white) : colors.textSecondary,
                        },
                      ]}
                    >
                      {cat === 'ALL' ? 'All Questions' : formatCategory(cat)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* FAQ List */}
            {filteredFaqs.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
                <MaterialIcons name="search-off" size={36} color={colors.outline} />
                <Text style={[styles.emptyTitle, Typography.headlineMd, { color: colors.text }]}>
                  No matching answers
                </Text>
                <Text style={[styles.emptySubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
                  Can't find what you are looking for? Start a ticket with our support specialists.
                </Text>
              </View>
            ) : (
              filteredFaqs.map((faq) => {
                const isExpanded = expandedFaqId === faq.id;
                return (
                  <TouchableOpacity
                    key={faq.id}
                    style={[
                      styles.faqCard,
                      { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
                    ]}
                    onPress={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.faqHeader}>
                      <Text style={[styles.faqQuestion, Typography.metricUnit, { color: colors.text, flex: 1 }]}>
                        {faq.question}
                      </Text>
                      <MaterialIcons
                        name={isExpanded ? 'expand-less' : 'expand-more'}
                        size={22}
                        color={colors.outline}
                      />
                    </View>
                    {isExpanded && (
                      <View style={[styles.faqAnswerWrap, { borderTopColor: colors.outlineVariant }]}>
                        <Text style={[styles.faqAnswer, Typography.bodyMd, { color: colors.textSecondary }]}>
                          {faq.answer}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* Contact Support Direct Card */}
        <View style={[styles.contactCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
          <View style={styles.contactHeader}>
            <MaterialIcons name="support-agent" size={24} color={isDark ? colors.secondary : colors.primary} />
            <Text style={[styles.contactTitle, Typography.headlineMd, { color: colors.text }]}>
              PayPawa Customer Care
            </Text>
          </View>
          <Text style={[styles.contactBody, Typography.bodyMd, { color: colors.textSecondary }]}>
            Our technical support team operates Monday – Sunday, 8:00 AM – 10:00 PM WAT.
          </Text>
          <View style={styles.contactRow}>
            <MaterialIcons name="email" size={16} color={colors.outline} />
            <Text style={[styles.contactEmail, Typography.metricUnit, { color: colors.primary }]}>
              support@paypawa.ng
            </Text>
          </View>
        </View>
      </ScrollView>
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
  topBarTitle: {},
  topBarSubtitle: { fontSize: 10, marginTop: 1 },
  newTicketBtn: {
    width: 40,
    height: 40,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSelectorBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnText: {},
  unreadBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Rounded.full,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  scrollContent: {
    padding: Spacing.containerMargin,
    paddingBottom: 80,
  },
  sectionTitle: {
    fontSize: 12,
    marginBottom: Spacing.sm,
    paddingLeft: 2,
  },
  quickReportsRow: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  quickCard: {
    width: 140,
    padding: Spacing.md,
    borderRadius: Rounded.lg,
    borderWidth: 1,
  },
  quickIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Rounded.default,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  quickCardTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  quickCardSub: {
    fontSize: 11,
    marginTop: 2,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  filterPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Rounded.full,
  },
  filterPillText: {
    fontSize: 11,
  },
  loadingContainer: {
    paddingVertical: Spacing.xl * 2,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyContainer: {
    padding: Spacing.xl,
    borderRadius: Rounded.xl,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  emptyTitle: {
    fontSize: 18,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Rounded.full,
    marginTop: Spacing.sm,
  },
  emptyCtaText: {
    fontSize: 14,
  },
  ticketCard: {
    borderRadius: Rounded.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  ticketNumberWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ticketCaseNumber: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Rounded.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  ticketSubject: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 4,
  },
  ticketDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  ticketCategoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ticketCategoryText: {
    fontSize: 10,
  },
  ticketRefText: {
    fontSize: 10,
  },
  ticketDateText: {
    fontSize: 10,
  },
  faqSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: Rounded.lg,
    paddingHorizontal: Spacing.md,
    height: 46,
    marginBottom: Spacing.md,
  },
  faqSearchInput: {
    flex: 1,
    fontSize: 14,
  },
  faqCategoryRow: {
    gap: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  faqCard: {
    borderRadius: Rounded.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  faqQuestion: {
    fontSize: 14,
    fontWeight: '600',
  },
  faqAnswerWrap: {
    borderTopWidth: 1,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  faqAnswer: {
    fontSize: 13,
    lineHeight: 19,
  },
  contactCard: {
    borderRadius: Rounded.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    gap: Spacing.xs,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 2,
  },
  contactTitle: {
    fontSize: 16,
  },
  contactBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xs,
  },
  contactEmail: {
    fontSize: 13,
    fontWeight: '600',
  },
});
