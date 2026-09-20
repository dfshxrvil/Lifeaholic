import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import type { ExpensePickerMode } from '@/utils/expenseTimestamp';

export type ExpenseDateTimePickerProps = {
  value: Date;
  mode: ExpensePickerMode;
  maximumDate: Date;
  theme: 'light' | 'dark';
  onSelect: (value: Date) => void;
  onDismiss: () => void;
};

export default function ExpenseDateTimePicker({ value, mode, maximumDate, theme, onSelect, onDismiss }: ExpenseDateTimePickerProps) {
  return <DateTimePicker
    value={value}
    mode={mode}
    display={Platform.OS === 'ios' ? (mode === 'date' ? 'inline' : 'compact') : 'default'}
    maximumDate={maximumDate}
    is24Hour={false}
    themeVariant={theme}
    onDismiss={onDismiss}
    onValueChange={(_event, picked) => {
      if (Platform.OS === 'android') onDismiss();
      onSelect(picked);
    }}
  />;
}
