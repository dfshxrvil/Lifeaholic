import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { priorityColors, priorityLabels } from '@/constants/theme';
import type { TaskPriority } from '@/types/database';
import { AppModal } from '@/components/ui/AppModal';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Button } from '@/components/ui/Button';
import { FormInput } from '@/components/ui/FormInput';
import { ValidationFeedback } from '@/components/ui/ValidationFeedback';

export function AddTaskModal({ visible, date, onClose, onAdd }: { visible: boolean; date: string; onClose: () => void; onAdd: (title: string, description: string | undefined, priority: TaskPriority) => Promise<void> }) {
  const { colors } = useTheme(); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [priority, setPriority] = useState<TaskPriority>('red'); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [errorPulse, setErrorPulse] = useState(0); const fail = (message: string) => { setError(message); setErrorPulse((current) => current + 1); };
  useEffect(() => { if (visible) { setTitle(''); setDescription(''); setPriority('red'); setError(null); } }, [visible]);
  const submit = async () => { if (!title.trim()) { fail('Give your task a title.'); return; } setLoading(true); setError(null); try { await onAdd(title.trim(), description.trim() || undefined, priority); onClose(); } catch (cause) { fail(cause instanceof Error ? cause.message : 'Unable to create task.'); } finally { setLoading(false); } };
  return <AppModal visible={visible} onClose={onClose}><ValidationFeedback trigger={errorPulse}><View style={styles.content}>
    <View><Text style={[styles.title, { color: colors.text }]}>New task</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text></View>
    <FormInput accessibilityLabel="Task title" placeholder="What needs to get done?" value={title} onChangeText={setTitle} autoFocus returnKeyType="next" />
    <FormInput accessibilityLabel="Description (optional)" placeholder="Add some details" value={description} onChangeText={setDescription} multiline style={styles.description} />
    <View style={styles.priorities}>{(['red','yellow','blue','green'] as TaskPriority[]).map((value) => <AnimatedPressable key={value} onPress={() => setPriority(value)} style={[styles.priority, { backgroundColor: priority === value ? priorityColors[value] : colors.card, borderColor: priorityColors[value] }]}><Text style={{ color: priority === value ? '#000' : colors.text, fontSize: 10, fontWeight: '900' }}>{priorityLabels[value]}</Text></AnimatedPressable>)}</View>
    {error && <Text style={{ color: colors.danger }}>{error}</Text>}
    <View style={styles.actions}><Button label="Cancel" variant="secondary" onPress={onClose} style={styles.action} /><Button label="Add task" onPress={() => void submit()} loading={loading} style={styles.action} /></View>
  </View></ValidationFeedback></AppModal>;
}

const styles = StyleSheet.create({ content: { gap: 16 }, title: { fontSize: 24, fontWeight: '800' }, subtitle: { marginTop: 4 }, description: { minHeight: 80, paddingTop: 15, textAlignVertical: 'top' }, priorities: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, priority: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, overflow: 'hidden' }, actions: { flexDirection: 'row', gap: 10 }, action: { flex: 1 } });
