import type { Reminder } from '@/types/database';

export type ReminderSection = {
  key: 'overdue' | 'today' | 'tomorrow' | 'later';
  title: 'Overdue' | 'Today' | 'Tomorrow' | 'Later';
  data: Reminder[];
};

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const chronological = (left: Reminder, right: Reminder) =>
  left.target_date.localeCompare(right.target_date)
  || left.target_time.localeCompare(right.target_time)
  || left.created_at.localeCompare(right.created_at);

export function sortReminders(reminders: Reminder[]) {
  return [...reminders].sort(chronological);
}

export function groupReminders(reminders: Reminder[], now: Date): ReminderSection[] {
  const today = dateKey(now);
  const nextDay = new Date(now);
  nextDay.setDate(nextDay.getDate() + 1);
  const tomorrow = dateKey(nextDay);
  const groups: ReminderSection[] = [
    { key: 'overdue', title: 'Overdue', data: [] },
    { key: 'today', title: 'Today', data: [] },
    { key: 'tomorrow', title: 'Tomorrow', data: [] },
    { key: 'later', title: 'Later', data: [] },
  ];
  for (const reminder of sortReminders(reminders)) {
    if (reminder.target_date < today) groups[0]!.data.push(reminder);
    else if (reminder.target_date === today) groups[1]!.data.push(reminder);
    else if (reminder.target_date === tomorrow) groups[2]!.data.push(reminder);
    else groups[3]!.data.push(reminder);
  }
  return groups.filter((group) => group.data.length > 0);
}
