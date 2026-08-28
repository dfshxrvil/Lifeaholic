import { CheckCircle2, Plus, RefreshCw, Settings } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { WhatsNext } from '@/components/home/WhatsNext';
import { DDayWidget } from '@/components/home/DDayWidget';
import { useFloatingTabBarMetrics } from '@/components/navigation/FloatingTabBar';
import { AddTaskModal } from '@/components/tasks/AddTaskModal';
import { CalendarBar } from '@/components/tasks/DateSelector';
import { SubtaskModal } from '@/components/tasks/SubtaskModal';
import { TaskCard } from '@/components/tasks/TaskCard';
import { UndoToast } from '@/components/tasks/UndoToast';
import { AppModal } from '@/components/ui/AppModal';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Button } from '@/components/ui/Button';
import { FormInput } from '@/components/ui/FormInput';
import { Screen } from '@/components/ui/Screen';
import { collapseOut } from '@/constants/animations';
import { motion, typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useCalendar } from '@/contexts/CalendarContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTasks } from '@/hooks/useTasks';
import { useScrollBoundaryHaptics } from '@/hooks/useScrollBoundaryHaptics';
import { useCompletionFeedback } from '@/hooks/useCompletionFeedback';
import { listDDayEvents, saveDDayEvent } from '@/services/dDayEvents';
import { notifyWidgetDataChanged } from '@/services/widgetDataEvents';
import type { DDayEvent, TaskWithSubtasks } from '@/types/database';
import { toDateKey } from '@/utils/dates';

