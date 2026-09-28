import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export type TaskPickerMode = 'date' | 'time';
export type TaskDateTimePickerProps = { value: Date; mode: TaskPickerMode; onSelect: (value: Date) => void; onDismiss: () => void };

export default function TaskDateTimePicker({ value, mode, onSelect, onDismiss }: TaskDateTimePickerProps) {
  const { theme } = useTheme();
  const onChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') onDismiss();
    if (event.type === 'set' && selected) onSelect(selected);
  };
  return <DateTimePicker value={value} mode={mode} display={Platform.OS === 'ios' ? (mode === 'date' ? 'inline' : 'spinner') : 'default'} is24Hour={false} themeVariant={theme === 'light' ? 'light' : 'dark'} onChange={onChange} />;
}
