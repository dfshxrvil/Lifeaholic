import { ChevronRight } from 'lucide-react-native';
import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { DateTag } from '@/components/tasks/DateTag';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Checkbox } from '@/components/ui/Checkbox';
import { priorityColors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { TaskWithSubtasks } from '@/types/database';

export const CompactTaskRow = memo(function CompactTaskRow({ task, onToggle, onOpen, onRename, dragHandle, showColorDot = true, showDate = true }: { task: TaskWithSubtasks; onToggle: () => void; onOpen?: () => void; onRename?: (title: string) => void | Promise<void>; dragHandle?: React.ReactNode; showColorDot?: boolean; showDate?: boolean }) {
  const { colors } = useTheme(); const completedSubtasks = task.subtasks.filter((item) => item.is_completed).length; const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(task.title); const editingRef = useRef(false);
  useEffect(() => { if (!editing) setDraft(task.title); }, [task.title, editing]);
  const commit = async () => { if (!editingRef.current) return; editingRef.current = false; setEditing(false); const title = draft.trim(); if (!title) { setDraft(task.title); return; } try { await onRename?.(title); } catch { setDraft(task.title); } };
  return <View style={[styles.row, { borderBottomColor: colors.border }]}> 
    <Checkbox checked={task.is_completed} onPress={onToggle} label={`Mark ${task.title} ${task.is_completed ? 'incomplete' : 'complete'}`} compact />
    <View style={styles.body}><View style={styles.titleRow}>{showColorDot && <View style={[styles.dot, { backgroundColor: priorityColors[task.priority] }]} />}{editing ? <TextInput autoFocus selectTextOnFocus returnKeyType="done" value={draft} onChangeText={setDraft} onBlur={() => void commit()} onSubmitEditing={() => void commit()} style={[styles.titleInput, { color: colors.text, borderBottomColor: colors.accent }]} /> : <AnimatedPressable disabled={!onRename} onPress={() => { editingRef.current = true; setEditing(true); }} style={styles.titlePress}><Text numberOfLines={1} style={[styles.title, { color: task.is_completed ? colors.textMuted : colors.text, opacity: task.is_completed ? 0.58 : 1, fontWeight: task.is_completed ? '400' : '600', textDecorationLine: task.is_completed ? 'line-through' : 'none' }]}>{task.title}</Text></AnimatedPressable>}{showDate && <DateTag date={task.original_date ?? task.date} />}</View>{(task.description || task.subtasks.length > 0) && <AnimatedPressable disabled={!onOpen} onPress={onOpen}><Text numberOfLines={1} style={[styles.meta, { color: colors.textMuted }]}>{task.subtasks.length ? `${completedSubtasks}/${task.subtasks.length} subtasks` : task.description}</Text></AnimatedPressable>}</View>{dragHandle}{onOpen && <AnimatedPressable accessibilityLabel={`Open ${task.title} subtasks`} onPress={onOpen} hitSlop={8}><ChevronRight size={13} color={colors.textMuted} /></AnimatedPressable>}
  </View>;
});

const styles = StyleSheet.create({ row: { minHeight: 38, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 8 }, body: { flex: 1, minHeight: 29, justifyContent: 'center' }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, titlePress: { flex: 1, minWidth: 0 }, titleInput: { flex: 1, minWidth: 0, height: 24, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 0, paddingVertical: 0, fontSize: 12, lineHeight: 15, fontWeight: '600' }, dot: { width: 5, height: 5, borderRadius: 3 }, title: { fontSize: 12, lineHeight: 15, fontWeight: '600' }, meta: { fontSize: 9, marginTop: 2, marginLeft: 11 } });
