import { Redirect, Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/navigation/FloatingTabBar';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function TabsLayout() {
  const { user, loading } = useAuth(); const { colors } = useTheme();
  if (!loading && !user) return <Redirect href="/login" />;
  return <Tabs initialRouteName="home" tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
    <Tabs.Screen name="matrix" options={{ title: 'Matrix' }} />
    <Tabs.Screen name="focus" options={{ title: 'Focus' }} />
    <Tabs.Screen name="home" options={{ title: 'Home' }} />
    <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
    <Tabs.Screen name="finance" options={{ title: 'Finance' }} />
    <Tabs.Screen name="notes" options={{ title: 'Notes' }} />
  </Tabs>;
}
