import { createElement } from 'react';
import type { ExpenseDateTimePickerProps } from './ExpenseDateTimePicker';
import { toDateKey } from '@/utils/dates';

export default function ExpenseDateTimePicker({ value, mode, maximumDate, theme, onSelect }: ExpenseDateTimePickerProps) {
  const time = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return createElement('input', {
    type: mode,
    'aria-label': `Expense ${mode}`,
    value: mode === 'date' ? toDateKey(value) : time(value),
    max: mode === 'date' ? toDateKey(maximumDate) : toDateKey(value) === toDateKey(maximumDate) ? time(maximumDate) : undefined,
    style: { colorScheme: theme, padding: 12, borderRadius: 12, fontSize: 16, maxWidth: '100%' },
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.value) return;
      const picked = new Date(mode === 'date' ? `${event.target.value}T12:00:00` : `${toDateKey(value)}T${event.target.value}:00`);
      if (!Number.isNaN(picked.getTime())) onSelect(picked);
    },
  });
}
