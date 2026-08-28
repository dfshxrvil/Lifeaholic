import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { PropsWithChildren, useEffect, useId, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { motion } from '@/constants/theme';
import { useSpatialModal } from '@/contexts/SpatialModalContext';
import { useTheme } from '@/contexts/ThemeContext';

const rigidImpact = () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => undefined); };

export function AppModal({ visible, onClose, sheetStyle, children }: PropsWithChildren<{ visible: boolean; onClose: () => void; sheetStyle?: StyleProp<ViewStyle> }>) {
  const { colors, theme } = useTheme(); const { setModalVisible } = useSpatialModal(); const modalId = useId(); const reduceMotion = useReducedMotion(); const [mounted, setMounted] = useState(visible);
  const overlayOpacity = useSharedValue(visible ? 1 : 0); const translateY = useSharedValue(visible ? 0 : 96); const dragY = useSharedValue(0); const scale = useSharedValue(visible ? 1 : 0.985);
  useEffect(() => { setModalVisible(modalId, mounted); return () => setModalVisible(modalId, false); }, [modalId, mounted, setModalVisible]);
  useEffect(() => {
    if (visible) { setMounted(true); dragY.value = 0; overlayOpacity.value = reduceMotion ? 1 : withTiming(1, { duration: motion.standard }); translateY.value = reduceMotion ? 0 : withSpring(0, motion.spatialSpring); scale.value = reduceMotion ? 1 : withSpring(1, motion.spatialSpring); return; }
    if (!mounted) return;
    overlayOpacity.value = reduceMotion ? 0 : withTiming(0, { duration: motion.fast }); scale.value = reduceMotion ? 1 : withTiming(0.985, { duration: motion.fast });
    translateY.value = reduceMotion ? 900 : withTiming(900, { duration: 230 }, (finished) => { if (finished) { runOnJS(rigidImpact)(); runOnJS(setMounted)(false); } });
    if (reduceMotion) { rigidImpact(); setMounted(false); }
  }, [visible, mounted, reduceMotion, dragY, overlayOpacity, scale, translateY]);
  const dismissGesture = Gesture.Pan().activeOffsetY(8).failOffsetX([-24, 24]).onUpdate((event) => {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated gesture worklet shared state.
    dragY.value = Math.max(0, event.translationY);
  }).onEnd((event) => { if (event.translationY > 88 || event.velocityY > 760) runOnJS(onClose)(); else {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated gesture worklet shared state.
    dragY.value = withSpring(0, motion.spatialSpring);
  } });
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value })); const sheetMotion = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value + dragY.value }, { scale: scale.value }] }));
  return <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.fill}>
      <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}><BlurView intensity={80} tint={theme === 'light' ? 'light' : 'dark'} style={StyleSheet.absoluteFill} /><Pressable accessibilityLabel="Close modal" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} /></Animated.View>
      <View pointerEvents="box-none" style={styles.overlay}><Animated.View style={[styles.sheetFrame, sheetMotion, sheetStyle]}><BlurView intensity={80} tint={theme === 'light' ? 'light' : 'dark'} style={[styles.sheet, sheetStyle ? styles.sheetFill : undefined, { backgroundColor: colors.glass, borderColor: colors.border }]}><GestureDetector gesture={dismissGesture}><Animated.View accessibilityRole="button" accessibilityLabel="Swipe down to close" style={styles.dragTarget}><View style={[styles.handle, { backgroundColor: colors.textMuted }]} /></Animated.View></GestureDetector>{children}</BlurView></Animated.View></View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({ fill: { flex: 1 }, overlay: { flex: 1, padding: 18, alignItems: 'center', justifyContent: 'flex-end' }, sheetFrame: { width: '100%', maxWidth: 560, maxHeight: '92%' }, sheet: { width: '100%', maxHeight: '100%', borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: 22, paddingTop: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 34, shadowOffset: { width: 0, height: 16 }, elevation: 20 }, sheetFill: { flex: 1 }, dragTarget: { height: 22, marginTop: -6, marginHorizontal: -8, alignItems: 'center', justifyContent: 'center' }, handle: { width: 38, height: 4, borderRadius: 2, opacity: 0.42 } });
