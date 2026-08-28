import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

export function FormInput({ accessibilityLabel, onFocus, onBlur, ...props }: TextInputProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const focusProgress = useSharedValue(0);
  const glowStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focusProgress.value, [0, 1], [colors.border, `${colors.accent}80`]),
    shadowColor: colors.accent,
    shadowOpacity: focusProgress.value * 0.18,
    shadowRadius: focusProgress.value * 10,
  }));
  const handleFocus: NonNullable<TextInputProps['onFocus']> = (event) => {
    // Reanimated shared values are intentionally mutable UI-thread state.
    // eslint-disable-next-line react-hooks/immutability
    focusProgress.value = reduceMotion ? 1 : withTiming(1, { duration: motion.standard }); onFocus?.(event);
  };
  const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
    // eslint-disable-next-line react-hooks/immutability
    focusProgress.value = reduceMotion ? 0 : withTiming(0, { duration: motion.standard }); onBlur?.(event);
  };
  return (
    <View style={styles.group}>
      {accessibilityLabel && <Text style={[styles.label, { color: colors.textMuted }]}>{accessibilityLabel}</Text>}
      <Animated.View style={[styles.inputShell, { backgroundColor: colors.input }, glowStyle]}>
        <TextInput {...props} accessibilityLabel={accessibilityLabel} placeholderTextColor={colors.textMuted}
          onFocus={handleFocus} onBlur={handleBlur}
          style={[styles.input, { color: colors.text }, props.style]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 }, label: { fontSize: 13, fontWeight: '600', marginLeft: 2 },
  inputShell: { minHeight: 50, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  input: { minHeight: 49, padding: 0, paddingHorizontal: 14, paddingVertical: 0, fontSize: 15, lineHeight: 20, textAlignVertical: 'center', includeFontPadding: false, backgroundColor: 'transparent' },
});
