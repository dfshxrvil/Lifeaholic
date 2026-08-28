import type { GoogleApiEvent, GoogleCalendarEvent } from '@/types/calendar';
import type { Habit } from '@/types/database';

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const HABIT_PROPERTY = 'lifeaholicHabitId';
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

async function googleError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: { message?: string } };
    return body.error?.message || fallback;
  } catch {
    return fallback;
  }
}

function normalizeEvent(event: GoogleApiEvent): GoogleCalendarEvent | null {
  const startValue = event.start.dateTime ?? event.start.date;
  const endValue = event.end.dateTime ?? event.end.date;
  if (!startValue || !endValue) return null;
  return {
    id: event.id,
    title: event.summary || 'Untitled event',
    description: event.description,
    start: new Date(startValue),
    end: new Date(endValue),
    isAllDay: Boolean(event.start.date),
    htmlLink: event.htmlLink,
  };
}

export async function fetchCalendarEvents(accessToken: string, timeMin: Date, timeMax: Date) {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), singleEvents: 'true',
    orderBy: 'startTime', maxResults: '2500',
  });
  const response = await fetch(`${EVENTS_URL}?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(response.status === 401 ? 'Google authorization expired. Please reconnect.' : 'Unable to load Google Calendar.');
  const body = await response.json() as { items?: GoogleApiEvent[] };
  return (body.items ?? []).map(normalizeEvent).filter((event): event is GoogleCalendarEvent => Boolean(event));
}

export async function createCalendarEvent(accessToken: string, input: { title: string; start: Date; end: Date; description?: string }) {
  const response = await fetch(EVENTS_URL, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: input.title, description: input.description, start: { dateTime: input.start.toISOString() }, end: { dateTime: input.end.toISOString() } }) });
  if (!response.ok) throw new Error(await googleError(response, response.status === 403 ? 'Reconnect Google Calendar with event access.' : 'Unable to create the calendar event.'));
  return normalizeEvent(await response.json() as GoogleApiEvent);
}

export async function updateCalendarEvent(accessToken: string, eventId: string, input: { title: string; start: Date; end: Date; description?: string }) {
  if (!eventId) throw new Error('The calendar event is missing its Google event ID.');
  const response = await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: input.title, description: input.description, start: { dateTime: input.start.toISOString() }, end: { dateTime: input.end.toISOString() } }) });
  if (!response.ok) throw new Error(await googleError(response, 'Unable to update the Google Calendar event.'));
  const event = normalizeEvent(await response.json() as GoogleApiEvent);
  if (!event) throw new Error('Google Calendar returned an invalid updated event.');
  return event;
}

export async function deleteCalendarEvent(accessToken: string, eventId: string) {
  if (!eventId) throw new Error('The calendar event is missing its Google event ID.');
  const response = await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(await googleError(response, 'Unable to delete the Google Calendar event.'));
}

async function findGoogleHabitEvents(accessToken: string, habitId: string) {
  const params = new URLSearchParams({ privateExtendedProperty: `${HABIT_PROPERTY}=${habitId}`, singleEvents: 'false', maxResults: '250' });
  const response = await fetch(`${EVENTS_URL}?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(await googleError(response, 'Unable to locate the habit in Google Calendar.'));
  const body = await response.json() as { items?: GoogleApiEvent[] };
  return (body.items ?? []).filter((event) => Boolean(event.id));
}

export async function removeHabitFromGoogleCalendar(accessToken: string, habitId: string) {
  const events = await findGoogleHabitEvents(accessToken, habitId);
  await Promise.all(events.map((event) => deleteCalendarEvent(accessToken, event.id)));
  return events.length;
}

function nextScheduledDate(days: number[], time: string | null) {
  const now = new Date();
  const normalizedDays = [...new Set(days)].filter((day) => day >= 0 && day <= 6).sort();
  const offsets = normalizedDays.map((day) => (day - now.getDay() + 7) % 7);
  let offset = offsets.length ? Math.min(...offsets) : 0;
  const [hours = 9, minutes = 0] = (time?.slice(0, 5) ?? '09:00').split(':').map(Number);
  const start = new Date(now); start.setHours(hours, minutes, 0, 0); start.setDate(start.getDate() + offset);
  if (time && start <= now) {
    const futureOffsets = offsets.filter((value) => value > 0);
    offset = futureOffsets.length ? Math.min(...futureOffsets) : 7;
    start.setTime(now.getTime()); start.setHours(hours, minutes, 0, 0); start.setDate(start.getDate() + offset);
  }
  return start;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function syncHabitToGoogleCalendar(accessToken: string, habit: Habit) {
  if (!habit?.id || !habit.title?.trim()) throw new Error('The habit is missing required calendar details.');
  const days = [...new Set(habit.days_of_week)].filter((day) => day >= 0 && day <= 6).sort();
  await removeHabitFromGoogleCalendar(accessToken, habit.id);
  if (!days.length) return null;
  const start = nextScheduledDate(days, habit.time);
  const end = new Date(start);
  if (habit.time) end.setMinutes(end.getMinutes() + 30); else end.setDate(end.getDate() + 1);
  const recurrenceEnd = new Date(); recurrenceEnd.setFullYear(recurrenceEnd.getFullYear() + 1);
  const body = {
    summary: [habit.emoji, habit.title].filter(Boolean).join(' '),
    description: 'Scheduled habit from Lifeaholic',
    start: habit.time ? { dateTime: start.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : { date: localDateKey(start) },
    end: habit.time ? { dateTime: end.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : { date: localDateKey(end) },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${days.map((day) => WEEKDAYS[day]).join(',')};UNTIL=${recurrenceEnd.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`],
    extendedProperties: { private: { [HABIT_PROPERTY]: habit.id } },
  };
  const response = await fetch(EVENTS_URL, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await googleError(response, 'Unable to synchronize the habit with Google Calendar.'));
  return normalizeEvent(await response.json() as GoogleApiEvent);
}
