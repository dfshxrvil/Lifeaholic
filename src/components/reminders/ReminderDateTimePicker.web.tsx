import { createElement } from 'react';
import type { ReminderDateTimePickerProps } from './ReminderDateTimePicker';
import { toDateKey } from '@/utils/dates';

const timeKey = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export default function ReminderDateTimePicker({ value, mode, minimumDate, onSelect }: ReminderDateTimePickerProps) {
  return createElement('input', {
    type: mode,
    'aria-label': `Reminder ${mode}`,
    value: mode === 'date' ? toDateKey(value) : timeKey(value),
    min: mode === 'date' && minimumDate ? toDateKey(minimumDate) : undefined,
    style: { colorScheme: 'dark', padding: 12, borderRadius: 12, fontSize: 16, width: '100%' },
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.value) return;
      const picked = new Date(mode === 'date'
        ? `${event.target.value}T${timeKey(value)}:00`
        : `${toDateKey(value)}T${event.target.value}:00`);
      if (!Number.isNaN(picked.getTime())) onSelect(picked);
    },
  });
}
