import { RotateCcw, X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MatrixBoard } from '@/components/matrix/MatrixBoard';
import { CompactTaskRow } from '@/components/tasks/CompactTaskRow';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Screen } from '@/components/ui/Screen';
import { priorityLabels } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useTasks } from '@/hooks/useTasks';
import { useCompletionFeedback } from '@/hooks/useCompletionFeedback';
import type { TaskPriority, TaskWithSubtasks } from '@/types/database';
import { toDateKey } from '@/utils/dates';

export default function MatrixScreen() {
  const router = useRouter(); const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const { colors } = useTheme(); const { tasks, toggleTask, changePriority, renameTask } = useTasks(toDateKey(new Date())); const playCompletionFeedback = useCompletionFeedback(); const [undoTask, setUndoTask] = useState<TaskWithSubtasks | null>(null); const [expandedPriority, setExpandedPriority] = useState<TaskPriority | null>(null);
  useEffect(() => { if (!undoTask) return; const timeout = setTimeout(() => setUndoTask(null), 3000); return () => clearTimeout(timeout); }, [undoTask]);
  useEffect(() => {
    if (!taskId || tasks.length === 0) return;
    const selected = tasks.find((task) => task.id === taskId && !task.is_completed);
    if (selected) setExpandedPriority(selected.priority);
    router.setParams({ taskId: undefined });
  }, [router, taskId, tasks]);
  const complete = async (task: TaskWithSubtasks) => { playCompletionFeedback(); await toggleTask(task); setUndoTask(task); };
  const expandedTasks = expandedPriority ? tasks.filter((task) => !task.is_completed && task.priority === expandedPriority) : [];
  return <Screen contentStyle={styles.screen}><Text style={[styles.title, { color: colors.text }]}>Eisenhower Matrix</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>Drag with touch or mouse to reprioritize.</Text>
    <MatrixBoard tasks={tasks.filter((task) => !task.is_completed)} onComplete={(task) => void complete(task)} onMove={(task, priority) => void changePriority(task, priority)} onRename={(task, title) => renameTask(task, title)} onOpenQuadrant={setExpandedPriority} />
    {undoTask && !expandedPriority && <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.toast, { backgroundColor: colors.cardElevated, borderColor: colors.border }]}><Text style={[styles.toastText, { color: colors.text }]}>Good job!</Text><AnimatedPressable onPress={() => { void toggleTask({ ...undoTask, is_completed: true }); setUndoTask(null); }} style={styles.undo}><RotateCcw size={14} color={colors.accent} /><Text style={{ color: colors.accent, fontWeight: '700' }}>Undo</Text></AnimatedPressable></Animated.View>}
    <Modal visible={Boolean(expandedPriority)} animationType="slide" onRequestClose={() => setExpandedPriority(null)}><SafeAreaView style={[styles.expandedScreen, { backgroundColor: colors.background }]}><View style={[styles.expandedHeader, { borderBottomColor: colors.border }]}><View><Text style={[styles.expandedTitle, { color: colors.text }]}>{expandedPriority ? priorityLabels[expandedPriority] : ''}</Text><Text style={[styles.expandedCount, { color: colors.textMuted }]}>{expandedTasks.length} tasks</Text></View><AnimatedPressable accessibilityLabel="Close quadrant" onPress={() => setExpandedPriority(null)} style={[styles.close, { backgroundColor: colors.card }]}><X size={22} color={colors.text} /></AnimatedPressable></View><ScrollView contentContainerStyle={styles.expandedList}>{expandedTasks.map((task) => <CompactTaskRow key={task.id} task={task} onToggle={() => void complete(task)} onRename={(title) => renameTask(task, title)} showColorDot={false} showDate={false} />)}{expandedTasks.length === 0 && <Text style={[styles.expandedEmpty, { color: colors.textMuted }]}>No tasks in this quadrant.</Text>}</ScrollView>{undoTask && <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.expandedToast, { backgroundColor: colors.cardElevated, borderColor: colors.border }]}><Text style={[styles.toastText, { color: colors.text }]}>Good job!</Text><AnimatedPressable onPress={() => { void toggleTask({ ...undoTask, is_completed: true }); setUndoTask(null); }} style={styles.undo}><RotateCcw size={14} color={colors.accent} /><Text style={{ color: colors.accent, fontWeight: '700' }}>Undo</Text></AnimatedPressable></Animated.View>}</SafeAreaView></Modal>
  </Screen>;
}
const styles = StyleSheet.create({ screen: { paddingTop: 16, paddingBottom: 98, gap: 4 }, title: { fontSize: 26, fontWeight: '800' }, subtitle: { fontSize: 11, marginBottom: 8 }, toast: { position: 'absolute', left: 20, right: 20, bottom: 105, minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } }, expandedToast: { position: 'absolute', left: 20, right: 20, bottom: 24, minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } }, toastText: { flex: 1, fontWeight: '600' }, undo: { flexDirection: 'row', alignItems: 'center', gap: 5 }, expandedScreen: { flex: 1 }, expandedHeader: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, expandedTitle: { fontSize: 24, fontWeight: '800' }, expandedCount: { fontSize: 11, marginTop: 2 }, close: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, expandedList: { paddingHorizontal: 20, paddingBottom: 84 }, expandedEmpty: { textAlign: 'center', paddingVertical: 48 } });
