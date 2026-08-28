import { CalendarDays, Clock3, DollarSign, Grid2X2, Home, NotebookTabs } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useEffect, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { motion } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

const icons = { matrix: Grid2X2, focus: Clock3, home: Home, calendar: CalendarDays, finance: DollarSign, notes: NotebookTabs };
const labels = { matrix: 'Matrix', focus: 'Focus', home: 'Home', calendar: 'Calendar', finance: 'Finance', notes: 'Notes' };
export const FLOATING_TAB_BAR_HEIGHT = 76;
export const FLOATING_TAB_BAR_MIN_BOTTOM_GAP = 14;
export const FLOATING_TAB_BAR_ACTION_GAP = 24;

export function useFloatingTabBarMetrics() {
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(FLOATING_TAB_BAR_MIN_BOTTOM_GAP, insets.bottom - 6);
  return { bottomGap, actionBottom: bottomGap + FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_ACTION_GAP, contentBottom: bottomGap + FLOATING_TAB_BAR_HEIGHT + 36 };
}

type Props = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type Route = Props['state']['routes'][number];

function TabButton({ route, focused, onPress }: { route: Route; focused: boolean; onPress: () => void }) {
  const { colors } = useTheme(); const reduceMotion = useReducedMotion();
  const scale = useSharedValue(focused ? 1 : 0.94);
  useEffect(() => {
    scale.value = reduceMotion ? (focused ? 1 : 0.94) : withSpring(focused ? 1 : 0.94, motion.spring);
  }, [focused, reduceMotion, scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const routeName = route.name as keyof typeof icons;
  const Icon = icons[routeName] ?? Home;
  const label = labels[routeName] ?? route.name;
  return (
    <AnimatedPressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: focused }} onPress={onPress} style={styles.slot}>
      <Animated.View style={[styles.iconWrap, focused && { backgroundColor: colors.accentSoft }, animatedStyle]}>
        <Icon size={route.name === 'home' ? 24 : 22} color={focused ? colors.accent : colors.textMuted} strokeWidth={focused ? 2.6 : 2} />
      </Animated.View>
      {label ? <Text numberOfLines={1} style={[styles.label, { color: focused ? colors.accent : colors.textMuted }]}>{label}</Text> : null}
    </AnimatedPressable>
  );
}

export function FloatingTabBar({ state, navigation }: Props) {
  const { colors, theme } = useTheme();
  const { bottomGap } = useFloatingTabBarMetrics();
  return (
    <View pointerEvents="box-none" style={[styles.positioner, { bottom: bottomGap - 10}]}> 
      <BlurView intensity={80} tint={theme === 'light' ? 'light' : 'dark'} style={[styles.bar, { backgroundColor: colors.glass, borderColor: colors.border }]}> 
        {state.routes.map((route, index) => <TabButton key={route.key} route={route} focused={state.index === index} onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!event.defaultPrevented) navigation.navigate(route.name);
        }} />)}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: { position: 'absolute', left: 14, right: 14, alignItems: 'center' },
  bar: { width: '100%', maxWidth: 620, height: FLOATING_TAB_BAR_HEIGHT, borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 14 },
  slot: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 },
  iconWrap: { width: 38, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '700' },
});
