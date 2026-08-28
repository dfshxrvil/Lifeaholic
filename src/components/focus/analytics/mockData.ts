import type { FocusSession } from './types';

const SUBJECTS = [
  { id: 'mathematics', name: 'Mathematics', colorHex: '#6366F1' },
  { id: 'computer-science', name: 'Computer Science', colorHex: '#14B8A6' },
  { id: 'physics', name: 'Physics', colorHex: '#F59E0B' },
  { id: 'writing', name: 'Writing', colorHex: '#EC4899' },
] as const;

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Deterministic sample data anchored to the current month so every time-filter
 * has useful content whenever the demo is opened.
 */
export function createMockFocusSessions(referenceDate = new Date()): FocusSession[] {
  const sessions: FocusSession[] = [];

  for (let monthOffset = -6; monthOffset <= 0; monthOffset += 1) {
    const month = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + monthOffset, 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const currentMonthLimit = monthOffset === 0 ? Math.max(referenceDate.getDate(), 7) : daysInMonth;
    const sessionCount = Math.min(11 + (monthOffset + 6) * 2, currentMonthLimit);

    for (let index = 0; index < sessionCount; index += 1) {
      const subject = SUBJECTS[(index * 3 + monthOffset + 12) % SUBJECTS.length] ?? SUBJECTS[0];
      const day = 1 + ((index * 2 + monthOffset + 14) % currentMonthLimit);
      const durationInMinutes = 28 + ((index * 17 + monthOffset * 9 + 84) % 83);

      sessions.push({
        id: `mock-${month.getFullYear()}-${month.getMonth() + 1}-${index + 1}`,
        subjectId: subject.id,
        subjectName: subject.name,
        colorHex: subject.colorHex,
        durationInMinutes,
        date: dateKey(new Date(month.getFullYear(), month.getMonth(), day)),
      });

      // Add occasional second sessions to make hover details and averages realistic.
      if (index % 5 === 1) {
        const extraSubject = SUBJECTS[(index + 1) % SUBJECTS.length] ?? SUBJECTS[1];
        sessions.push({
          id: `mock-${month.getFullYear()}-${month.getMonth() + 1}-${index + 1}-extra`,
          subjectId: extraSubject.id,
          subjectName: extraSubject.name,
          colorHex: extraSubject.colorHex,
          durationInMinutes: 22 + ((index * 11) % 37),
          date: dateKey(new Date(month.getFullYear(), month.getMonth(), day)),
        });
      }
    }
  }

  return sessions;
}

export const mockFocusSessions: FocusSession[] = createMockFocusSessions();
