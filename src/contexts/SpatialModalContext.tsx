import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { motion } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

type SpatialModalContextValue = { active: boolean; setModalVisible: (id: string, visible: boolean) => void };
const SpatialModalContext = createContext<SpatialModalContextValue | null>(null);

export function SpatialModalProvider({ children }: PropsWithChildren) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const setModalVisible = useCallback((id: string, visible: boolean) => setOpenIds((current) => {
    const next = new Set(current); if (visible) next.add(id); else next.delete(id); return next;
  }), []);
  const value = useMemo(() => ({ active: openIds.size > 0, setModalVisible }), [openIds, setModalVisible]);
  return <SpatialModalContext.Provider value={value}>{children}</SpatialModalContext.Provider>;
}

export function useSpatialModal() {
  const value = useContext(SpatialModalContext);
  if (!value) throw new Error('useSpatialModal must be used within SpatialModalProvider');
  return value;
}

export function SpatialAppFrame({ children }: PropsWithChildren) {
  const { colors } = useTheme(); const { active } = useSpatialModal(); const reduceMotion = useReducedMotion(); const depth = useSharedValue(active ? 1 : 0);
  useEffect(() => { depth.value = reduceMotion ? (active ? 1 : 0) : withSpring(active ? 1 : 0, motion.spatialSpring); }, [active, depth, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: interpolate(depth.value, [0, 1], [1, 0.72]), borderRadius: interpolate(depth.value, [0, 1], [0, 24]), transform: [{ scale: interpolate(depth.value, [0, 1], [1, 0.95]) }] }));
  return <View style={[styles.stage, { backgroundColor: colors.background }]}><Animated.View style={[styles.frame, { backgroundColor: colors.background }, style]}>{children}</Animated.View></View>;
}

const styles = StyleSheet.create({ stage: { flex: 1, alignItems: 'center', justifyContent: 'center' }, frame: { width: '100%', height: '100%', overflow: 'hidden' } });
