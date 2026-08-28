import { Stack } from 'expo-router';
import { Asset } from 'expo-asset';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LaunchSplash } from '@/components/branding/LaunchSplash';
import { DeepLinkRouter } from '@/components/navigation/DeepLinkRouter';
import { WidgetSyncProvider } from '@/components/widgets/WidgetSyncProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import { CalendarProvider } from '@/contexts/CalendarContext';
import { SpatialAppFrame, SpatialModalProvider } from '@/contexts/SpatialModalContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import '../global.css';
import '@/widgets/androidHeadlessTask';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Navigation() {
  const { colors, theme } = useTheme();
  return <><StatusBar style={theme === 'light' ? 'dark' : 'light'} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}><Stack.Screen name="settings" options={{ presentation: 'modal' }} /><Stack.Screen name="notes/new" options={{ headerShown: true, title: 'New Note', headerBackTitle: 'Notes', headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerShadowVisible: false }} /></Stack></>;
}

export default function RootLayout() {
  const [assetsReady, setAssetsReady] = useState(false); const [mounted, setMounted] = useState(false); const [showSplash, setShowSplash] = useState(true);
  useEffect(() => { void Asset.loadAsync(require('../assets/images/lifeaholic-splash.png')).then(() => setAssetsReady(true)).catch(() => setAssetsReady(true)); }, []);
  const onLayout = useCallback(() => setMounted(true), []); const finishSplash = useCallback(() => setShowSplash(false), []);
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><ThemeProvider><SpatialModalProvider><View onLayout={onLayout} style={{ flex: 1 }}><SpatialAppFrame><AuthProvider><CalendarProvider><WidgetSyncProvider><DeepLinkRouter /><Navigation /></WidgetSyncProvider></CalendarProvider></AuthProvider></SpatialAppFrame>{showSplash && <LaunchSplash ready={assetsReady && mounted} onFinished={finishSplash} />}</View></SpatialModalProvider></ThemeProvider></SafeAreaProvider></GestureHandlerRootView>;
}
