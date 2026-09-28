import { AlarmClock, Bell, BellOff, ChevronLeft, Pencil, Plus, Trash2, Volume2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { AppModal } from '@/components/ui/AppModal';
import { Button } from '@/components/ui/Button';
import { FormInput } from '@/components/ui/FormInput';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  deleteScheduledAlert,
  listScheduledAlerts,
  saveScheduledAlert,
  setScheduledAlertEnabled,
} from '@/services/scheduledAlerts';
import type { ReminderDeliveryMode, ScheduledAlert, ScheduledAlertKind } from '@/types/scheduledAlert';
import { toDateKey } from '@/utils/dates';
import { useSafeBack } from '@/utils/navigation';
import { scheduledAlertTimestamp } from '@/utils/scheduledAlertDate';

const deliveryOptions: { value: ReminderDeliveryMode; label: string; detail: string; icon: typeof Bell }[] = [
  { value: 'silent', label: 'Silent', detail: 'Shows quietly without sound', icon: BellOff },
  { value: 'notification', label: 'Notification', detail: 'Standard sound and vibration', icon: Bell },
  { value: 'alarm', label: 'Alarm style', detail: 'Time-sensitive sound and stronger vibration', icon: AlarmClock },
];

function initialDateTime() {
  const value = new Date(Date.now() + 5 * 60_000);
  value.setSeconds(0, 0);
  return {
    date: toDateKey(value),
    time: `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`,
  };
}

