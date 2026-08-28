import { ChevronLeft, LogOut, Save } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { FormInput } from '@/components/ui/FormInput';
import { Screen } from '@/components/ui/Screen';
import { ThemeSwitch } from '@/components/ui/ThemeSwitch';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { deleteDDayEvent, listDDayEvents, saveDDayEvent } from '@/services/dDayEvents';
import { getProfile, updateProfile } from '@/services/profile';
import type { Json } from '@/types/database';

const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export default function SettingsScreen() {
  const router = useRouter(); const { colors, theme, customColors, setCustomColors } = useTheme(); const { user, signOut } = useAuth();
  const [background, setBackground] = useState(customColors.background); const [text, setText] = useState(customColors.text); const [eventTitles, setEventTitles] = useState(['', '']); const [eventDates, setEventDates] = useState(['', '']); const [saving, setSaving] = useState(false); const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { if (!user) return; Promise.all([getProfile(user.id), listDDayEvents(user.id)]).then(([, events]) => { setEventTitles([events.find((item) => item.slot === 1)?.title ?? '', events.find((item) => item.slot === 2)?.title ?? '']); setEventDates([events.find((item) => item.slot === 1)?.event_date ?? '', events.find((item) => item.slot === 2)?.event_date ?? '']); }).catch(() => setMessage('Run migration #4 to enable the latest settings.')); }, [user]);
  const save = async () => { if (!user) return; if (theme === 'custom' && (!isHex(background) || !isHex(text))) { setMessage('Custom colors must use six-digit hex values, such as #101828.'); return; } if (eventTitles.some((title, index) => Boolean(title.trim()) !== Boolean(eventDates[index]?.trim()))) { setMessage('Each D-Day needs both a title and date.'); return; } setSaving(true); setMessage(null); try { if (theme === 'custom') setCustomColors({ background, text }); const preference = { mode: theme, custom: { background, text } } as unknown as Json; await updateProfile(user.id, { theme_preference: preference }); await Promise.all(([1, 2] as const).map((slot) => eventTitles[slot - 1]?.trim() ? saveDDayEvent(user.id, slot, eventTitles[slot - 1]!, eventDates[slot - 1]!) : deleteDDayEvent(user.id, slot))); setMessage('Settings saved.'); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to save settings.'); } finally { setSaving(false); } };
  return <Screen scroll contentStyle={styles.screen}>
    <View style={styles.header}><AnimatedPressable accessibilityLabel="Close settings" onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card }]}><ChevronLeft color={colors.text} /></AnimatedPressable><View style={styles.heading}><Text style={[styles.title, { color: colors.text }]}>Settings</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>{user?.email}</Text></View></View>
    <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.textMuted }]}>THEME</Text><ThemeSwitch />{theme === 'custom' && <View style={[styles.custom, { backgroundColor: colors.card, borderColor: colors.border }]}><FormInput accessibilityLabel="Background color" value={background} onChangeText={setBackground} autoCapitalize="characters" placeholder="#101828" /><FormInput accessibilityLabel="Font color" value={text} onChangeText={setText} autoCapitalize="characters" placeholder="#F8FAFC" /><View style={[styles.preview, { backgroundColor: isHex(background) ? background : '#000', borderColor: colors.border }]}><Text style={{ color: isHex(text) ? text : '#FFF', fontWeight: '800' }}>Custom theme preview</Text></View></View>}</View>
    <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.textMuted }]}>D-DAY EVENTS</Text><View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{([0, 1] as const).map((index) => <View key={index} style={styles.ddayFields}><Text style={[styles.ddayLabel, { color: colors.text }]}>Event {index + 1}</Text><FormInput accessibilityLabel={`Event ${index + 1} title`} value={eventTitles[index]} onChangeText={(value) => setEventTitles((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))} placeholder="Graduation, launch, exam…" /><FormInput accessibilityLabel={`Event ${index + 1} date`} value={eventDates[index]} onChangeText={(value) => setEventDates((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /></View>)}</View></View>
    {message && <Text style={{ color: message.includes('saved') ? colors.success : colors.danger }}>{message}</Text>}
    <Button label="Save settings" icon={Save} onPress={() => void save()} loading={saving} />
    <Button label="Sign out" icon={LogOut} variant="danger" onPress={() => void signOut()} />
    <View style={styles.footer}><Text style={[styles.credit, { color: colors.textMuted }]}>App made by Shxrvil Doifode and Pxrth Rane.</Text></View>
  </Screen>;
}

const styles = StyleSheet.create({ screen: { paddingTop: 16, paddingBottom: 40, gap: 24 }, header: { flexDirection: 'row', alignItems: 'center', gap: 13 }, back: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, heading: { flex: 1 }, title: { fontSize: 29, fontWeight: '900' }, subtitle: { marginTop: 2 }, section: { gap: 10 }, sectionTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginLeft: 4 }, custom: { padding: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, gap: 12 }, preview: { minHeight: 54, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, card: { padding: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, gap: 16 }, ddayFields: { gap: 8 }, ddayLabel: { fontSize: 13, fontWeight: '700' }, footer: { flex: 1, minHeight: 80, justifyContent: 'flex-end' }, credit: { textAlign: 'center', fontSize: 11 } });
