import * as Haptics from 'expo-haptics';
import { PropsWithChildren, useEffect } from 'react';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

export function ValidationFeedback({ trigger, children }: PropsWithChildren<{ trigger: number }>) {
  const reduceMotion = useReducedMotion(); const x = useSharedValue(0);
  useEffect(() => {
    if (!trigger) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    if (reduceMotion) return;
    x.value = withSequence(withTiming(-8, { duration: 42 }), withTiming(8, { duration: 42 }), withTiming(-6, { duration: 42 }), withTiming(6, { duration: 42 }), withTiming(0, { duration: 48 }));
  }, [trigger, reduceMotion, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
