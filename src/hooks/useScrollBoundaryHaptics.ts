import * as Haptics from 'expo-haptics';
import { useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export function useScrollBoundaryHaptics() {
  const armed = useRef(true);
  const onScrollBeginDrag = useCallback(() => { armed.current = true; }, []);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const overscroll = contentOffset.y + layoutMeasurement.height - contentSize.height;
    if (overscroll > 18 && armed.current) { armed.current = false; void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined); }
  }, []);
  const refreshImpact = useCallback(() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined); }, []);
  return { onScroll, onScrollBeginDrag, refreshImpact };
}
