import { Plus, Search, Settings2, Trash2, Users } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { AddExpenseModal } from '@/components/finance/AddExpenseModal';
import { GroupModal } from '@/components/finance/GroupModal';
import { useFloatingTabBarMetrics } from '@/components/navigation/FloatingTabBar';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Screen } from '@/components/ui/Screen';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';
import { collapseOut } from '@/constants/animations';
import { motion, typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useExpenses } from '@/hooks/useExpenses';
import { useGroups } from '@/hooks/useGroups';
import { useScrollBoundaryHaptics } from '@/hooks/useScrollBoundaryHaptics';
import type { ExpenseWithSplits } from '@/types/database';
import { toDateKey } from '@/utils/dates';

type Mode = 'personal' | 'group';
const currency = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Math.abs(value));

export function FinanceScreen() {
  const router = useRouter();
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  const { colors, theme } = useTheme(); const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const { actionBottom, contentBottom } = useFloatingTabBarMetrics();
  const scrollHaptics = useScrollBoundaryHaptics();
  const [mode, setMode] = useState<Mode>('personal'); const [search, setSearch] = useState(''); const [groupId, setGroupId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false); const [groupsOpen, setGroupsOpen] = useState(false);
  useEffect(() => {
    if (compose !== 'expense') return;
    setAddOpen(true);
    router.setParams({ compose: undefined });
  }, [compose, router]);
  const groupsHook = useGroups();
  const range = useMemo(() => { const now = new Date(); return { startDate: toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }; }, []);
  const expensesHook = useExpenses({ ...range, personalOnly: mode === 'personal', groupOnly: mode === 'group' && !groupId, groupId: mode === 'group' ? groupId ?? undefined : undefined, search: search || undefined });

  const changeMode = (next: Mode) => { setMode(next); setSearch(''); if (next === 'personal') setGroupId(null); };
  const remove = (expense: ExpenseWithSplits) => {
    const deleteExpense = () => void expensesHook.deleteExpense(expense.id);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Delete expense?\n\n${expense.description}`)) deleteExpense();
      return;
    }
    Alert.alert('Delete expense?', expense.description, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deleteExpense },
    ]);
  };
  const payerName = (expense: ExpenseWithSplits) => {
    if (expense.paid_by === user?.id) return 'You paid';
    const member = expense.group_id ? groupsHook.membersByGroup[expense.group_id]?.find((item) => item.user_id === expense.paid_by) : undefined;
    return `${member?.profile.username ?? member?.profile.email ?? 'A member'} paid`;
  };

  const renderExpense = ({ item, index }: { item: ExpenseWithSplits; index: number }) => {
    const yourSplit = item.splits.find((split) => split.user_id === user?.id); const youPaid = item.paid_by === user?.id;
    const effect = item.group_id ? (youPaid ? item.splits.filter((split) => !split.is_settled && split.user_id !== user?.id).reduce((sum, split) => sum + Number(split.amount_owed), 0) : (!yourSplit?.is_settled ? -Number(yourSplit?.amount_owed ?? 0) : 0)) : -Number(item.amount);
    const transaction = <View style={[styles.transaction, { backgroundColor: colors.card, borderColor: colors.border }]}> 
      <View style={[styles.transactionDateBlock, { backgroundColor: colors.accentSoft }]}><Text style={[styles.transactionDate, { color: colors.accent }]}>{new Date(`${item.expense_date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text></View>
      <View style={styles.transactionMain}><Text numberOfLines={2} style={[styles.transactionTitle, { color: colors.text }]}>{item.description}</Text><Text numberOfLines={1} style={[styles.transactionMeta, { color: colors.textMuted }]}>{item.category} · {item.group_id ? groupsHook.groups.find((group) => group.id === item.group_id)?.name ?? 'Group' : 'Personal'} · {payerName(item)}</Text></View>
      <View style={styles.amountColumn}><Text style={[styles.transactionAmount, { color: effect > 0 ? colors.success : colors.text }]}>{effect > 0 ? '+' : effect < 0 ? '−' : ''}{currency(effect)}</Text>{item.group_id && <Text style={[styles.share, { color: colors.textMuted }]}>total {currency(Number(item.amount))}</Text>}</View>
      <AnimatedPressable accessibilityLabel={`Delete ${item.description}`} onPress={() => remove(item)} hitSlop={8} style={styles.delete}><Trash2 size={15} color={colors.textMuted} /></AnimatedPressable>
    </View>;
    const animatedTransaction = <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(Math.min(index, 10) * motion.stagger).duration(260)} exiting={reduceMotion ? undefined : collapseOut}>{transaction}</Animated.View>;
    if (Platform.OS === 'web') return animatedTransaction;
    return <Swipeable overshootRight={false} renderRightActions={() => <AnimatedPressable accessibilityLabel={`Delete ${item.description}`} onPress={() => remove(item)} style={[styles.swipeDelete, { backgroundColor: colors.danger }]}><Trash2 size={20} color="#FFF" /><Text style={styles.swipeText}>Delete</Text></AnimatedPressable>}>{animatedTransaction}</Swipeable>;
  };

  return <Screen contentStyle={[styles.screen, { paddingBottom: contentBottom }]}> 
    <View style={styles.header}><View><Text style={[styles.title, { color: colors.text }]}>Money, made clear.</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>Your month at a glance</Text></View><AnimatedPressable accessibilityLabel="Manage groups" onPress={() => setGroupsOpen(true)} style={[styles.manage, { backgroundColor: colors.card, borderColor: colors.border }]}><Users size={20} color={colors.accent} /><Settings2 size={13} color={colors.textMuted} /></AnimatedPressable></View>
    <SlidingSegmentedControl value={mode} onChange={changeMode} options={[{ value: 'personal', label: 'Personal Expenses' }, { value: 'group', label: 'Group Expenses' }]} />
    <View style={[
      styles.summary,
      theme === 'light' && styles.summaryLight,
      {
        backgroundColor: theme === 'light' && mode === 'personal' ? '#E8F0FE' : mode === 'personal' ? colors.accentSoft : colors.cardElevated,
        borderColor: theme === 'light' ? colors.border : colors.accent,
      },
    ]}>
      <View><Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{mode === 'personal' ? 'MONTHLY TOTAL' : 'YOUR NET BALANCE'}</Text><Text style={[styles.summaryAmount, { color: mode === 'group' && expensesHook.balance.net < 0 ? colors.danger : colors.text }]}>{mode === 'group' && expensesHook.balance.net < 0 ? '−' : ''}{currency(mode === 'personal' ? expensesHook.total : expensesHook.balance.net)}</Text></View>
      {mode === 'personal' ? <Text style={[styles.summaryNote, { color: colors.textMuted }]}>{new Date().toLocaleDateString(undefined, { month: 'long' })}</Text> : <View style={styles.balanceBreakdown}><Text style={[styles.owed, { color: colors.success }]}>Owed {currency(expensesHook.balance.owedToYou)}</Text><Text style={[styles.owe, { color: colors.danger }]}>Owe {currency(expensesHook.balance.youOwe)}</Text></View>}
    </View>
    {mode === 'group' && <View><FlatList horizontal data={[{ id: '', name: 'All groups' }, ...groupsHook.groups]} keyExtractor={(item) => item.id || 'all'} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} renderItem={({ item }) => <AnimatedPressable onPress={() => setGroupId(item.id || null)} style={[styles.filterChip, { backgroundColor: (groupId ?? '') === item.id ? colors.accentSoft : colors.card, borderColor: (groupId ?? '') === item.id ? colors.accent : colors.border }]}><Text style={[styles.filterText, { color: colors.text }]}>{item.name}</Text></AnimatedPressable>} /></View>}
    <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}><Search size={17} color={colors.textMuted} /><TextInput accessibilityLabel="Search expenses" value={search} onChangeText={setSearch} placeholder="Search this month" placeholderTextColor={colors.textMuted} style={[styles.searchInput, { color: colors.text }]} /></View>
    <View style={styles.listHeader}><Text style={[styles.listTitle, { color: colors.text }]}>Recent transactions</Text><Text style={[styles.listCount, { color: colors.textMuted }]}>{expensesHook.expenses.length} entries</Text></View>
    {expensesHook.loading && expensesHook.expenses.length === 0 ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : <FlatList data={expensesHook.expenses} keyExtractor={(item) => item.id} renderItem={renderExpense} contentContainerStyle={[styles.list, expensesHook.expenses.length === 0 && styles.emptyList]} onScrollBeginDrag={scrollHaptics.onScrollBeginDrag} onScroll={scrollHaptics.onScroll} scrollEventThrottle={16} refreshControl={<RefreshControl refreshing={expensesHook.loading} onRefresh={() => { scrollHaptics.refreshImpact(); void expensesHook.refresh(); }} tintColor={colors.accent} />} ListEmptyComponent={<View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing logged here yet.</Text><Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>Tap + to add the first expense.</Text></View>} />}
    {expensesHook.error && <Text style={[styles.error, { color: colors.danger }]}>{expensesHook.error}</Text>}
    <AnimatedPressable accessibilityLabel="Add expense" onPress={() => setAddOpen(true)} style={[styles.fab, { bottom: actionBottom, backgroundColor: colors.accent }]}><Plus size={27} color={colors.buttonText} strokeWidth={2.5} /></AnimatedPressable>
    <AddExpenseModal visible={addOpen} groups={groupsHook.groups} membersByGroup={groupsHook.membersByGroup} onClose={() => setAddOpen(false)} onCreate={expensesHook.createExpense} />
    <GroupModal visible={groupsOpen} groups={groupsHook.groups} membersByGroup={groupsHook.membersByGroup} onClose={() => setGroupsOpen(false)} onCreateGroup={groupsHook.createGroup} onSearchProfiles={groupsHook.searchProfiles} onAddMember={groupsHook.addMember} onRemoveMember={groupsHook.removeMember} onGetBalances={groupsHook.getGroupBalances} />
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: 16, paddingBottom: 96, gap: 12 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontFamily: typography.display, fontSize: 29, fontWeight: '800' }, subtitle: { fontSize: 12, marginTop: 1 }, manage: { width: 50, height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1 }, segment: { height: 46, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 3, flexDirection: 'row' }, segmentButton: { flex: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, segmentText: { fontSize: 11, fontWeight: '700' }, summary: { minHeight: 102, borderWidth: StyleSheet.hairlineWidth, borderRadius: 19, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 }, summaryLight: { shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 0 }, summaryLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 }, summaryAmount: { fontSize: 34, fontWeight: '700', marginTop: 3 }, summaryNote: { fontSize: 12, fontWeight: '700' }, balanceBreakdown: { alignItems: 'flex-end', gap: 4 }, owed: { fontSize: 11, fontWeight: '700' }, owe: { fontSize: 11, fontWeight: '700' }, filters: { gap: 7 }, filterChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 }, filterText: { fontSize: 10, fontWeight: '700' }, search: { minHeight: 43, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, searchInput: { flex: 1, fontSize: 13 }, listHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }, listTitle: { fontSize: 15, fontWeight: '700' }, listCount: { fontSize: 10, fontWeight: '700' }, list: { gap: 7, paddingBottom: 80 }, emptyList: { flexGrow: 1 }, transaction: { minHeight: 74, borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9 }, transactionDateBlock: { width: 48, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, transactionMain: { flex: 1, minWidth: 0 }, transactionDate: { fontSize: 10, fontWeight: '800' }, transactionTitle: { fontSize: 13, fontWeight: '700' }, transactionMeta: { fontSize: 9, marginTop: 3 }, amountColumn: { alignItems: 'flex-end' }, transactionAmount: { fontSize: 14, fontWeight: '800' }, share: { fontSize: 8, marginTop: 3 }, delete: { padding: 3 }, swipeDelete: { width: 82, marginLeft: 6, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 3 }, swipeText: { color: '#FFF', fontSize: 10, fontWeight: '700' }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { fontFamily: typography.display, fontSize: 22, fontWeight: '700' }, emptySubtitle: { fontSize: 11 }, loader: { marginTop: 40 }, error: { position: 'absolute', bottom: 87, left: 20, fontSize: 11, fontWeight: '700' }, fab: { position: 'absolute', right: 22, bottom: 100, width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
