import { Bell, CalendarDays, Clock3, Infinity as InfinityIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '@/components/ui/AppModal';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Button } from '@/components/ui/Button';
import { FormInput } from '@/components/ui/FormInput';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';
import { ValidationFeedback } from '@/components/ui/ValidationFeedback';
import { priorityColors, priorityLabels } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { Task, TaskPriority } from '@/types/database';
import { toDateKey } from '@/utils/dates';
import TaskDateTimePicker, { TaskPickerMode } from './TaskDateTimePicker';

export type TaskFormValues = {
  title: string;
  description: string | undefined;
  priority: TaskPriority;
  date: string;
  task_time: string | null;
  reminder_offset: number | null;
};

const timingOptions = [
  { value: 'allDay' as const, label: 'All Day', icon: InfinityIcon },
  { value: 'timed' as const, label: 'Timed', icon: Clock3 },
];
const reminderOptions: { value: number | null; label: string }[] = [
  { value: null, label: 'None' }, { value: 0, label: 'At time' }, { value: 15, label: '15 min' }, { value: 60, label: '1 hour' },
];
const timeKey = (value: Date) => `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;

export function AddTaskModal({ visible, date, onClose, onSave, task }: {
  task?: Task | null;
  visible: boolean;
  date: string;
  onClose: () => void;
  onSave: (values: TaskFormValues) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('red');
  const [taskDate, setTaskDate] = useState(date);
  const [taskTime, setTaskTime] = useState<string | null>(null);
  const [reminderOffset, setReminderOffset] = useState<number | null>(null);
  const [pickerMode, setPickerMode] = useState<TaskPickerMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorPulse, setErrorPulse] = useState(0);
  const fail = (message: string) => { setError(message); setErrorPulse((current) => current + 1); };

  useEffect(() => {
    if (!visible) return;
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setPriority(task?.priority ?? 'red');
    setTaskDate(task?.date ?? date);
    setTaskTime(task?.task_time?.slice(0, 5) ?? null);
    setReminderOffset(task?.reminder_offset ?? null);
    setPickerMode(null);
    setError(null);
  }, [visible, task, date]);

  const selectedDateTime = new Date(`${taskDate}T${taskTime ?? '09:00'}:00`);
  const submit = async () => {
    if (!title.trim()) { fail('Give your task a title.'); return; }
    setLoading(true); setError(null);
    try {
      await onSave({ title: title.trim(), description: description.trim() || undefined, priority, date: taskDate, task_time: taskTime, reminder_offset: taskTime ? reminderOffset : null });
      onClose();
    } catch (cause) { fail(cause instanceof Error ? cause.message : 'Unable to save task.'); }
    finally { setLoading(false); }
  };
  const selectPickerValue = (selected: Date) => {
    if (pickerMode === 'date') setTaskDate(toDateKey(selected));
    else setTaskTime(timeKey(selected));
  };

  return <AppModal visible={visible} onClose={() => { if (!loading) onClose(); }} sheetStyle={styles.sheet}>
    <ValidationFeedback trigger={errorPulse}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View><Text style={[styles.title, { color: colors.text }]}>{task ? 'Edit task' : 'New task'}</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>{new Date(`${taskDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text></View>
      <FormInput accessibilityLabel="Task title" placeholder="What needs to get done?" value={title} onChangeText={setTitle} autoFocus returnKeyType="next" />
      <FormInput accessibilityLabel="Description (optional)" placeholder="Add some details" value={description} onChangeText={setDescription} multiline style={styles.description} />

      {task && <View style={styles.group}><Text style={[styles.label, { color: colors.textMuted }]}>TASK DATE</Text><AnimatedPressable accessibilityRole="button" accessibilityLabel="Change task date" onPress={() => setPickerMode((current) => current === 'date' ? null : 'date')} style={[styles.selectorCard, { backgroundColor: colors.card, borderColor: pickerMode === 'date' ? colors.accent : colors.border }]}><CalendarDays size={18} color={colors.accent} /><Text style={[styles.selectorText, { color: colors.text }]}>{new Date(`${taskDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text></AnimatedPressable></View>}

      <View style={styles.group}><Text style={[styles.label, { color: colors.textMuted }]}>WHEN</Text><SlidingSegmentedControl value={taskTime ? 'timed' : 'allDay'} options={timingOptions} onChange={(value) => { if (value === 'allDay') { setTaskTime(null); setReminderOffset(null); setPickerMode(null); } else { setTaskTime(taskTime ?? '09:00'); setPickerMode('time'); } }} />
        {taskTime && <AnimatedPressable accessibilityRole="button" accessibilityLabel="Change task time" onPress={() => setPickerMode((current) => current === 'time' ? null : 'time')} style={[styles.selectorCard, { backgroundColor: colors.card, borderColor: pickerMode === 'time' ? colors.accent : colors.border }]}><Clock3 size={18} color={colors.accent} /><Text style={[styles.selectorText, { color: colors.text }]}>{selectedDateTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text></AnimatedPressable>}
      </View>
      {pickerMode && <View style={[styles.picker, { backgroundColor: colors.card, borderColor: colors.border }]}><TaskDateTimePicker value={selectedDateTime} mode={pickerMode} onSelect={selectPickerValue} onDismiss={() => setPickerMode(null)} /></View>}

      {taskTime && <View style={styles.group}><Text style={[styles.label, { color: colors.textMuted }]}>REMIND ME</Text><View style={styles.reminders}>{reminderOptions.map((option) => <AnimatedPressable key={option.label} accessibilityRole="radio" accessibilityState={{ selected: reminderOffset === option.value }} onPress={() => setReminderOffset(option.value)} style={[styles.reminder, { backgroundColor: reminderOffset === option.value ? colors.accentSoft : colors.card, borderColor: reminderOffset === option.value ? colors.accent : colors.border }]}>{option.value !== null && <Bell size={12} color={reminderOffset === option.value ? colors.accent : colors.textMuted} />}<Text style={[styles.reminderText, { color: reminderOffset === option.value ? colors.accent : colors.text }]}>{option.label}</Text></AnimatedPressable>)}</View></View>}

      <View style={styles.group}><Text style={[styles.label, { color: colors.textMuted }]}>PRIORITY</Text><View style={styles.priorities}>{(['red','yellow','blue','green'] as TaskPriority[]).map((value) => <AnimatedPressable key={value} onPress={() => setPriority(value)} style={[styles.priority, { backgroundColor: priority === value ? priorityColors[value] : colors.card, borderColor: priorityColors[value] }]}><Text style={{ color: priority === value ? '#000' : colors.text, fontSize: 10, fontWeight: '900' }}>{priorityLabels[value]}</Text></AnimatedPressable>)}</View></View>
      {error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
      <View style={styles.actions}><Button label="Cancel" variant="secondary" disabled={loading} onPress={onClose} style={styles.action} /><Button label={task ? 'Save changes' : 'Add task'} onPress={() => void submit()} loading={loading} style={styles.action} /></View>
    </ScrollView></ValidationFeedback>
  </AppModal>;
}

const styles = StyleSheet.create({ sheet: { maxHeight: '94%' }, content: { gap: 15, paddingBottom: 5 }, title: { fontSize: 24, fontWeight: '800' }, subtitle: { marginTop: 4 }, description: { minHeight: 70, paddingTop: 15, textAlignVertical: 'top' }, group: { gap: 8 }, label: { fontSize: 10, fontWeight: '900', letterSpacing: 1 }, selectorCard: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }, selectorText: { fontSize: 13, fontWeight: '800' }, picker: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden', padding: 5 }, reminders: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, reminder: { minHeight: 36, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 }, reminderText: { fontSize: 10, fontWeight: '800' }, priorities: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, priority: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, overflow: 'hidden' }, actions: { flexDirection: 'row', gap: 10 }, action: { flex: 1 } });
