import { Check } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { motion } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

export function Checkbox({ checked, onPress, label, compact = false }: { checked: boolean; onPress: () => void; label: string; compact?: boolean }) {
  const { colors } = useTheme(); const reduceMotion = useReducedMotion(); const borderScale = useSharedValue(1); const checkProgress = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    if (checked) { borderScale.value = reduceMotion ? 1 : withSequence(withTiming(0.78, { duration: 50 }), withSpring(1, motion.spring)); checkProgress.value = reduceMotion ? 1 : withDelay(50, withTiming(1, { duration: 130 })); }
    else { borderScale.value = 1; checkProgress.value = reduceMotion ? 0 : withTiming(0, { duration: 100 }); }
  }, [checked, borderScale, checkProgress, reduceMotion]);
  const boxMotion = useAnimatedStyle(() => ({ transform: [{ scale: borderScale.value }] })); const checkMotion = useAnimatedStyle(() => ({ opacity: checkProgress.value, transform: [{ scale: checkProgress.value }] }));
  return <Animated.View style={boxMotion}><AnimatedPressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={onPress} hitSlop={compact ? 10 : undefined} style={[styles.box, compact && styles.compact, { borderColor: checked ? colors.accent : colors.textMuted, backgroundColor: checked ? colors.accent : 'transparent' }]}><Animated.View style={checkMotion}><Check size={compact ? 10 : 14} strokeWidth={3} color={colors.buttonText} /></Animated.View></AnimatedPressable></Animated.View>;
}

const styles = StyleSheet.create({ box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.25, alignItems: 'center', justifyContent: 'center' }, compact: { width: 14, height: 14, borderRadius: 4, borderWidth: 1 } });
