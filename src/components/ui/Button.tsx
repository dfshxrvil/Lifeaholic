import { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useTheme } from '@/contexts/ThemeContext';

type Props = { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; icon?: LucideIcon; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> };

export function Button({ label, onPress, variant = 'primary', icon: Icon, loading, disabled, style }: Props) {
  const { colors, theme } = useTheme();
  const forceYellow = theme === 'blackYellow';
  const backgroundColor = forceYellow ? colors.accent : variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : colors.cardElevated;
  const textColor = forceYellow ? '#000000' : variant === 'secondary' ? colors.text : colors.buttonText;
  return (
    <AnimatedPressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress}
      style={[styles.button, { backgroundColor, borderColor: forceYellow ? colors.accent : colors.border, opacity: disabled ? 0.5 : 1 }, style]}>
      {loading ? <ActivityIndicator color={textColor} /> : <>{Icon && <Icon color={textColor} size={18} />}<Text style={[styles.label, { color: textColor }]}>{label}</Text></>}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 46, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '700' },
});
