import { Redirect } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AuthForm } from '@/components/auth/AuthForm';
import { ThemeSwitch } from '@/components/ui/ThemeSwitch';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function LoginScreen() {
  const { user } = useAuth(); const { colors } = useTheme();
  if (user) return <Redirect href="/(tabs)/home" />;
  return <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
      <View style={styles.theme}><ThemeSwitch compact /></View>
      <View style={styles.shell}>
        <View style={[styles.brandIcon, { backgroundColor: colors.accent }]}><Sparkles color="#FFFFFF" size={28} /></View>
        <View style={styles.heading}><Text style={[styles.brand, { color: colors.accent }]}>LIFEAHOLIC</Text><Text style={[styles.title, { color: colors.text }]}>Make today count.</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>Tasks, calendar, and focus time in one calm workspace.</Text></View>
        <View style={[styles.card, { backgroundColor: colors.cardElevated, borderColor: colors.border }]}><AuthForm /></View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, scroll: { flexGrow: 1, padding: 20, justifyContent: 'center' }, theme: { position: 'absolute', right: 20, top: Platform.OS === 'web' ? 20 : 50, zIndex: 2 }, shell: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 24, paddingVertical: 70 }, brandIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, heading: { gap: 8, alignItems: 'center' }, brand: { fontSize: 11, fontWeight: '900', letterSpacing: 3.2 }, title: { fontSize: 34, fontWeight: '900', letterSpacing: -1 }, subtitle: { fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 350 }, card: { padding: 22, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 4 } });
