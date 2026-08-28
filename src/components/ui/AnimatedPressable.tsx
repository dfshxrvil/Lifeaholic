import type { ComponentProps } from 'react';
import { GestureResponderEvent, Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { motion } from '@/constants/theme';

const ReanimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<ComponentProps<typeof Pressable>, 'style' | 'onPressIn' | 'onPressOut'> & {
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  pressedOpacity?: number;
  onPressIn?: (event: GestureResponderEvent) => void;
  onPressOut?: (event: GestureResponderEvent) => void;
};

export function AnimatedPressable({ style, pressedScale = motion.pressScale, pressedOpacity = motion.pressOpacity, disabled, onPressIn, onPressOut, ...props }: Props) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const pressIn = (event: GestureResponderEvent) => {
    // Reanimated shared values are intentionally mutable UI-thread state.
    // eslint-disable-next-line react-hooks/immutability
    scale.value = reduceMotion ? 1 : withTiming(pressedScale, { duration: 70 });
    // eslint-disable-next-line react-hooks/immutability
    opacity.value = reduceMotion ? pressedOpacity : withTiming(pressedOpacity, { duration: 70 });
    onPressIn?.(event);
  };
  const pressOut = (event: GestureResponderEvent) => {
    // eslint-disable-next-line react-hooks/immutability
    scale.value = reduceMotion ? 1 : withSpring(1, motion.spring);
    // eslint-disable-next-line react-hooks/immutability
    opacity.value = reduceMotion ? 1 : withSpring(1, motion.spring);
    onPressOut?.(event);
  };
  return <ReanimatedPressable {...props} disabled={disabled} onPressIn={pressIn} onPressOut={pressOut} style={[style, animatedStyle]} />;
}
