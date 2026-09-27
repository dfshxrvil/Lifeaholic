import { AlarmClock, Bell, BellOff, CalendarDays, Clock3 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '@/components/ui/AppModal';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Button } from '@/components/ui/Button';
import { FormInput } from '@/components/ui/FormInput';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';
import { useTheme } from '@/contexts/ThemeContext';
import type { AddReminderValues } from '@/hooks/useReminders';
import type { ReminderAlertType } from '@/types/database';
import { toDateKey } from '@/utils/dates';
import { scheduledAlertDate } from '@/utils/scheduledAlertDate';
import ReminderDateTimePicker, { ReminderPickerMode } from './ReminderDateTimePicker';

const alertOptions = [
  { value: 'silent' as const, label: 'Silent', icon: BellOff },
  { value: 'standard' as const, label: 'Notify', icon: Bell },
  { value: 'alarm' as const, label: 'Alarm', icon: AlarmClock },
];

const formatDate = (value: Date) => value.toLocaleDateString(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
});
const formatTime = (value: Date) => value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const toTimeKey = (value: Date) => `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
const initialTarget = () => {
  const target = new Date(Date.now() + 5 * 60_000);
  target.setSeconds(0, 0);
  return target;
};

export function AddReminderModal({ visible, saving, onClose, onSave }: {
  visible: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (values: AddReminderValues) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(initialTarget);
  const [alertType, setAlertType] = useState<ReminderAlertType>('standard');
  const [pickerMode, setPickerMode] = useState<ReminderPickerMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setTarget(initialTarget());
    setAlertType('standard');
    setPickerMode(null);
    setError(null);
  }, [visible]);

  const submit = async () => {
    const trimmedTitle = title.trim();
    const date = toDateKey(target);
    const time = toTimeKey(target);
    if (!trimmedTitle) {
      setError('Name what this reminder is for.');
      return;
    }
    const parsed = scheduledAlertDate(date, time);
    if (!parsed || parsed.getTime() <= Date.now()) {
      setError('Choose a reminder time in the future.');
      return;
    }
    setError(null);
    try {
      await onSave({ title: trimmedTitle, target_date: date, target_time: time, alert_type: alertType });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the reminder.');
    }
  };

  const changePart = (picked: Date) => {
    setTarget((current) => {
      const next = new Date(current);
      if (pickerMode === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      return next;
    });
  };

  return <AppModal visible={visible} onClose={() => { if (!saving) onClose(); }} sheetStyle={styles.sheet}>
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>NEW REMINDER</Text>
        <Text style={[styles.title, { color: colors.text }]}>What should we remember?</Text>
      </View>
      <FormInput
        accessibilityLabel="Reminder title"
        value={title}
        onChangeText={setTitle}
        placeholder="Medicine, assignment, important call…"
        maxLength={200}
        autoFocus
        returnKeyType="done"
      />

      <Text style={[styles.label, { color: colors.textMuted }]}>WHEN</Text>
      <View style={styles.dateTimeRow}>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Choose reminder date"
          onPress={() => setPickerMode((current) => current === 'date' ? null : 'date')}
          style={[styles.dateTimeCard, { backgroundColor: colors.card, borderColor: pickerMode === 'date' ? colors.accent : colors.border }]}
        >
          <CalendarDays size={19} color={colors.accent} />
          <View style={styles.dateTimeCopy}><Text style={[styles.dateTimeLabel, { color: colors.textMuted }]}>Date</Text><Text style={[styles.dateTimeValue, { color: colors.text }]}>{formatDate(target)}</Text></View>
        </AnimatedPressable>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Choose reminder time"
          onPress={() => setPickerMode((current) => current === 'time' ? null : 'time')}
          style={[styles.dateTimeCard, { backgroundColor: colors.card, borderColor: pickerMode === 'time' ? colors.accent : colors.border }]}
        >
          <Clock3 size={19} color={colors.accent} />
          <View style={styles.dateTimeCopy}><Text style={[styles.dateTimeLabel, { color: colors.textMuted }]}>Time</Text><Text style={[styles.dateTimeValue, { color: colors.text }]}>{formatTime(target)}</Text></View>
        </AnimatedPressable>
      </View>
      {pickerMode && <View style={[styles.picker, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ReminderDateTimePicker value={target} mode={pickerMode} minimumDate={new Date()} onSelect={changePart} onDismiss={() => setPickerMode(null)} />
      </View>}

      <View style={styles.alertSection}>
        <Text style={[styles.label, { color: colors.textMuted }]}>ALERT STYLE</Text>
        <SlidingSegmentedControl value={alertType} options={alertOptions} onChange={setAlertType} />
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {alertType === 'silent' && 'Appears quietly without sound or vibration.'}
          {alertType === 'standard' && 'Uses your normal notification sound and vibration settings.'}
          {alertType === 'alarm' && 'Uses the strongest available sound and vibration. Device DND settings may still apply.'}
        </Text>
      </View>

      {error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>{error}</Text>}
      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" disabled={saving} onPress={onClose} style={styles.action} />
        <Button label="Save Reminder" icon={Bell} loading={saving} onPress={() => void submit()} style={styles.actionWide} />
      </View>
    </ScrollView>
  </AppModal>;
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '94%' }, scroll: { flexShrink: 1 }, content: { flexGrow: 1, gap: 16, paddingBottom: 8 }, eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, title: { marginTop: 3, fontSize: 24, fontWeight: '900' }, label: { fontSize: 10, fontWeight: '900', letterSpacing: 1 }, dateTimeRow: { flexDirection: 'row', gap: 9 }, dateTimeCard: { flex: 1, minHeight: 70, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9 }, dateTimeCopy: { flex: 1 }, dateTimeLabel: { fontSize: 10, fontWeight: '700' }, dateTimeValue: { marginTop: 3, fontSize: 12, fontWeight: '800' }, picker: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden', padding: 6 }, alertSection: { gap: 9 }, hint: { minHeight: 30, fontSize: 11, lineHeight: 15 }, error: { fontSize: 12, fontWeight: '700' }, actions: { flexDirection: 'row', gap: 9 }, action: { flex: 0.75 }, actionWide: { flex: 1.25 },
});
