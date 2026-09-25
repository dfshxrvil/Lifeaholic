import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export type ReminderPickerMode = 'date' | 'time';
export type ReminderDateTimePickerProps = {
  value: Date;
  mode: ReminderPickerMode;
  minimumDate?: Date;
  onSelect: (value: Date) => void;
  onDismiss: () => void;
};

export default function ReminderDateTimePicker({ value, mode, minimumDate, onSelect, onDismiss }: ReminderDateTimePickerProps) {
  const { theme } = useTheme();
  const onChange = (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') onDismiss();
    if (event.type === 'set' && picked) onSelect(picked);
  };
  return <DateTimePicker
    value={value}
    mode={mode}
    display={Platform.OS === 'ios' ? (mode === 'date' ? 'inline' : 'spinner') : 'default'}
    minimumDate={mode === 'date' ? minimumDate : undefined}
    is24Hour={false}
    themeVariant={theme === 'light' ? 'light' : 'dark'}
    onChange={onChange}
  />;
}
