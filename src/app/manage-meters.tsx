import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Rounded, Typography } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/context/ThemeContext';
import { CustomAlert } from '@/context/AlertContext';
import type { Meter } from '@/context/AppContext';

export default function ManageMetersScreen() {
  const { meters, activeMeterId, selectMeter, deleteMeter, renameMeter } = useApp();
  const { colors, isDark } = useTheme();

  const [renameModal, setRenameModal] = useState<{ visible: boolean; meter: Meter | null }>({
    visible: false,
    meter: null,
  });
  const [renameValue, setRenameValue] = useState('');

  const openRename = (meter: Meter) => {
    setRenameValue(meter.name);
    setRenameModal({ visible: true, meter });
  };

  const confirmRename = () => {
    if (renameModal.meter && renameValue.trim()) {
      renameMeter(renameModal.meter.id, renameValue.trim());
    }
    setRenameModal({ visible: false, meter: null });
    setRenameValue('');
  };

  const cancelRename = () => {
    setRenameModal({ visible: false, meter: null });
    setRenameValue('');
  };

  const handleDelete = (meter: Meter) => {
    const isLast = meters.length === 1;
    CustomAlert.alert(
      'Remove Meter',
      isLast
        ? `"${meter.name}" is your only meter. Removing it will leave your account with no active meter.`
        : `Remove "${meter.name}" from your account? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => deleteMeter(meter.id) },
      ],
      { type: 'confirm' }
    );
  };

  const handleSetActive = (meter: Meter) => {
    if (activeMeterId === meter.id) return;
    selectMeter(meter.id);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: colors.outlineVariant }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.surfaceContainer }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, Typography.headlineMd, { color: colors.text }]}>My Meters</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionLabel, Typography.labelCaps, { color: colors.outline }]}>
          {meters.length} {meters.length === 1 ? 'Meter' : 'Meters'} Connected
        </Text>

        {meters.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.surfaceContainerHigh }]}>
              <MaterialCommunityIcons name="lightning-bolt-outline" size={48} color={colors.outlineVariant} />
            </View>
            <Text style={[styles.emptyTitle, Typography.headlineMd, { color: colors.primary }]}>No Meters Added</Text>
            <Text style={[styles.emptySubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
              Add a prepaid meter to start buying electricity and tracking usage.
            </Text>
          </View>
        ) : (
          <View style={styles.meterList}>
            {meters.map((meter) => {
              const isActive = activeMeterId === meter.id;
              return (
                <View
                  key={meter.id}
                  style={[
                    styles.meterCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isActive ? colors.secondary : colors.outlineVariant,
                    },
                    isActive && styles.meterCardActive,
                  ]}
                >
                  {isActive && <View style={[styles.activeStrip, { backgroundColor: colors.secondary }]} />}

                  <View style={styles.meterCardInner}>
                    <View
                      style={[
                        styles.meterIconWrap,
                        {
                          backgroundColor: isActive
                            ? 'rgba(132,204,22,0.15)'
                            : colors.surfaceContainerHigh,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="lightning-bolt"
                        size={22}
                        color={isActive ? colors.secondaryDark : colors.outline}
                      />
                    </View>

                    <View style={styles.meterInfo}>
                      <View style={styles.meterNameRow}>
                        <Text style={[styles.meterName, Typography.metricUnit, { color: colors.primary }]} numberOfLines={1}>
                          {meter.name}
                        </Text>
                        {isActive && (
                          <View style={[styles.activePill, { backgroundColor: 'rgba(132,204,22,0.15)' }]}>
                            <Text style={[styles.activePillText, Typography.labelCaps, { color: colors.secondaryDark }]}>Active</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.meterDisco, Typography.labelCaps, { color: colors.textSecondary }]} numberOfLines={1}>
                        {meter.disco}
                      </Text>
                      <Text style={[styles.meterNumber, Typography.labelCaps, { color: colors.outline }]}>
                        ••••{meter.number.replace(/\s/g, '').slice(-4)}
                      </Text>
                      {meter.address ? (
                        <Text style={[styles.meterAddress, Typography.labelCaps, { color: colors.outline }]} numberOfLines={1}>
                          {meter.address}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={[styles.actionRow, { borderTopColor: colors.outlineVariant }]}>
                    {!isActive ? (
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleSetActive(meter)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="radio-button-unchecked" size={16} color={colors.primary} />
                        <Text style={[styles.actionBtnText, Typography.labelCaps, { color: colors.primary }]}>Set Active</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.actionBtnActive}>
                        <MaterialIcons name="check-circle" size={16} color={colors.secondaryDark} />
                        <Text style={[styles.actionBtnTextActive, Typography.labelCaps, { color: colors.secondaryDark }]}>Currently Active</Text>
                      </View>
                    )}

                    <View style={styles.actionRight}>
                      <TouchableOpacity
                        style={[styles.iconAction, { backgroundColor: colors.surfaceContainerLow }]}
                        onPress={() => openRename(meter)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="edit" size={18} color={colors.outline} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.iconAction, styles.iconActionDelete, { backgroundColor: isDark ? 'rgba(248,81,73,0.15)' : 'rgba(186,26,26,0.06)' }]}
                        onPress={() => handleDelete(meter)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky Add Meter CTA */}
      <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.outlineVariant }]}>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: isDark ? colors.secondary : colors.primary }]}
          onPress={() => router.push('/add-meter')}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name="lightning-bolt-circle"
            size={22}
            color={isDark ? colors.background : '#ffffff'}
          />
          <Text style={[styles.addBtnText, Typography.headlineMd, { color: isDark ? colors.background : '#ffffff' }]}>
            Add New Meter
          </Text>
        </TouchableOpacity>
      </View>

      {/* Rename Modal */}
      <Modal
        visible={renameModal.visible}
        transparent
        animationType="fade"
        onRequestClose={cancelRename}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={cancelRename} />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.outlineVariant }]} />
            <Text style={[styles.modalTitle, Typography.headlineMd, { color: colors.primary }]}>Rename Meter</Text>
            <Text style={[styles.modalSubtitle, Typography.bodyMd, { color: colors.textSecondary }]}>
              Give this meter a friendly name so you can identify it easily.
            </Text>
            <View style={[styles.renameInputWrap, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.primary }]}>
              <MaterialIcons name="edit" size={18} color={colors.outline} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.renameInput, Typography.bodyMd, { color: colors.text }]}
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="e.g. Home, Office, Shop"
                placeholderTextColor={colors.outline}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={confirmRename}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                onPress={cancelRename}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelBtnText, Typography.metricUnit, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { backgroundColor: isDark ? colors.secondary : colors.primary },
                  !renameValue.trim() && styles.saveBtnDisabled,
                ]}
                onPress={confirmRename}
                disabled={!renameValue.trim()}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.saveBtnText,
                    Typography.metricUnit,
                    { color: isDark ? colors.background : '#ffffff' },
                  ]}
                >
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  scrollContent: { padding: Spacing.containerMargin },
  sectionLabel: {
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  meterList: { gap: Spacing.sm },
  meterCard: {
    borderRadius: Rounded.xl,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  meterCardActive: {
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  activeStrip: {
    height: 3,
  },
  meterCardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  meterIconWrap: {
    width: 46,
    height: 46,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  meterInfo: { flex: 1 },
  meterNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  meterName: { flex: 1 },
  activePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Rounded.full,
  },
  activePillText: { textTransform: 'uppercase' },
  meterDisco: { textTransform: 'uppercase', marginBottom: 2 },
  meterNumber: { marginBottom: 2 },
  meterAddress: {},
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  actionBtnText: { textTransform: 'uppercase' },
  actionBtnActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  actionBtnTextActive: { textTransform: 'uppercase' },
  actionRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconAction: {
    width: 36,
    height: 36,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionDelete: {},
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.sm,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: {},
  emptySubtitle: { textAlign: 'center', maxWidth: 260, lineHeight: 22 },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.containerMargin,
    borderTopWidth: 1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    height: 52,
    borderRadius: Rounded.full,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  addBtnText: {},
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15,23,42,0.5)',
  },
  modalSheet: {
    borderTopLeftRadius: Rounded.xl,
    borderTopRightRadius: Rounded.xl,
    padding: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 40 : Spacing.lg,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.xs,
  },
  modalTitle: {},
  modalSubtitle: { fontSize: 14 },
  renameInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1,
    borderRadius: Rounded.default,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
    elevation: 2,
  },
  renameInput: {
    flex: 1,
    paddingVertical: 0,
  },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {},
  saveBtn: {
    flex: 1,
    height: 48,
    borderRadius: Rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: {},
});
