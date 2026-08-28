import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { fromDateKey, toDateKey } from '@/utils/dates';

export function formatTaskDateTag(dateKey: string) {
  const today = new Date(); const value = fromDateKey(dateKey);
  const delta = Math.round((value.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  if (delta === 0) return 'Today'; if (delta === -1) return 'Yesterday'; if (delta === 1) return 'Tomorrow';
  return value.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function DateTag({ date }: { date: string }) {
  const { colors } = useTheme(); const rolled = date < toDateKey(new Date());
  return <View style={[styles.tag, { backgroundColor: rolled ? `${colors.danger}18` : colors.accentSoft }]}><Text style={[styles.text, { color: rolled ? colors.danger : colors.accent }]}>{formatTaskDateTag(date)}</Text></View>;
}

const styles = StyleSheet.create({ tag: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }, text: { fontSize: 8, fontWeight: '800' } });
