import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCalendar } from '@/contexts/CalendarContext';
import * as habitsService from '@/services/habits';
import { notifyHabitCompletionChanged, subscribeHabitCompletionChanged } from '@/services/habitEvents';
import { removeHabitFromDeviceCalendar, syncHabitToDeviceCalendar } from '@/services/deviceCalendar';
import type { Habit, HabitInput, HabitLog, HabitWithLogs } from '@/types/database';
import { addDays, fromDateKey, toDateKey } from '@/utils/dates';

export function calculateHabitStreak(habit: Habit, logs: HabitLog[], referenceDate = new Date()) {
  const scheduledDays = new Set(habit.days_of_week);
  if (!scheduledDays.size) return 0;
  const sortedLogs = [...logs].sort((a, b) => a.completed_date.localeCompare(b.completed_date));
  const completed = new Set(sortedLogs.map((log) => log.completed_date));
  const today = new Date(referenceDate); today.setHours(0, 0, 0, 0);
  const createdKey = toDateKey(new Date(habit.created_at));
  let cursor = today;

  // An unfinished occurrence today is still in progress; anchor on the previous scheduled day.
  if (scheduledDays.has(cursor.getDay()) && !completed.has(toDateKey(cursor))) cursor = addDays(cursor, -1);
  while (!scheduledDays.has(cursor.getDay())) cursor = addDays(cursor, -1);
  if (toDateKey(cursor) < createdKey || !completed.has(toDateKey(cursor))) return 0;

  let streak = 0;
  for (let checked = 0; checked < 730 && toDateKey(cursor) >= createdKey; checked += 1) {
    if (scheduledDays.has(cursor.getDay())) {
      if (!completed.has(toDateKey(cursor))) break;
      streak += 1;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function useHabits(selectedDate: string) {
  const { user } = useAuth(); const calendar = useCalendar(); const [habits, setHabits] = useState<HabitWithLogs[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const refresh = useCallback(async (showLoading = true) => { if (!user) { setHabits([]); return; } if (showLoading) setLoading(true); setError(null); try { const rows = await habitsService.listHabits(user.id); const logs = await habitsService.listHabitLogs(rows.map((habit) => habit.id)); const referenceDate = fromDateKey(selectedDate); setHabits(rows.map((habit) => { const habitLogs = logs.filter((log) => log.habit_id === habit.id); return { ...habit, logs: habitLogs, streak: calculateHabitStreak(habit, habitLogs, referenceDate), completedOnSelectedDate: habitLogs.some((log) => log.completed_date === selectedDate) }; })); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load habits.'); } finally { if (showLoading) setLoading(false); } }, [user, selectedDate]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => subscribeHabitCompletionChanged(({ habitId, date, completed }) => {
    if (date !== selectedDate) return;
    setHabits((current) => current.map((item) => item.id === habitId ? { ...item, completedOnSelectedDate: completed } : item));
  }), [selectedDate]);
  const scheduled = habits.filter((habit) => habit.days_of_week.includes(fromDateKey(selectedDate).getDay()));
  const syncCalendar = async (habit: Habit) => { try {
    if (calendar.connected) { await removeHabitFromDeviceCalendar(habit.id).catch(() => undefined); await calendar.syncHabit(habit); setCalendarMessage('Habit synchronized with Google Calendar.'); return; }
    const result = await syncHabitToDeviceCalendar(habit);
    setCalendarMessage(result.status === 'denied' ? 'Calendar permission was denied. The habit was saved without calendar events.' : result.status === 'unsupported' ? 'Connect Google Calendar to synchronize habits on web.' : null);
  } catch (cause) { setCalendarMessage(cause instanceof Error ? `Habit saved, but calendar sync failed: ${cause.message}` : 'Habit saved, but calendar sync failed.'); } };
  const removeCalendarHabit = async (habitId: string) => {
    const removals: Promise<unknown>[] = [removeHabitFromDeviceCalendar(habitId)];
    if (calendar.connected) removals.push(calendar.removeHabit(habitId));
    const results = await Promise.allSettled(removals);
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) throw failed.reason;
  };
  return { habits: scheduled, allHabits: habits, loading, error, calendarMessage, refresh,
    addHabit: async (input: HabitInput) => { if (!user) return; const habit = await habitsService.createHabit(user.id, input); await syncCalendar(habit); await refresh(); },
    editHabit: async (habitId: string, input: HabitInput) => { const habit = await habitsService.updateHabit(habitId, input); await syncCalendar(habit); await refresh(); },
    deleteHabit: async (habitId: string) => { await habitsService.deleteHabit(habitId); try { await removeCalendarHabit(habitId); setCalendarMessage(null); } catch (cause) { setCalendarMessage(cause instanceof Error ? `Habit deleted, but calendar cleanup failed: ${cause.message}` : 'Habit deleted, but calendar cleanup failed.'); } await refresh(); },
    toggleHabit: async (habit: HabitWithLogs) => { const completed = !habit.completedOnSelectedDate; notifyHabitCompletionChanged({ habitId: habit.id, date: selectedDate, completed }); try { await habitsService.setHabitCompleted(habit.id, selectedDate, completed); await refresh(false); } catch (cause) { notifyHabitCompletionChanged({ habitId: habit.id, date: selectedDate, completed: !completed }); await refresh(false); throw cause; } },
    archiveHabit: async (habitId: string) => { await habitsService.archiveHabit(habitId); try { await removeCalendarHabit(habitId); } catch { /* Archiving remains successful even if calendar cleanup is unavailable. */ } await refresh(); },
  };
}