export function ScheduledAlertsScreen({ kind }: { kind: ScheduledAlertKind }) {
  const safeBack = useSafeBack();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [items, setItems] = useState<ScheduledAlert[]>([]);
  const [referenceNow, setReferenceNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledAlert | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<ReminderDeliveryMode>(kind === 'alarm' ? 'alarm' : 'notification');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noun = kind === 'alarm' ? 'alarm' : 'reminder';
  const Icon = kind === 'alarm' ? AlarmClock : Bell;

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try { setItems(await listScheduledAlerts(user.id, kind)); setReferenceNow(Date.now()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `Unable to load ${noun}s.`); }
    finally { setLoading(false); }
  }, [kind, noun, user]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const upcoming = useMemo(() => items.filter((item) => scheduledAlertTimestamp(item) > referenceNow), [items, referenceNow]);
  const past = useMemo(() => items.filter((item) => scheduledAlertTimestamp(item) <= referenceNow), [items, referenceNow]);

  const openNew = () => {
    const initial = initialDateTime();
    setEditing(null); setTitle(''); setDate(initial.date); setTime(initial.time);
    setDeliveryMode(kind === 'alarm' ? 'alarm' : 'notification'); setError(null); setEditorOpen(true);
  };
  const openEdit = (item: ScheduledAlert) => {
    setEditing(item); setTitle(item.title); setDate(item.date); setTime(item.time);
    setDeliveryMode(item.deliveryMode); setError(null); setEditorOpen(true);
  };
  const save = async () => {
    if (!user || saving) return;
    setSaving(true); setError(null);
    try {
      await saveScheduledAlert(user.id, { kind, title, date, time, deliveryMode }, editing);
      setEditorOpen(false); setEditing(null); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Unable to save the ${noun}.`); }
    finally { setSaving(false); }
  };
  const toggle = async (item: ScheduledAlert, enabled: boolean) => {
    if (!user) return;
    setError(null);
    try {
      const updated = await setScheduledAlertEnabled(user.id, item, enabled);
      setItems((current) => current.map((value) => value.id === item.id ? updated : value));
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Unable to update the ${noun}.`); }
  };
  const remove = async (item: ScheduledAlert) => {
    if (!user) return;
    setError(null);
    try { await deleteScheduledAlert(user.id, item); setItems((current) => current.filter((value) => value.id !== item.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `Unable to delete the ${noun}.`); }
  };

  const renderItem = (item: ScheduledAlert, isPast = false) => {
    const mode = deliveryOptions.find((option) => option.value === item.deliveryMode);
    return <View key={item.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: isPast ? 0.64 : 1 }]}>
      <View style={[styles.cardIcon, { backgroundColor: colors.accentSoft }]}><Icon size={20} color={colors.accent} /></View>
      <AnimatedPressable accessibilityLabel={`Edit ${item.title}`} onPress={() => openEdit(item)} style={styles.cardCopy}>
        <Text numberOfLines={2} style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.cardMeta, { color: colors.textMuted }]}>{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · {item.time}</Text>
        <View style={styles.modeRow}>{item.deliveryMode === 'silent' ? <BellOff size={12} color={colors.textMuted} /> : item.deliveryMode === 'alarm' ? <AlarmClock size={12} color={colors.danger} /> : <Volume2 size={12} color={colors.accent} />}<Text style={[styles.modeText, { color: colors.textMuted }]}>{isPast ? 'Past' : mode?.label}</Text></View>
      </AnimatedPressable>
      {!isPast && <Switch value={item.enabled} onValueChange={(value) => void toggle(item, value)} trackColor={{ false: colors.border, true: colors.accentSoft }} thumbColor={item.enabled ? colors.accent : colors.textMuted} />}
      <AnimatedPressable accessibilityLabel={`Edit ${item.title}`} onPress={() => openEdit(item)} hitSlop={8}><Pencil size={16} color={colors.textMuted} /></AnimatedPressable>
      <AnimatedPressable accessibilityLabel={`Delete ${item.title}`} onPress={() => void remove(item)} hitSlop={8}><Trash2 size={17} color={colors.danger} /></AnimatedPressable>
    </View>;
  };

  return <Screen scroll contentStyle={styles.screen}>
    <View style={styles.header}><AnimatedPressable accessibilityLabel="Back to Calendar" onPress={safeBack} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}><ChevronLeft color={colors.text} /></AnimatedPressable><View style={styles.heading}><Text style={[styles.title, { color: colors.text }]}>{kind === 'alarm' ? 'Alarms' : 'Reminders'}</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>{kind === 'alarm' ? 'Time-critical alerts for important moments.' : 'Everything you need to remember, in one place.'}</Text></View></View>
    {Platform.OS === 'web' && <View style={[styles.notice, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}><Text style={{ color: colors.text }}>Browser alerts work while Lifeaholic is open. Allow notifications when prompted.</Text></View>}
    {error && !editorOpen && <Text style={{ color: colors.danger }}>{error}</Text>}
    <Button label={`Add ${kind === 'alarm' ? 'Alarm' : 'Reminder'}`} icon={Plus} onPress={openNew} />
    <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.textMuted }]}>UPCOMING · {upcoming.length}</Text>{loading ? <ActivityIndicator color={colors.accent} /> : upcoming.length ? upcoming.map((item) => renderItem(item)) : <View style={[styles.empty, { borderColor: colors.border }]}><Icon size={28} color={colors.textMuted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>No upcoming {noun}s</Text><Text style={[styles.emptyText, { color: colors.textMuted }]}>Tap Add {kind === 'alarm' ? 'Alarm' : 'Reminder'} to schedule one.</Text></View>}</View>
    {past.length > 0 && <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PAST · {past.length}</Text>{past.map((item) => renderItem(item, true))}</View>}
    <AppModal visible={editorOpen} onClose={() => { if (!saving) setEditorOpen(false); }}><View style={styles.editor}>
      <Text style={[styles.editorTitle, { color: colors.text }]}>{editing ? `Edit ${noun}` : `New ${noun}`}</Text>
      <FormInput accessibilityLabel={`${kind === 'alarm' ? 'Alarm' : 'Reminder'} name`} value={title} onChangeText={setTitle} placeholder={kind === 'alarm' ? 'Wake up, leave for class…' : 'Medicine, assignment, call…'} autoFocus />
      <View style={styles.dateTime}><View style={styles.field}><FormInput accessibilityLabel="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} /></View><View style={styles.field}><FormInput accessibilityLabel="Time" value={time} onChangeText={setTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation" maxLength={5} /></View></View>
      {kind === 'reminder' && <View style={styles.delivery}><Text style={[styles.sectionTitle, { color: colors.textMuted }]}>HOW SHOULD IT ALERT YOU?</Text>{deliveryOptions.map((option) => <AnimatedPressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected: deliveryMode === option.value }} onPress={() => setDeliveryMode(option.value)} style={[styles.deliveryOption, { backgroundColor: deliveryMode === option.value ? colors.accentSoft : colors.card, borderColor: deliveryMode === option.value ? colors.accent : colors.border }]}><option.icon size={19} color={deliveryMode === option.value ? colors.accent : colors.textMuted} /><View style={styles.cardCopy}><Text style={[styles.deliveryTitle, { color: colors.text }]}>{option.label}</Text><Text style={[styles.deliveryDetail, { color: colors.textMuted }]}>{option.detail}</Text></View></AnimatedPressable>)}</View>}
      {kind === 'alarm' && <View style={[styles.notice, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}><AlarmClock size={18} color={colors.accent} /><Text style={[styles.alarmNote, { color: colors.textMuted }]}>Uses the strongest available notification sound and vibration. Device mute, Focus, or DND settings may still affect delivery.</Text></View>}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <View style={styles.actions}><Button label="Cancel" variant="secondary" disabled={saving} onPress={() => setEditorOpen(false)} style={styles.action} /><Button label={editing ? 'Save changes' : `Set ${noun}`} loading={saving} onPress={() => void save()} style={styles.action} /></View>
    </View></AppModal>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: 16, paddingBottom: 40, gap: 18 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 44, height: 44, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }, heading: { flex: 1 }, title: { fontSize: 29, fontWeight: '900' }, subtitle: { marginTop: 2, fontSize: 12 }, notice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }, section: { gap: 9 }, sectionTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1 }, card: { minHeight: 82, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }, cardIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, cardCopy: { flex: 1, minWidth: 0 }, cardTitle: { fontSize: 14, fontWeight: '800' }, cardMeta: { fontSize: 11, marginTop: 4 }, modeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }, modeText: { fontSize: 10, fontWeight: '700' }, empty: { minHeight: 150, borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 }, emptyTitle: { fontSize: 16, fontWeight: '800' }, emptyText: { fontSize: 11 }, editor: { gap: 14 }, editorTitle: { fontSize: 23, fontWeight: '900' }, dateTime: { flexDirection: 'row', gap: 9 }, field: { flex: 1 }, delivery: { gap: 8 }, deliveryOption: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }, deliveryTitle: { fontSize: 13, fontWeight: '800' }, deliveryDetail: { fontSize: 10, marginTop: 2 }, alarmNote: { flex: 1, fontSize: 11, lineHeight: 16 }, actions: { flexDirection: 'row', gap: 9 }, action: { flex: 1 },
});
