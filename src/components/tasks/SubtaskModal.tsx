import { Plus, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppModal } from '@/components/ui/AppModal';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Checkbox } from '@/components/ui/Checkbox';
import { useTheme } from '@/contexts/ThemeContext';
import { createSubtask, listSubtasks, setSubtaskCompleted } from '@/services/tasks';
import type { Subtask, Task } from '@/types/database';

export function SubtaskModal({ task, onClose, focusInput = false }: { task: Task | null; onClose: () => void; focusInput?: boolean }) {
  const { colors } = useTheme(); const [items, setItems] = useState<Subtask[]>([]); const [title, setTitle] = useState(''); const [loading, setLoading] = useState(false); const [adding, setAdding] = useState(false); const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const taskId = task?.id;
  useEffect(() => {
    if (!taskId) return;
    let active = true;
    setTitle(''); setItems([]); setLoading(true); setError(null);
    listSubtasks(taskId).then((rows) => { if (active) setItems(rows); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load subtasks.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [taskId]);
  const add = async () => { if (!task || !title.trim() || adding || loading) return; setAdding(true); setError(null); try { const next = await createSubtask(task.id, title.trim()); setItems((current) => [...current, next]); setTitle(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to add subtask.'); } finally { setAdding(false); } };
  const toggle = async (item: Subtask) => { const next = !item.is_completed; setItems((current) => current.map((value) => value.id === item.id ? { ...value, is_completed: next } : value)); try { await setSubtaskCompleted(item.id, next); } catch { setItems((current) => current.map((value) => value.id === item.id ? item : value)); } };
  return <AppModal visible={Boolean(task)} onClose={() => { if (!adding) onClose(); }} onShow={() => { if (focusInput) inputRef.current?.focus(); }}><View style={styles.content}>
    <View style={styles.header}><View style={styles.headerCopy}><Text style={[styles.title, { color: colors.text }]}>{task?.title}</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>Break it into smaller wins</Text></View><AnimatedPressable accessibilityLabel="Close" disabled={adding} onPress={onClose}><X color={colors.textMuted} /></AnimatedPressable></View>
    <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listContent}>{loading && <ActivityIndicator color={colors.accent} />}{items.map((item) => <View key={item.id} style={[styles.row, { borderBottomColor: colors.border }]}><Checkbox checked={item.is_completed} onPress={() => void toggle(item)} label={item.title} compact /><Text style={[styles.item, { color: colors.text, opacity: item.is_completed ? 0.5 : 1, textDecorationLine: item.is_completed ? 'line-through' : 'none' }]}>{item.title}</Text></View>)}<View style={[styles.addRow, { borderBottomColor: colors.border }]}><Plus size={14} color={colors.textMuted} /><TextInput ref={inputRef} autoFocus={focusInput} accessibilityLabel="New subtask" placeholder="Add subtask..." placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle} onSubmitEditing={() => void add()} editable={!adding} returnKeyType="done" style={[styles.input, { color: colors.text }]} />{adding && <ActivityIndicator size="small" color={colors.accent} />}</View></ScrollView>
    {error && <Text style={{ color: colors.danger }}>{error}</Text>}
  </View></AppModal>;
}

const styles = StyleSheet.create({ content: { gap: 12 }, header: { flexDirection: 'row', alignItems: 'flex-start' }, headerCopy: { flex: 1 }, title: { fontSize: 22, fontWeight: '800' }, subtitle: { marginTop: 4, fontSize: 11 }, list: { maxHeight: 330 }, listContent: { minHeight: 80 }, row: { minHeight: 34, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 7 }, item: { flex: 1, fontSize: 11, fontWeight: '600' }, addRow: { minHeight: 34, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 7 }, input: { flex: 1, minWidth: 0, minHeight: 32, paddingVertical: 3, fontSize: 11 }, });
