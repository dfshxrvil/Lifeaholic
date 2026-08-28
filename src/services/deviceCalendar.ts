import { Platform } from 'react-native';
import type { Habit } from '@/types/database';

const MARKER_PREFIX = 'lifeaholic-habit:';
const LEGACY_MARKER_PREFIX = 'daylight-habit:';
type CalendarModule = typeof import('expo-calendar');

let calendarModulePromise: Promise<CalendarModule | null> | null = null;

async function loadCalendarModule() {
  if (Platform.OS === 'web') return null;
  calendarModulePromise ??= import('expo-calendar').catch(() => null);
  return calendarModulePromise;
}

export type HabitCalendarSyncResult = { status: 'synced' | 'denied' | 'unsupported'; eventCount: number };

async function writableCalendar(Calendar: CalendarModule) {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((item) => item.allowsModifications);
  if (!writable.length) throw new Error('No writable device calendar is available.');
  if (Platform.OS === 'ios') {
    try {
      const preferred = await Calendar.getDefaultCalendarAsync();
      if (preferred.allowsModifications) return preferred;
    } catch { /* Fall through to a writable calendar. */ }
  }
  return writable.find((item) => item.isPrimary)
    ?? writable.find((item) => `${item.source?.name ?? ''} ${item.title}`.toLowerCase().includes('google'))
    ?? writable[0]!;
}

function marker(habitId: string) { return `[${MARKER_PREFIX}${habitId}]`; }

async function removeExisting(Calendar: CalendarModule, calendarId: string, habitId: string) {
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const end = new Date();
  end.setDate(end.getDate() + 15);
  const events = await Calendar.getEventsAsync([calendarId], start, end);
  const matching = events.filter((event) => event.notes?.includes(marker(habitId)) || event.notes?.includes(`[${LEGACY_MARKER_PREFIX}${habitId}]`));
  for (const event of [...new Map(matching.map((item) => [item.id, item])).values()]) {
    await Calendar.deleteEventAsync(event.id, { futureEvents: true, instanceStartDate: event.startDate });
  }
}

function nextWeekday(day: number, time: string | null) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + ((day - date.getDay() + 7) % 7));
  if (time) {
    const [hours = 9, minutes = 0] = time.slice(0, 5).split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
  }
  return date;
}

export async function syncHabitToDeviceCalendar(habit: Habit): Promise<HabitCalendarSyncResult> {
  const Calendar = await loadCalendarModule();
  if (!Calendar) return { status: 'unsupported', eventCount: 0 };
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (!permission.granted) return { status: 'denied', eventCount: 0 };
  const target = await writableCalendar(Calendar);
  await removeExisting(Calendar, target.id, habit.id);
  const recurrenceEnd = new Date();
  recurrenceEnd.setFullYear(recurrenceEnd.getFullYear() + 1);
  for (const day of [...new Set(habit.days_of_week)].sort()) {
    const start = nextWeekday(day, habit.time);
    const end = new Date(start);
    if (habit.time) end.setMinutes(end.getMinutes() + 30);
    else end.setDate(end.getDate() + 1);
    await Calendar.createEventAsync(target.id, {
      title: habit.title,
      notes: `${marker(habit.id)} Scheduled habit from Lifeaholic`,
      startDate: start,
      endDate: end,
      allDay: !habit.time,
      recurrenceRule: { frequency: Calendar.Frequency.WEEKLY, interval: 1, endDate: recurrenceEnd },
    });
  }
  return { status: 'synced', eventCount: habit.days_of_week.length };
}

export async function removeHabitFromDeviceCalendar(habitId: string) {
  const Calendar = await loadCalendarModule();
  if (!Calendar) return;
  const permission = await Calendar.getCalendarPermissionsAsync();
  if (!permission.granted) return;
  const target = await writableCalendar(Calendar);
  await removeExisting(Calendar, target.id, habitId);
}
