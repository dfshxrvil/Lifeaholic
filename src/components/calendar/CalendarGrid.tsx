import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useTheme } from '@/contexts/ThemeContext';
import type { GoogleCalendarEvent } from '@/types/calendar';
import type { Task } from '@/types/database';
import { toDateKey } from '@/utils/dates';

function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12); const sundayOffset = first.getDay(); const start = new Date(first); start.setDate(first.getDate() - sundayOffset);
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
}

export function CalendarGrid({ month, selected, events, tasks, onMonthChange, onSelect }: { month: Date; selected: string; events: GoogleCalendarEvent[]; tasks: Task[]; onMonthChange: (date: Date) => void; onSelect: (key: string) => void }) {
  const { colors, theme } = useTheme(); const cells = monthCells(month); const weeks = Array.from({ length: 6 }, (_, index) => cells.slice(index * 7, index * 7 + 7)); const today = toDateKey(new Date());
  const shift = (amount: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + amount, 1));
  return <BlurView intensity={80} tint={theme === 'light' ? 'light' : 'dark'} style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.border }]}> 
    <View style={styles.header}><AnimatedPressable accessibilityLabel="Previous month" onPress={() => shift(-1)} style={styles.chevron}><ChevronLeft color={colors.text} /></AnimatedPressable><Text style={[styles.month, { color: colors.text }]}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text><AnimatedPressable accessibilityLabel="Next month" onPress={() => shift(1)} style={styles.chevron}><ChevronRight color={colors.text} /></AnimatedPressable></View>
    <View style={styles.week}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <Text key={day} style={[styles.weekday, { color: colors.textMuted }]}>{day.slice(0, 1)}</Text>)}</View>
    <View style={styles.grid}>{weeks.map((week, weekIndex) => <View key={weekIndex} style={styles.weekRow}>{week.map((date) => {
      const key = toDateKey(date); const active = key === selected; const inMonth = date.getMonth() === month.getMonth(); const hasEvent = events.some((event) => toDateKey(event.start) === key); const hasTask = tasks.some((task) => task.date === key);
      return <AnimatedPressable key={key} onPress={() => onSelect(key)} style={styles.cell}><View style={[styles.dayCircle, active && { backgroundColor: colors.accent }, key === today && !active && { borderColor: colors.accent, borderWidth: 1 }]}><Text style={[styles.day, { color: active ? '#FFF' : inMonth ? colors.text : colors.textMuted, opacity: inMonth ? 1 : 0.45 }]}>{date.getDate()}</Text></View><View style={styles.dots}>{hasEvent && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}{hasTask && <View style={[styles.dot, { backgroundColor: colors.success }]} />}</View></AnimatedPressable>;
    })}</View>)}</View>
  </BlurView>;
}

const styles = StyleSheet.create({ card: { borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, padding: 14, overflow: 'hidden' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, chevron: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, month: { fontSize: 18, fontWeight: '800' }, week: { flexDirection: 'row' }, weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', paddingVertical: 5 }, grid: { width: '100%' }, weekRow: { width: '100%', flexDirection: 'row' }, cell: { flex: 1, height: 50, alignItems: 'center' }, dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, day: { fontSize: 13, fontWeight: '700' }, dots: { flexDirection: 'row', height: 5, gap: 3, marginTop: 2 }, dot: { width: 4, height: 4, borderRadius: 2 } });
