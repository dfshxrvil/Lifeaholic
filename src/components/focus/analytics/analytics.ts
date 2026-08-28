import type { FocusAnalyticsTimeRange, FocusSession, MonthlySummary, SubjectOption } from './types';

export type DailyStudyPoint = {
  day: number;
  label: string;
  minutes: number;
  hours: number;
  sessions: FocusSession[];
};

export type SubjectSplitPoint = SubjectOption & {
  minutes: number;
  hours: number;
  percentage: number;
};

export function parseDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function shiftMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatDuration(totalMinutes: number) {
  const roundedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function getRange(referenceDate: Date, range: FocusAnalyticsTimeRange) {
  const current = startOfMonth(referenceDate);
  if (range === 'lastMonth') {
    const start = shiftMonth(current, -1);
    return { start, end: current, label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  }
  if (range === 'last6Months') {
    return { start: shiftMonth(current, -5), end: shiftMonth(current, 1), label: 'Last 6 months' };
  }
  return {
    start: current,
    end: shiftMonth(current, 1),
    label: current.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  };
}

export function filterByRange(sessions: FocusSession[], referenceDate: Date, range: FocusAnalyticsTimeRange) {
  const { start, end } = getRange(referenceDate, range);
  return sessions.filter((session) => {
    const date = parseDate(session.date);
    return date >= start && date < end;
  });
}

export function getSubjects(sessions: FocusSession[]): SubjectOption[] {
  return Array.from(
    new Map(sessions.map((session) => [session.subjectId, {
      id: session.subjectId,
      name: session.subjectName,
      colorHex: session.colorHex,
    }])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));
}

export function getDailyStudyData(sessions: FocusSession[], referenceDate: Date, range: FocusAnalyticsTimeRange): DailyStudyPoint[] {
  const days = range === 'last6Months'
    ? 31
    : new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth() + (range === 'lastMonth' ? 0 : 1),
      0,
    ).getDate();

  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const matching = sessions.filter((session) => parseDate(session.date).getDate() === day);
    const minutes = matching.reduce((total, session) => total + session.durationInMinutes, 0);
    return {
      day,
      label: String(day),
      minutes,
      hours: Number((minutes / 60).toFixed(2)),
      sessions: matching,
    };
  });
}

export function getSubjectSplit(sessions: FocusSession[]): SubjectSplitPoint[] {
  const total = sessions.reduce((sum, session) => sum + session.durationInMinutes, 0);
  const grouped = new Map<string, SubjectSplitPoint>();
  sessions.forEach((session) => {
    const current = grouped.get(session.subjectId);
    const minutes = (current?.minutes ?? 0) + session.durationInMinutes;
    grouped.set(session.subjectId, {
      id: session.subjectId,
      name: session.subjectName,
      colorHex: session.colorHex,
      minutes,
      hours: Number((minutes / 60).toFixed(2)),
      percentage: total ? Math.round((minutes / total) * 100) : 0,
    });
  });
  return [...grouped.values()].sort((a, b) => b.minutes - a.minutes);
}

export function getMonthlyHistory(sessions: FocusSession[], referenceDate: Date): MonthlySummary[] {
  return Array.from({ length: 6 }, (_, index) => shiftMonth(startOfMonth(referenceDate), index - 5)).map((month) => {
    const key = monthKey(month);
    const monthSessions = sessions.filter((session) => session.date.startsWith(key));
    return {
      monthKey: key,
      label: month.toLocaleDateString(undefined, { month: 'short' }),
      totalMinutes: monthSessions.reduce((sum, session) => sum + session.durationInMinutes, 0),
      sessionCount: monthSessions.length,
      activeDays: new Set(monthSessions.map((session) => session.date)).size,
    };
  });
}

export function getMonthOverMonth(sessions: FocusSession[], referenceDate: Date, subjectId: string) {
  const currentStart = startOfMonth(referenceDate);
  const previousStart = shiftMonth(currentStart, -1);
  const nextStart = shiftMonth(currentStart, 1);
  const relevant = subjectId === 'all' ? sessions : sessions.filter((session) => session.subjectId === subjectId);
  const sumBetween = (start: Date, end: Date) => relevant.reduce((total, session) => {
    const date = parseDate(session.date);
    return date >= start && date < end ? total + session.durationInMinutes : total;
  }, 0);
  const current = sumBetween(currentStart, nextStart);
  const previous = sumBetween(previousStart, currentStart);
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}
