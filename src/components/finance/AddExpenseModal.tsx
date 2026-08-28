import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Users } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppModal } from '@/components/ui/AppModal';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Button } from '@/components/ui/Button';
import { ValidationFeedback } from '@/components/ui/ValidationFeedback';
import { typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { CreateExpenseInput } from '@/hooks/useExpenses';
import type { Group, GroupMemberProfile, ExpenseCategory, ExpenseSplitType } from '@/types/database';
import { toDateKey } from '@/utils/dates';

type Props = {
  visible: boolean;
  groups: Group[];
  membersByGroup: Record<string, GroupMemberProfile[]>;
  onClose: () => void;
  onCreate: (input: CreateExpenseInput) => Promise<unknown>;
};

const rules: { value: ExpenseSplitType; label: string; hint: string }[] = [
  { value: 'split_equally', label: 'Split Equally', hint: 'Everyone shares the cost' },
  { value: 'you_owed_full', label: 'You’re Owed Full', hint: 'One member owes you' },
  { value: 'other_owed_full', label: 'You Owe Full', hint: 'You owe the selected payer' },
];
const categories: ExpenseCategory[] = ['Food', 'Online shopping', 'Investments', 'Other'];

const addDays = (key: string, amount: number) => {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
};

export function AddExpenseModal({ visible, groups, membersByGroup, onClose, onCreate }: Props) {
  const { colors, theme } = useTheme(); const { user } = useAuth();
  const [description, setDescription] = useState(''); const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Food'); const [customCategoryNote, setCustomCategoryNote] = useState('');
  const [date, setDate] = useState(toDateKey(new Date())); const [groupId, setGroupId] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState(''); const [splitType, setSplitType] = useState<ExpenseSplitType>('split_equally');
  const [counterpartyId, setCounterpartyId] = useState(''); const [panel, setPanel] = useState<'group' | 'payer' | 'member' | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const [errorPulse, setErrorPulse] = useState(0);
  const members = groupId ? (membersByGroup[groupId] ?? []) : [];
  const nameFor = (id: string) => members.find((member) => member.user_id === id)?.profile.username
    ?? members.find((member) => member.user_id === id)?.profile.email ?? (id === user?.id ? 'You' : 'Member');

  useEffect(() => {
    if (!visible) return;
    setDescription(''); setAmount(''); setCategory('Food'); setCustomCategoryNote(''); setDate(toDateKey(new Date())); setGroupId(null); setPaidBy(user?.id ?? '');
    setSplitType('split_equally'); setCounterpartyId(''); setPanel(null); setError(null);
  }, [visible, user?.id]);

  const chooseGroup = (nextId: string | null) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setGroupId(nextId); setPaidBy(user?.id ?? ''); setCounterpartyId(''); setSplitType('split_equally'); setPanel(null);
  };
  const fail = (message: string) => { setError(message); setErrorPulse((value) => value + 1); };
  const submit = async () => {
    const numericAmount = Number(amount.replace(/[^0-9.]/g, ''));
    if (!description.trim()) { fail('Add a description.'); return; }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) { fail('Enter a valid amount.'); return; }
    if (category === 'Other' && !customCategoryNote.trim()) { fail('Add a note describing the Other expense.'); return; }
    if (groupId && members.length === 0) { fail('This group needs at least one member.'); return; }
    if (groupId && splitType !== 'split_equally' && !counterpartyId) { fail('Choose the other member.'); return; }
    setSaving(true); setError(null);
    try {
      await onCreate({ description: description.trim(), amount: numericAmount, expenseDate: date, groupId,
        paidBy: paidBy || user?.id, splitType: groupId ? splitType : 'personal', memberIds: members.map((member) => member.user_id), counterpartyId, category, customCategoryNote: customCategoryNote.trim() || null });
      onClose();
    } catch (cause) { fail(cause instanceof Error ? cause.message : 'Unable to add expense.'); }
    finally { setSaving(false); }
  };

  const renderSelectorPanel = (kind: 'group' | 'payer' | 'member') => {
    const options = kind === 'group'
      ? [{ id: '', label: 'Personal (No Group)' }, ...groups.map((group) => ({ id: group.id, label: group.name }))]
      : members.map((member) => ({ id: member.user_id, label: member.user_id === user?.id ? 'You' : member.profile.username ?? member.profile.email ?? 'Member' }))
        .filter((option) => kind !== 'member' || option.id !== user?.id);
    const selected = kind === 'group' ? (groupId ?? '') : kind === 'payer' ? paidBy : counterpartyId;
    return <View style={[styles.options, { backgroundColor: colors.card, borderColor: colors.border }]}>{options.map((option) =>
      <AnimatedPressable key={option.id || 'personal'} onPress={() => {
        if (kind === 'group') chooseGroup(option.id || null);
        else { if (kind === 'payer') setPaidBy(option.id); else setCounterpartyId(option.id); setPanel(null); }
      }} style={[styles.option, selected === option.id && { backgroundColor: colors.accentSoft }]}>
        <Text style={[styles.optionText, { color: colors.text }]}>{option.label}</Text>{selected === option.id && <Check size={17} color={colors.accent} />}
      </AnimatedPressable>)}</View>;
  };

  return <>
    <AppModal visible={visible} onClose={onClose}><ValidationFeedback trigger={errorPulse}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View><Text style={[styles.title, { color: colors.text }]}>Add an expense</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>Log it now. Sort the balance automatically.</Text></View>
      <View style={[styles.inputCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <TextInput accessibilityLabel="Expense description" autoFocus value={description} onChangeText={setDescription} placeholder="What was it for?" placeholderTextColor={colors.textMuted} style={[styles.description, { color: colors.text, borderBottomColor: colors.border }]} />
        <View style={styles.moneyRow}><Text style={[styles.currency, { color: colors.accent }]}>₹</Text><TextInput accessibilityLabel="Expense amount" value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={[styles.amount, { color: colors.text }]} /></View>
      </View>
      <View><Text style={[styles.sectionLabel, { color: colors.textMuted }]}>CATEGORY</Text><View style={styles.categoryRow}>{categories.map((value) => <AnimatedPressable key={value} onPress={() => setCategory(value)} style={[styles.category, { backgroundColor: category === value ? colors.accent : colors.card, borderColor: category === value ? colors.accent : colors.border }]}><Text style={[styles.categoryText, { color: category === value ? colors.buttonText : colors.text }]}>{value}</Text></AnimatedPressable>)}</View></View>
      {category === 'Other' && <View><Text style={[styles.sectionLabel, { color: colors.textMuted }]}>OTHER CATEGORY NOTE · REQUIRED</Text><TextInput accessibilityLabel="Other category note" value={customCategoryNote} onChangeText={setCustomCategoryNote} placeholder="What kind of expense was this?" placeholderTextColor={colors.textMuted} style={[styles.noteInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]} /></View>}
      <View style={styles.controlBar}>
        <AnimatedPressable accessibilityLabel="Choose expense date" onPress={() => setCalendarOpen(true)} style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border }]}><CalendarDays size={20} color={colors.accent} /><Text style={[styles.controlText, { color: colors.text }]}>{date === toDateKey(new Date()) ? 'Today' : date.slice(5)}</Text></AnimatedPressable>
        <AnimatedPressable accessibilityLabel="Choose expense group" onPress={() => setPanel(panel === 'group' ? null : 'group')} style={[styles.groupButton, { backgroundColor: colors.card, borderColor: colors.border }]}><Users size={19} color={colors.accent} /><Text numberOfLines={1} style={[styles.groupText, { color: colors.text }]}>{groupId ? groups.find((group) => group.id === groupId)?.name : 'Personal'}</Text><ChevronDown size={16} color={colors.textMuted} /></AnimatedPressable>
      </View>
      {panel === 'group' && renderSelectorPanel('group')}
      {groupId && <View style={styles.groupOptions}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>PAID BY</Text>
        <AnimatedPressable onPress={() => setPanel(panel === 'payer' ? null : 'payer')} style={[styles.select, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.selectText, { color: colors.text }]}>{nameFor(paidBy)}</Text><ChevronDown size={17} color={colors.textMuted} /></AnimatedPressable>
        {panel === 'payer' && renderSelectorPanel('payer')}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SPLIT RULE</Text>
        <View style={styles.rules}>{rules.map((rule) => <AnimatedPressable key={rule.value} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSplitType(rule.value); setCounterpartyId(''); }} style={[styles.rule, { backgroundColor: splitType === rule.value ? colors.accentSoft : colors.card, borderColor: splitType === rule.value ? colors.accent : colors.border }]}><Text style={[styles.ruleTitle, { color: colors.text }]}>{rule.label}</Text><Text style={[styles.ruleHint, { color: colors.textMuted }]}>{rule.hint}</Text></AnimatedPressable>)}</View>
        {splitType !== 'split_equally' && <><Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{splitType === 'you_owed_full' ? 'WHO OWES YOU?' : 'WHO PAID FOR YOU?'}</Text><AnimatedPressable onPress={() => setPanel(panel === 'member' ? null : 'member')} style={[styles.select, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.selectText, { color: counterpartyId ? colors.text : colors.textMuted }]}>{counterpartyId ? nameFor(counterpartyId) : 'Choose a member'}</Text><ChevronDown size={17} color={colors.textMuted} /></AnimatedPressable>{panel === 'member' && renderSelectorPanel('member')}</>}
      </View>}
      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
      <View style={styles.actions}><Button label="Cancel" variant="secondary" onPress={onClose} style={styles.action} /><Button label="Add expense" loading={saving} onPress={() => void submit()} style={styles.action} /></View>
    </ScrollView></ValidationFeedback></AppModal>
    <Modal visible={calendarOpen} transparent animationType="fade" onRequestClose={() => setCalendarOpen(false)}><Pressable onPress={() => setCalendarOpen(false)} style={[styles.calendarOverlay, { backgroundColor: colors.overlay }]}><Pressable onPress={() => {}} style={[styles.calendar, { borderColor: colors.border }]}><BlurView intensity={80} tint={theme === 'light' ? 'light' : 'dark'} style={StyleSheet.absoluteFill} /><CalendarDays size={28} color={colors.accent} /><Text style={[styles.calendarTitle, { color: colors.text }]}>Expense date</Text><View style={styles.dateStepper}><AnimatedPressable onPress={() => setDate(addDays(date, -1))} style={[styles.stepButton, { borderColor: colors.border }]}><ChevronLeft color={colors.text} /></AnimatedPressable><Text style={[styles.dateText, { color: colors.text }]}>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</Text><AnimatedPressable onPress={() => setDate(addDays(date, 1))} style={[styles.stepButton, { borderColor: colors.border }]}><ChevronRight color={colors.text} /></AnimatedPressable></View><View style={styles.calendarActions}><Button label="Today" variant="secondary" onPress={() => setDate(toDateKey(new Date()))} style={styles.action} /><Button label="Done" onPress={() => setCalendarOpen(false)} style={styles.action} /></View></Pressable></Pressable></Modal>
  </>;
}

