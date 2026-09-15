export type ExpensePickerMode = 'date' | 'time';

/** Change only the requested local calendar component; never reinterpret it as UTC. */
export function mergeExpenseTimestamp(current: Date, picked: Date, mode: ExpensePickerMode): Date {
  const next = new Date(current);
  if (mode === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return next;
}

export function formatExpenseDate(value: Date, now = new Date()): string {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (value.toDateString() === now.toDateString()) return 'Today';
  if (value.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return `${String(value.getDate()).padStart(2, '0')} ${value.toLocaleDateString('en-GB', { month: 'short' })} ${value.getFullYear()}`;
}

export function formatExpenseTime(value: Date): string {
  return `${String(value.getHours() % 12 || 12).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')} ${value.getHours() >= 12 ? 'PM' : 'AM'}`;
}
