import { Image, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

export function LaunchSplash({ ready, onFinished }: { ready: boolean; onFinished: () => void }) {
  const reduceMotion = useReducedMotion(); const opacity = useSharedValue(1);
  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync().finally(() => {
      opacity.value = reduceMotion ? 0 : withTiming(0, { duration: 520 }, (finished) => { if (finished) runOnJS(onFinished)(); });
      if (reduceMotion) onFinished();
    });
  }, [ready, reduceMotion, opacity, onFinished]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View pointerEvents={ready ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.overlay, animatedStyle]}><View style={styles.aura} /><Image source={require('../../../assets/images/lifeaholic-splash.png')} resizeMode="contain" style={styles.logo} /><Text style={styles.name}>Lifeaholic</Text><Text style={styles.tagline}>Design the life you keep choosing.</Text><Text style={styles.credit}>App made by Shxrvil Doifode and Pxrth Rane</Text></Animated.View>;
}

const styles = StyleSheet.create({ overlay: { zIndex: 9999, backgroundColor: '#09090B', alignItems: 'center', justifyContent: 'center' }, aura: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(250,204,21,0.06)', shadowColor: '#FACC15', shadowOpacity: 0.22, shadowRadius: 46 }, logo: { width: 138, height: 138, borderRadius: 34 }, name: { color: '#FAFAFA', fontSize: 31, fontWeight: '900', letterSpacing: -0.8, marginTop: 18 }, tagline: { color: '#A1A1AA', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginTop: 7 }, credit: { color: '#71717A', fontSize: 9, fontWeight: '500', letterSpacing: 0.35, marginTop: 16 } });
