import { useFocusEffect } from 'expo-router';
import { AlarmClock, Bell, BellOff, ChevronLeft, Plus, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AddReminderModal } from '@/components/reminders/AddReminderModal';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Screen } from '@/components/ui/Screen';
import { motion } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useReminders } from '@/hooks/useReminders';
import type { Reminder, ReminderAlertType } from '@/types/database';
import { scheduledAlertDate } from '@/utils/scheduledAlertDate';
import { useSafeBack } from '@/utils/navigation';

const alertLabels: Record<ReminderAlertType, string> = {
  silent: 'Silent', standard: 'Notification', alarm: 'Alarm',
};

function reminderTime(reminder: Reminder) {
  const date = scheduledAlertDate(reminder.target_date, reminder.target_time.slice(0, 5));
  return date?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) ?? reminder.target_time.slice(0, 5);
}

export function RemindersScreen() {
  const safeBack = useSafeBack();
  const { colors } = useTheme();
  const { reminders, sections, loading, error, refresh, addReminder, toggleCompletion, deleteReminder } = useReminders();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => { void refresh(false); }, [refresh]));

  const save = async (values: Parameters<typeof addReminder>[0]) => {
    setSaving(true);
    try { await addReminder(values); }
    finally { setSaving(false); }
  };

  const confirmDelete = (reminder: Reminder) => Alert.alert(
    'Delete reminder?',
    `“${reminder.title}” and its scheduled notification will be removed.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteReminder(reminder).catch(() => undefined) },
    ],
  );

  const renderReminder = ({ item, index }: { item: Reminder; index: number }) => {
    const Icon = item.alert_type === 'silent' ? BellOff : item.alert_type === 'alarm' ? AlarmClock : Bell;
    const iconColor = item.alert_type === 'alarm' ? colors.danger : item.alert_type === 'silent' ? colors.textMuted : colors.accent;
    return <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * motion.stagger).duration(motion.standard)}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${reminderTime(item)}, ${alertLabels[item.alert_type]}`}
        accessibilityHint="Long press to delete this reminder"
        onLongPress={() => confirmDelete(item)}
        delayLongPress={450}
        style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Checkbox checked={false} label={`Complete ${item.title}`} onPress={() => void toggleCompletion(item).catch(() => undefined)} />
        <View style={styles.copy}>
          <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.text }]}>{item.title}</Text>
          <View style={styles.metadata}>
            <Text style={[styles.time, { color: colors.textMuted }]}>{reminderTime(item)}</Text>
            <View style={[styles.alertChip, { backgroundColor: item.alert_type === 'alarm' ? `${colors.danger}16` : colors.accentSoft }]}>
              <Icon size={12} color={iconColor} />
              <Text style={[styles.alertText, { color: iconColor }]}>{alertLabels[item.alert_type]}</Text>
            </View>
          </View>
        </View>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`} hitSlop={10} onPress={() => confirmDelete(item)} style={styles.deleteButton}>
          <Trash2 size={17} color={colors.textMuted} />
        </AnimatedPressable>
      </AnimatedPressable>
    </Animated.View>;
  };

  return <Screen contentStyle={styles.screen}>
    <View style={styles.header}>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="Back" onPress={safeBack} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ChevronLeft color={colors.text} />
      </AnimatedPressable>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.text }]}>Reminders</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{reminders.length ? `${reminders.length} things waiting for you` : 'Everything important, right on time'}</Text>
      </View>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="Add reminder" onPress={() => setModalOpen(true)} style={[styles.addIcon, { backgroundColor: colors.accent }]}>
        <Plus size={22} color={colors.buttonText} />
      </AnimatedPressable>
    </View>

    {Platform.OS === 'web' && <View style={[styles.notice, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}><Bell size={17} color={colors.accent} /><Text style={[styles.noticeText, { color: colors.textMuted }]}>Browser reminders work while Lifeaholic is open. Allow notifications when prompted.</Text></View>}
    {error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>{error}</Text>}

    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={renderReminder}
      renderSectionHeader={({ section }) => <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}><Text style={[styles.sectionTitle, { color: section.key === 'overdue' ? colors.danger : colors.textMuted }]}>{section.title.toUpperCase()}</Text><Text style={[styles.sectionCount, { color: colors.textMuted }]}>{section.data.length}</Text></View>}
      stickySectionHeadersEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.list, sections.length === 0 && styles.emptyList]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
      ListEmptyComponent={loading
        ? <ActivityIndicator color={colors.accent} />
        : <View style={[styles.empty, { borderColor: colors.border }]}><View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}><Bell size={30} color={colors.accent} /></View><Text style={[styles.emptyTitle, { color: colors.text }]}>All clear</Text><Text style={[styles.emptyText, { color: colors.textMuted }]}>Add a reminder and Lifeaholic will keep it on your radar.</Text><Button label="Add your first reminder" icon={Plus} onPress={() => setModalOpen(true)} /></View>}
    />

    <AddReminderModal visible={modalOpen} saving={saving} onClose={() => setModalOpen(false)} onSave={save} />
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: 16, gap: 12 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 44, height: 44, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }, heading: { flex: 1 }, title: { fontSize: 29, fontWeight: '900' }, subtitle: { marginTop: 2, fontSize: 12 }, addIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, notice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }, noticeText: { flex: 1, fontSize: 11, lineHeight: 16 }, error: { fontSize: 12, fontWeight: '700' }, list: { paddingBottom: 38 }, emptyList: { flexGrow: 1, justifyContent: 'center' }, sectionHeader: { paddingTop: 13, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 7 }, sectionTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, sectionCount: { fontSize: 10, fontWeight: '800' }, row: { minHeight: 78, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 11 }, copy: { flex: 1, minWidth: 0 }, rowTitle: { fontSize: 15, fontWeight: '800', lineHeight: 20 }, metadata: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }, time: { fontSize: 11, fontWeight: '700' }, alertChip: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }, alertText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 }, deleteButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }, separator: { height: 8 }, sectionSeparator: { height: 3 }, empty: { marginHorizontal: 2, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderRadius: 24, padding: 24, alignItems: 'center', gap: 9 }, emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { fontSize: 20, fontWeight: '900' }, emptyText: { maxWidth: 270, marginBottom: 6, textAlign: 'center', fontSize: 12, lineHeight: 18 },
});
