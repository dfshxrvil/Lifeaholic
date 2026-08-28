import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { CalendarClock } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useCalendar } from '@/contexts/CalendarContext';
import { useTheme } from '@/contexts/ThemeContext';
import { formatEventTime, toDateKey } from '@/utils/dates';

export function WhatsNext() {
  const router = useRouter();
  const { events, loading } = useCalendar();
  const { colors, theme } = useTheme();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const nextEvent = useMemo(() => {
    const today = toDateKey(new Date(now));
    return events
      .filter((event) => !Number.isNaN(event.start.getTime()) && toDateKey(event.start) === today && event.start.getTime() > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 1)[0] ?? null;
  }, [events, now]);

  return <View style={styles.section}>
    <View style={styles.headingRow}><Text style={[styles.heading, { color: colors.text }]}>What’s Next</Text><AnimatedPressable onPress={() => router.navigate('/(tabs)/calendar')}><Text style={[styles.link, { color: colors.accent }]}>Calendar</Text></AnimatedPressable></View>
    <BlurView intensity={80} tint={theme === 'light' ? 'light' : 'dark'} style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.border }]}> 
      {loading && !nextEvent ? <Text style={[styles.empty, { color: colors.textMuted }]}>Loading today’s schedule…</Text> : nextEvent ? <View style={styles.item}><CalendarClock size={17} color={colors.accent} /><View style={styles.copy}><Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{nextEvent.title}</Text><Text numberOfLines={1} style={[styles.meta, { color: colors.textMuted }]}>{formatEventTime(nextEvent.start, nextEvent.end, nextEvent.isAllDay)}</Text></View></View> : <Text style={[styles.empty, { color: colors.textMuted }]}>No more upcoming events today.</Text>}
    </BlurView>
  </View>;
}

const styles = StyleSheet.create({ section: { gap: 7 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, heading: { fontSize: 18, fontWeight: '800' }, link: { fontSize: 11, fontWeight: '800' }, card: { minHeight: 69, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 17, paddingVertical: 8, overflow: 'hidden', justifyContent: 'center' }, item: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }, copy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, title: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '700' }, meta: { flexShrink: 0, maxWidth: '45%', fontSize: 11, fontWeight: '600', textAlign: 'right' }, empty: { paddingVertical: 16, textAlign: 'center', fontSize: 12 } });
