import { withSpring, withTiming, type ExitAnimationsValues, type LayoutAnimation } from 'react-native-reanimated';

export function collapseOut(values: ExitAnimationsValues): LayoutAnimation {
  'worklet';
  return {
    initialValues: { height: values.currentHeight, opacity: 1, transform: [{ scale: 1 }] },
    animations: { height: withSpring(0, { damping: 18, stiffness: 240 }), opacity: withTiming(0, { duration: 150 }), transform: [{ scale: withTiming(0.98, { duration: 150 }) }] },
  };
}
