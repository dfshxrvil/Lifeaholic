import { PropsWithChildren, useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useCalendar } from '@/contexts/CalendarContext';
import { listDDayEvents } from '@/services/dDayEvents';
import * as focusService from '@/services/focus';
import { subscribeTasksChanged } from '@/services/taskEvents';
import * as tasksService from '@/services/tasks';
import { subscribeWidgetDataChanged } from '@/services/widgetDataEvents';
import { reloadAllWidgets } from '@/services/widgetReload';
import {
  acknowledgeWidgetActions,
  readWidgetSnapshot,
  updateWidgetContent,
} from '@/services/widgetSuite';
import { toDateKey } from '@/utils/dates';

const subjectColors = ['#6366F1', '#14B8A6', '#F59E0B', '#EC4899', '#3B82F6', '#8B5CF6', '#22C55E'];

export function WidgetSyncProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const calendar = useCalendar();
  const syncing = useRef(false);
  const rerun = useRef(false);

  const synchronize = useCallback(async () => {
    if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || !user) return;
    if (syncing.current) { rerun.current = true; return; }
    syncing.current = true;
    try {
      const shared = await readWidgetSnapshot();
      const completedActionIds: string[] = [];
      for (const action of shared?.pendingActions ?? []) {
        try {
          if (action.type === 'completeTask' && action.taskId) {
            await tasksService.setTaskCompleted(action.taskId, true);
          } else if (
            action.type === 'saveFocusSession' && action.subjectId &&
            Number.isFinite(action.startedAt) && Number.isFinite(action.endedAt) &&
            action.endedAt! > action.startedAt! && action.endedAt! - action.startedAt! <= 86_400
          ) {
            await focusService.saveSession(
              user.id,
              action.subjectId,
              new Date(action.startedAt! * 1000),
              new Date(action.endedAt! * 1000),
            );
          }
          completedActionIds.push(action.id);
        } catch {
          // Keep failed actions durable for the next foreground/network retry.
        }
      }
      await acknowledgeWidgetActions(completedActionIds);

      const now = new Date();
      const today = toDateKey(now);
      const [tasks, dDays, subjects, sessions] = await Promise.all([
        tasksService.listTasks(user.id, today),
        listDDayEvents(user.id),
        focusService.listSubjects(user.id),
        focusService.listSessions(user.id, today),
      ]);
      const subjectSeconds = new Map<string, number>();
      for (const session of sessions) {
        subjectSeconds.set(session.subject_id, (subjectSeconds.get(session.subject_id) ?? 0) + session.duration_seconds);
      }
      if (shared?.focus.mode === 'focus' && shared.focus.subjectId && shared.focus.startedAt) {
        const liveSeconds = Math.max(0, Math.floor(now.getTime() / 1000 - shared.focus.startedAt));
        subjectSeconds.set(shared.focus.subjectId, (subjectSeconds.get(shared.focus.subjectId) ?? 0) + liveSeconds);
      }
      const dDay = dDays.find((item) => item.slot === 1);
      const target = dDay ? new Date(`${dDay.event_date}T23:59:59`) : null;
      const events = calendar.events
        .filter((event) => !Number.isNaN(event.start.getTime()) && toDateKey(event.start) === today)
        .sort((left, right) => left.start.getTime() - right.start.getTime())
        .slice(0, 16)
        .map((event) => ({ id: event.id, title: event.title || 'Untitled event', startAt: event.start.getTime() / 1000, endAt: event.end.getTime() / 1000 }));

      await updateWidgetContent({
        tasks: tasks.filter((task) => !task.is_completed).slice(0, 32).map((task) => ({
          id: task.id, title: task.title.trim() || 'Untitled task', priority: task.priority, isCompleted: false,
        })),
        dDay: dDay && target && !Number.isNaN(target.getTime()) ? {
          title: dDay.title, eventDate: dDay.event_date,
          daysRemaining: Math.ceil((target.getTime() - now.getTime()) / 86_400_000),
        } : undefined,
        events,
        subjects: subjects.slice(0, 12).map((subject) => ({
          id: subject.id, name: subject.name, todaySeconds: subjectSeconds.get(subject.id) ?? 0,
        })),
        analytics: subjects.map((subject, index) => ({
          id: subject.id, name: subject.name, seconds: subjectSeconds.get(subject.id) ?? 0,
          colorHex: subjectColors[index % subjectColors.length] ?? '#6366F1',
        })).filter((item) => item.seconds > 0).slice(0, 12),
      });
      // updateSnapshot reloads the storage-only bridge kind. Explicitly reload
      // the visible native widget kinds after the new snapshot is committed.
      reloadAllWidgets();
    } catch {
      // Offline/database failures retain the last valid App Group snapshot and
      // durable pending actions for the next active-state retry.
    } finally {
      syncing.current = false;
      if (rerun.current) { rerun.current = false; void synchronize(); }
    }
  }, [calendar.events, user]);

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    void synchronize();
    const unsubscribeTasks = subscribeTasksChanged(() => void synchronize());
    const unsubscribeWidgets = subscribeWidgetDataChanged(() => void synchronize());
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void synchronize(); });
    const interval = setInterval(() => { if (AppState.currentState === 'active') void synchronize(); }, 60_000);
    return () => { unsubscribeTasks(); unsubscribeWidgets(); appState.remove(); clearInterval(interval); };
  }, [synchronize]);

  return children;
}