const styles = StyleSheet.create({
  content: { gap: 15 }, title: { fontFamily: typography.display, fontSize: 29, fontWeight: '800' }, subtitle: { fontSize: 12, marginTop: 1 },
  inputCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  description: { minHeight: 58, paddingHorizontal: 16, fontSize: 18, borderBottomWidth: StyleSheet.hairlineWidth }, moneyRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }, currency: { fontSize: 30, fontWeight: '800' }, amount: { flex: 1, fontSize: 38, fontWeight: '700', paddingHorizontal: 10 },
  controlBar: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, iconButton: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 }, groupButton: { flex: 1, minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }, controlText: { fontWeight: '700', fontSize: 12 }, groupText: { flex: 1, textAlign: 'right', fontWeight: '700', fontSize: 12 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 }, category: { minHeight: 34, borderWidth: StyleSheet.hairlineWidth, borderRadius: 17, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' }, categoryText: { fontSize: 10, fontWeight: '700' }, noteInput: { minHeight: 46, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13, marginTop: 7 }, options: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 5, gap: 2 }, option: { minHeight: 42, borderRadius: 9, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, optionText: { fontWeight: '700' }, groupOptions: { gap: 9 }, sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 3 }, select: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectText: { fontWeight: '700' }, rules: { flexDirection: 'row', gap: 7 }, rule: { flex: 1, minHeight: 72, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, padding: 8, justifyContent: 'center' }, ruleTitle: { fontSize: 11, fontWeight: '700' }, ruleHint: { fontSize: 9, marginTop: 3, lineHeight: 12 }, error: { fontSize: 12, fontWeight: '700' }, actions: { flexDirection: 'row', gap: 10 }, action: { flex: 1 },
  calendarOverlay: { flex: 1, padding: 22, alignItems: 'center', justifyContent: 'center' }, calendar: { width: '100%', maxWidth: 400, borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 20, alignItems: 'center', gap: 15, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 }, calendarTitle: { fontFamily: typography.display, fontSize: 25, fontWeight: '800' }, dateStepper: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 }, stepButton: { width: 44, height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, dateText: { flex: 1, textAlign: 'center', fontWeight: '700', fontSize: 13 }, calendarActions: { flexDirection: 'row', gap: 10, width: '100%' },
});
