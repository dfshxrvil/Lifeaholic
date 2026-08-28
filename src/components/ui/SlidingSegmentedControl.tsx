import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { LayoutChangeEvent, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { motion } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

type SegmentOption<T extends string> = { value: T; label: string; icon?: LucideIcon };

export function SlidingSegmentedControl<T extends string>({ value, options, onChange, activeColor, activeTextColor, style }: { value: T; options: SegmentOption<T>[]; onChange: (value: T) => void; activeColor?: string; activeTextColor?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme(); const reduceMotion = useReducedMotion(); const [width, setWidth] = useState(0); const progress = useSharedValue(Math.max(0, options.findIndex((item) => item.value === value)));
  useEffect(() => { const index = Math.max(0, options.findIndex((item) => item.value === value)); progress.value = reduceMotion ? index : withSpring(index, motion.spring); }, [value, options, progress, reduceMotion]);
  const itemWidth = width > 6 ? (width - 6) / options.length : 0;
  const pillStyle = useAnimatedStyle(() => ({ width: itemWidth, transform: [{ translateX: progress.value * itemWidth }] }));
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return <View onLayout={onLayout} style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
    {itemWidth > 0 && <Animated.View pointerEvents="none" style={[styles.pill, { backgroundColor: activeColor ?? colors.accent }, pillStyle]} />}
    {options.map((option) => { const active = option.value === value; const foreground = active ? activeTextColor ?? colors.buttonText : colors.textMuted; const Icon = option.icon; return <AnimatedPressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => onChange(option.value)} style={styles.option}>{Icon && <Icon size={16} color={foreground} />}<Text style={[styles.label, { color: foreground }]}>{option.label}</Text></AnimatedPressable>; })}
  </View>;
}

const styles = StyleSheet.create({ container: { height: 46, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 3, flexDirection: 'row', overflow: 'hidden' }, pill: { position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: 11 }, option: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', zIndex: 1 }, label: { fontSize: 12, fontWeight: '700' } });
