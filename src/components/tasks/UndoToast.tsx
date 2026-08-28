import { RotateCcw } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { typography } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

type Props = { visible: boolean; taskTitle?: string; bottom: number; onUndo: () => void };

export function UndoToast({ visible, taskTitle, bottom, onUndo }: Props) {
  const { colors } = useTheme();
  const translateY = useSharedValue(24);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : 24, { duration: visible ? 180 : 150 });
    opacity.value = withTiming(visible ? 1 : 0, { duration: visible ? 160 : 120 });
  }, [opacity, translateY, visible]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: translateY.value }] }));

  return <Animated.View
    accessibilityLiveRegion="polite"
    pointerEvents={visible ? 'auto' : 'none'}
    style={[styles.toast, { bottom, backgroundColor: colors.text, borderColor: colors.background, shadowColor: colors.background }, animatedStyle]}
  >
    <Text numberOfLines={1} style={[styles.message, { color: colors.background }]}><Text style={styles.done}>Done!</Text> {taskTitle}</Text>
    <AnimatedPressable accessibilityRole="button" accessibilityLabel={`Undo completion of ${taskTitle ?? 'task'}`} hitSlop={8} onPress={onUndo} style={[styles.undo, { backgroundColor: colors.background, borderColor: colors.background }]}> 
      <RotateCcw size={13} strokeWidth={3} color={colors.text} />
      <Text style={[styles.undoText, { color: colors.text }]}>Undo</Text>
    </AnimatedPressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', zIndex: 20, elevation: 8, left: 20, right: 20, minHeight: 45, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingLeft: 12, paddingRight: 7, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  message: { flex: 1, fontSize: 11, fontWeight: '700' },
  done: { fontFamily: typography.display, fontSize: 16, fontWeight: '700' },
  undo: { height: 31, paddingHorizontal: 9, borderWidth: 1.5, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  undoText: { fontSize: 11, fontWeight: '900' },
});
