import { CalendarClock, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useCalendar } from '@/contexts/CalendarContext';
import { useTheme } from '@/contexts/ThemeContext';
import { formatEventTime } from '@/utils/dates';

export function UpcomingEventCard() {
  const router = useRouter();
  const { nextEvent, connected, loading } = useCalendar();
  const { colors } = useTheme();
  const title = loading ? 'Syncing calendar…' : nextEvent?.title ?? (connected ? 'No upcoming events' : 'Connect Google Calendar');
  const subtitle = nextEvent ? formatEventTime(nextEvent.start, nextEvent.end, nextEvent.isAllDay) : connected ? 'Your schedule is clear' : 'See your next event here';
  return (
    <AnimatedPressable onPress={() => router.navigate('/(tabs)/calendar')} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
      <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}><CalendarClock color={colors.accent} size={22} /></View>
      <View style={styles.copy}><Text style={[styles.eyebrow, { color: colors.textMuted }]}>UP NEXT</Text><Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{title}</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text></View>
      <ChevronRight color={colors.textMuted} size={20} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  icon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, title: { fontSize: 17, fontWeight: '700' }, subtitle: { fontSize: 13 },
});