const UNDO_DURATION = 3000;
export default function HomeScreen() {
  const router = useRouter(); const { compose, taskId } = useLocalSearchParams<{ compose?: string; taskId?: string }>(); const insets = useSafeAreaInsets(); const { colors } = useTheme(); const { user } = useAuth(); const { loading: calendarLoading, refresh: refreshCalendar } = useCalendar();
  const reduceMotion = useReducedMotion();
  const { actionBottom, contentBottom } = useFloatingTabBarMetrics();
  const { width: screenWidth } = useWindowDimensions();
  const [date, setDate] = useState(toDateKey(new Date())); const [addOpen, setAddOpen] = useState(false); const [finishedOpen, setFinishedOpen] = useState(false); const [activeTask, setActiveTask] = useState<TaskWithSubtasks | null>(null); const [dDays, setDDays] = useState<DDayEvent[]>([]); const [dDaysLoaded, setDDaysLoaded] = useState(false); const [dDayOpen, setDDayOpen] = useState(false); const [dDayTitle, setDDayTitle] = useState(''); const [dDayDate, setDDayDate] = useState(''); const [dDaySaving, setDDaySaving] = useState(false); const [dDayError, setDDayError] = useState<string | null>(null); const [undoQueue, setUndoQueue] = useState<TaskWithSubtasks[]>([]); const [actionError, setActionError] = useState<string | null>(null); const [refreshingHome, setRefreshingHome] = useState(false);
  const playCompletionFeedback = useCompletionFeedback(); const { tasks, loading, error, addTask, setTaskCompletion, renameTask, refresh } = useTasks(date, { refreshOnMount: false });
  const scrollHaptics = useScrollBoundaryHaptics();
  const refreshHome = useCallback(async (showIndicator = false) => { if (showIndicator) setRefreshingHome(true); try { const dDayRefresh = user ? listDDayEvents(user.id).then(setDDays).finally(() => setDDaysLoaded(true)) : Promise.resolve().then(() => { setDDays([]); setDDaysLoaded(true); }); await Promise.allSettled([refresh(), refreshCalendar(), dDayRefresh]); } finally { if (showIndicator) setRefreshingHome(false); } }, [refresh, refreshCalendar, user]);
  useFocusEffect(useCallback(() => { void refreshHome(false); }, [refreshHome]));
  const currentUndo = undoQueue[0]; useEffect(() => { if (!currentUndo) return; const timer = setTimeout(() => setUndoQueue((current) => current.slice(1)), UNDO_DURATION); return () => clearTimeout(timer); }, [currentUndo]);
  const active = useMemo(() => tasks.filter((task) => !task.is_completed), [tasks]); const finished = useMemo(() => tasks.filter((task) => task.is_completed), [tasks]); const now = new Date(); const taskProgress = tasks.length ? finished.length / tasks.length : 0;
  const todayLabel = now.toLocaleDateString(undefined, { weekday: screenWidth < 370 ? 'short' : 'long', day: 'numeric', month: 'short' });
  const completeTask = async (task: TaskWithSubtasks) => { setActionError(null); playCompletionFeedback(); setUndoQueue((current) => current.some((item) => item.id === task.id) ? current : [...current, task]); try { await setTaskCompletion(task, true); } catch (cause) { setUndoQueue((current) => current.filter((item) => item.id !== task.id)); setActionError(cause instanceof Error ? cause.message : 'Could not complete that task.'); } };
  const restore = async (task: TaskWithSubtasks) => { try { await setTaskCompletion(task, false); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Could not restore that task.'); } };
  const openDDay = useCallback(() => { const event = dDays.find((item) => item.slot === 1); setDDayTitle(event?.title ?? ''); setDDayDate(event?.event_date ?? ''); setDDayError(null); setDDayOpen(true); }, [dDays]);
  useEffect(() => {
    if (compose !== 'd-day' || !dDaysLoaded) return;
    openDDay();
    router.setParams({ compose: undefined });
  }, [compose, dDaysLoaded, openDDay, router]);
  useEffect(() => {
    if (!taskId || loading) return;
    const selected = tasks.find((task) => task.id === taskId);
    if (selected) setActiveTask(selected);
    router.setParams({ taskId: undefined });
  }, [loading, router, taskId, tasks]);
  const saveDDay = async () => { if (!user || !dDayTitle.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(dDayDate)) { setDDayError('Enter an event name and date in YYYY-MM-DD format.'); return; } setDDaySaving(true); setDDayError(null); try { const event = await saveDDayEvent(user.id, 1, dDayTitle, dDayDate); setDDays((current) => [event, ...current.filter((item) => item.slot !== 1)]); notifyWidgetDataChanged(); setDDayOpen(false); } catch (cause) { setDDayError(cause instanceof Error ? cause.message : 'Unable to save event.'); } finally { setDDaySaving(false); } };
  const empty = loading ? <ActivityIndicator color={colors.accent} style={styles.empty} /> : <View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text }]}>You’re all clear</Text><Text style={[styles.emptyText, { color: colors.textMuted }]}>{error ?? 'Add a task or enjoy the open space.'}</Text></View>;
  return <Screen contentStyle={styles.screen}> 
    <FlatList data={active} keyExtractor={(task) => task.id} renderItem={({ item, index }) => <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(Math.min(index, 10) * motion.stagger).duration(220)} exiting={reduceMotion ? undefined : collapseOut} layout={reduceMotion ? undefined : LinearTransition.springify().damping(18)}><TaskCard task={item} onToggle={() => void completeTask(item)} onOpen={() => setActiveTask(item)} onRename={(title) => renameTask(item, title)} /></Animated.View>} ListHeaderComponent={<View style={styles.pageHeader}><View style={styles.header}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[styles.date, { color: colors.text }]}>{todayLabel}</Text><View style={styles.headerControls}><DDayWidget slot={1} event={dDays.find((item) => item.slot === 1)} onPress={openDDay} /><AnimatedPressable accessibilityLabel="Settings" onPress={() => router.push('/settings')} style={[styles.settings, { backgroundColor: colors.card, borderColor: colors.border }]}><Settings color={colors.text} size={20} /></AnimatedPressable></View></View><WhatsNext /><View style={styles.taskHeader}><View><Text style={[styles.sectionTitle, { color: colors.text }]}>Tasks</Text><Text style={[styles.taskMeta, { color: colors.textMuted }]}>{finished.length} of {tasks.length} completed</Text></View><AnimatedPressable onPress={() => setFinishedOpen(true)} style={styles.finished}><CheckCircle2 size={17} color={colors.success} /><Text style={[styles.finishedText, { color: colors.textMuted }]}>Finished</Text></AnimatedPressable></View><CalendarBar selected={date} onSelect={setDate} scrollable /><View accessibilityLabel={`${finished.length} of ${tasks.length} daily tasks completed`} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: tasks.length, now: finished.length }} style={[styles.progressTrack, { backgroundColor: colors.border }]}><View style={[styles.progressFill, { width: `${taskProgress * 100}%`, backgroundColor: colors.accent }]} /></View>{actionError && <Text style={[styles.error, { color: colors.danger }]}>{actionError}</Text>}</View>} ListEmptyComponent={empty} contentContainerStyle={[styles.pageContent, { paddingBottom: contentBottom + 16 }]} showsVerticalScrollIndicator={false} bounces alwaysBounceVertical onScrollBeginDrag={scrollHaptics.onScrollBeginDrag} onScroll={scrollHaptics.onScroll} scrollEventThrottle={16} />
    <AnimatedPressable accessibilityRole="button" accessibilityLabel="Refresh Home" disabled={refreshingHome || loading || calendarLoading} onPress={() => { scrollHaptics.refreshImpact(); void refreshHome(true); }} style={[styles.refreshButton, { bottom: actionBottom + 5, backgroundColor: colors.card, borderColor: colors.border, opacity: refreshingHome || loading || calendarLoading ? 0.7 : 1 }]}>{refreshingHome || loading || calendarLoading ? <ActivityIndicator size="small" color={colors.accent} /> : <RefreshCw size={18} color={colors.accent} />}</AnimatedPressable>
    <AnimatedPressable accessibilityLabel="Add task" onPress={() => setAddOpen(true)} style={[styles.fab, { bottom: actionBottom, backgroundColor: colors.accent }]}><Plus color={colors.buttonText} size={25} /></AnimatedPressable>
    <UndoToast visible={Boolean(currentUndo)} taskTitle={currentUndo?.title} bottom={Math.max(98, insets.bottom + 91)} onUndo={() => { if (!currentUndo) return; setUndoQueue((items) => items.slice(1)); void restore({ ...currentUndo, is_completed: true }); }} />
    <AddTaskModal visible={addOpen} date={date} onClose={() => setAddOpen(false)} onAdd={addTask} /><SubtaskModal task={activeTask} onClose={() => setActiveTask(null)} />
    <AppModal visible={finishedOpen} onClose={() => setFinishedOpen(false)}><View style={styles.sheet}><Text style={[styles.sheetTitle, { color: colors.text }]}>Finished tasks</Text>{finished.length ? finished.map((task) => <TaskCard key={task.id} task={task} onToggle={() => void restore(task)} onRename={(title) => renameTask(task, title)} />) : <Text style={{ color: colors.textMuted }}>Completed tasks for this day appear here.</Text>}</View></AppModal>
    <AppModal visible={dDayOpen} onClose={() => setDDayOpen(false)}><View style={styles.sheet}><Text style={[styles.sheetTitle, { color: colors.text }]}>D-Day event</Text><FormInput accessibilityLabel="D-Day event name" value={dDayTitle} onChangeText={setDDayTitle} placeholder="Exam, launch, graduation…" autoFocus /><FormInput accessibilityLabel="D-Day target date" value={dDayDate} onChangeText={setDDayDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />{dDayError && <Text style={{ color: colors.danger, fontSize: 11 }}>{dDayError}</Text>}<Button label="Save event" loading={dDaySaving} onPress={() => void saveDDay()} /></View></AppModal>
  </Screen>;
}

const styles = StyleSheet.create({ screen: { minHeight: 0 }, pageContent: { flexGrow: 1 }, pageHeader: { paddingTop: 12, paddingBottom: 4, gap: 11 }, header: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }, date: { flex: 1, minWidth: 0, fontSize: 22, fontWeight: '700' }, headerControls: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }, settings: { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }, taskHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }, sectionTitle: { fontSize: typography.heading, fontWeight: '700' }, taskMeta: { fontSize: 10, marginTop: 2 }, finished: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 8 }, finishedText: { fontSize: 11, fontWeight: '700' }, progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 2 }, empty: { flex: 1, paddingVertical: 32, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { fontSize: 18, fontWeight: '700' }, emptyText: { fontSize: 11, marginTop: 4 }, error: { fontSize: 10 }, refreshButton: { position: 'absolute', left: 22, width: 42, height: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 }, fab: { position: 'absolute', right: 22, bottom: 98, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }, sheet: { gap: 4 }, sheetTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8 } });
