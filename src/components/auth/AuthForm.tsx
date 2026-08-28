import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { FormInput } from '@/components/ui/FormInput';
import { ValidationFeedback } from '@/components/ui/ValidationFeedback';
import { useTheme } from '@/contexts/ThemeContext';
import { isSupabaseConfigured, supabase } from '@/services/supabase';

export function AuthForm() {
  const { colors } = useTheme();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false); const [message, setMessage] = useState<string | null>(null); const [isError, setIsError] = useState(false);
  const [errorPulse, setErrorPulse] = useState(0);
  const fail = (value: string) => { setMessage(value); setIsError(true); setErrorPulse((current) => current + 1); };
  const submit = async () => {
    setMessage(null); setIsError(false);
    if (!isSupabaseConfigured) { fail('Add Supabase credentials to .env to enable authentication.'); return; }
    if (!email.trim() || password.length < 6) { fail('Enter a valid email and a password of at least 6 characters.'); return; }
    setLoading(true);
    const result = mode === 'signIn'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: username.trim() || undefined } } });
    setLoading(false);
    if (result.error) { fail(result.error.message); return; }
    if (mode === 'signUp' && !result.data.session) setMessage('Check your inbox to confirm your account, then sign in.');
  };
  return <ValidationFeedback trigger={errorPulse}><View style={styles.form}>
    <View style={[styles.toggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {(['signIn', 'signUp'] as const).map((value) => <Text key={value} onPress={() => { setMode(value); setMessage(null); }} style={[styles.toggleItem, { color: mode === value ? colors.text : colors.textMuted, backgroundColor: mode === value ? colors.cardElevated : 'transparent' }]}>{value === 'signIn' ? 'Sign In' : 'Sign Up'}</Text>)}
    </View>
    <FormInput accessibilityLabel="Email" placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
    {mode === 'signUp' && <FormInput accessibilityLabel="Username (optional)" placeholder="How should we call you?" autoCapitalize="none" value={username} onChangeText={setUsername} />}
    <FormInput accessibilityLabel="Password" placeholder="At least 6 characters" secureTextEntry autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} value={password} onChangeText={setPassword} onSubmitEditing={() => void submit()} />
    {message && <Text style={[styles.message, { color: isError ? colors.danger : colors.success }]}>{message}</Text>}
    <Button label={mode === 'signIn' ? 'Sign in' : 'Create account'} onPress={() => void submit()} loading={loading} />
    <Text style={[styles.hint, { color: colors.textMuted }]}>Use your email to sign in. Your username is your public profile name.</Text>
  </View></ValidationFeedback>;
}

const styles = StyleSheet.create({ form: { gap: 15 }, toggle: { flexDirection: 'row', padding: 4, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth }, toggleItem: { flex: 1, textAlign: 'center', paddingVertical: 10, borderRadius: 12, fontWeight: '700', overflow: 'hidden' }, message: { fontSize: 14, lineHeight: 20 }, hint: { textAlign: 'center', fontSize: 12, lineHeight: 18 }, });
