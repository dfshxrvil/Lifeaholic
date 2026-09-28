import { createElement } from 'react';
import type { TaskDateTimePickerProps } from './TaskDateTimePicker';
import { toDateKey } from '@/utils/dates';

const timeKey = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export default function TaskDateTimePicker({ value, mode, onSelect }: TaskDateTimePickerProps) {
  return createElement('input', {
    type: mode, 'aria-label': `Task ${mode}`,
    value: mode === 'date' ? toDateKey(value) : timeKey(value),
    style: { colorScheme: 'dark', padding: 12, borderRadius: 12, fontSize: 16, width: '100%' },
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.value) return;
      const selected = new Date(mode === 'date' ? `${event.target.value}T${timeKey(value)}:00` : `${toDateKey(value)}T${event.target.value}:00`);
      if (!Number.isNaN(selected.getTime())) onSelect(selected);
    },
  });
}
