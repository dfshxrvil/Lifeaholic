import { BlurView } from 'expo-blur';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { softShadow } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { DDayEvent } from '@/types/database';

export function DDayWidget({ event, slot, onPress }: { event?: DDayEvent; slot: 1 | 2; onPress: () => void }) {
  const { colors, theme } = useTheme(); const now = new Date(); const days = event ? Math.ceil((new Date(`${event.event_date}T23:59:59`).getTime() - now.getTime()) / 86400000) : null;
  return <AnimatedPressable accessibilityLabel={event ? `Edit ${event.title}` : `Add D-Day ${slot}`} onPress={onPress} style={[styles.card, softShadow, { borderColor: colors.border }]}><BlurView intensity={80} tint={theme === 'light' ? 'light' : 'dark'} style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} /> 
    <View style={styles.countWrap}><Text style={[styles.count, { color: event ? colors.text : colors.textMuted }]}>{days === null ? '—' : days < 0 ? `+${Math.abs(days)}` : days === 0 ? '0' : days}</Text><Text style={[styles.label, { color: colors.textMuted }]}>DAYS</Text></View>
    <View style={styles.copy}><Text style={[styles.eyebrow, { color: colors.accent }]}>D-DAY</Text><Text numberOfLines={1} style={[styles.title, { color: colors.textMuted }]}>{event?.title ?? 'Set an event'}</Text></View>
  </AnimatedPressable>;
}
const styles = StyleSheet.create({ card: { width: 97, height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 25, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' }, countWrap: { minWidth: 34, alignItems: 'center' }, count: { fontSize: 20, lineHeight: 21, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' }, label: { fontSize: 6, lineHeight: 7, fontWeight: '900', letterSpacing: 0.7 }, copy: { flex: 1, minWidth: 0 }, eyebrow: { fontSize: 7, lineHeight: 9, fontWeight: '900', letterSpacing: 0.8 }, title: { fontSize: 9, lineHeight: 11, fontWeight: '600', marginTop: 1 } });
