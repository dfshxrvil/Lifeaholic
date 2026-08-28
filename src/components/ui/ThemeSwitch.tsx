import { Contrast, MoonStar, Palette, Sun } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { ThemeMode } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

const options: { mode: ThemeMode; label: string; icon: typeof Contrast }[] = [
  { mode: 'light', label: 'Light', icon: Sun }, { mode: 'highContrast', label: 'Dark', icon: Contrast }, { mode: 'blackYellow', label: 'Black & Yellow', icon: MoonStar }, { mode: 'custom', label: 'Custom', icon: Palette },
];
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { theme, colors, setTheme } = useTheme();
  if (compact) { const next: Record<ThemeMode, ThemeMode> = { light: 'highContrast', highContrast: 'blackYellow', blackYellow: 'custom', custom: 'light' }; return <AnimatedPressable accessibilityRole="button" onPress={() => setTheme(next[theme])} style={[styles.compact, { backgroundColor: colors.card, borderColor: colors.border }]}><Palette size={19} color={colors.accent} /></AnimatedPressable>; }
  return <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>{options.map(({ mode, label, icon: Icon }) => { const active = theme === mode; return <AnimatedPressable key={mode} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => setTheme(mode)} style={[styles.option, active && { backgroundColor: colors.accentSoft }]}><Icon size={18} color={active ? colors.accent : colors.textMuted} /><Text style={[styles.label, { color: active ? colors.text : colors.textMuted }]}>{label}</Text></AnimatedPressable>; })}</View>;
}
const styles = StyleSheet.create({ container: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 5, gap: 3 }, option: { minHeight: 48, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, label: { fontSize: 14, fontWeight: '700' }, compact: { width: 44, height: 44, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' } });
