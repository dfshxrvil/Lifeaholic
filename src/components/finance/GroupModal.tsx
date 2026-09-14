import { Check, Crown, Plus, Search, Trash2, UserPlus, Users, WalletCards, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { AppModal } from '@/components/ui/AppModal';
import { Button } from '@/components/ui/Button';
import { FormInput } from '@/components/ui/FormInput';
import { typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { formatPaiseAsInr } from '@/domain/finance';
import { useFinanceGroups, useGroupBalances, useGroupMutations, useGroupRoster, useInviteCandidates, useSettlementMutations } from '@/hooks/finance/useFinance';
import { toDateKey } from '@/utils/dates';

type Props = { visible: boolean; onClose: () => void };

export function GroupModal({ visible, onClose }: Props) {
  const { colors } = useTheme(); const { user } = useAuth();
  const groupsQuery = useFinanceGroups(); const groupMutation = useGroupMutations(); const settlementMutation = useSettlementMutations();
  const [selectedId, setSelectedId] = useState<string | null>(null); const [newName, setNewName] = useState(''); const [query, setQuery] = useState(''); const [message, setMessage] = useState<string | null>(null);
  const selected = groupsQuery.groups.find((group) => group.id === selectedId) ?? null;
  const roster = useGroupRoster(selectedId); const balances = useGroupBalances(selectedId); const search = useInviteCandidates(selectedId, query);
  const busy = groupMutation.loading || settlementMutation.loading;

  useEffect(() => { if (visible && !selectedId && groupsQuery.groups[0]) setSelectedId(groupsQuery.groups[0].id); }, [groupsQuery.groups, selectedId, visible]);
  useEffect(() => { if (!visible) { setQuery(''); setMessage(null); } }, [visible]);
  const nameFor = (id: string) => id === user?.id ? 'You' : roster.members.find((member) => member.userId === id)?.username ?? 'Member';
  const create = async () => {
    if (!newName.trim()) return;
    try { const group = await groupMutation.createGroup(newName); setNewName(''); setSelectedId(group.id); setMessage('Group created.'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to create group.'); }
  };
  const invite = async (candidateId: string) => {
    if (!selectedId) return;
    try { await groupMutation.inviteMember(selectedId, candidateId); setQuery(''); setMessage('Invitation sent.'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to send invitation.'); }
  };
  const respond = async (invitationId: string, accept: boolean) => {
    try { await groupMutation.respondToInvitation(invitationId, accept); setMessage(accept ? 'Invitation accepted.' : 'Invitation declined.'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to answer invitation.'); }
  };
  const settle = async (payeeId: string, amountMinor: bigint) => {
    if (!selectedId) return;
    try { await settlementMutation.recordSettlement({ groupId: selectedId, payeeId, amountMinor, settlementDate: toDateKey(new Date()), note: null }); setMessage('Settlement recorded.'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to record settlement.'); }
  };

  return <AppModal visible={visible} onClose={busy ? () => {} : onClose}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={styles.headingRow}><View><Text style={[styles.title, { color: colors.text }]}>Your groups</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>Invite people and see who’s square.</Text></View><Users size={29} color={colors.accent} /></View>
    {groupsQuery.invitations.map((invitation) => <View key={invitation.id} style={[styles.invitation, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.flex}><Text style={[styles.memberName, { color: colors.text }]}>{invitation.groupName}</Text><Text style={[styles.memberEmail, { color: colors.textMuted }]}>Invited by {invitation.inviterUsername ?? 'a group owner'}</Text></View><AnimatedPressable accessibilityLabel="Decline invitation" disabled={busy} onPress={() => void respond(invitation.id, false)} style={styles.inviteAction}><X size={18} color={colors.danger} /></AnimatedPressable><AnimatedPressable accessibilityLabel="Accept invitation" disabled={busy} onPress={() => void respond(invitation.id, true)} style={styles.inviteAction}><Check size={18} color={colors.success} /></AnimatedPressable></View>)}
    <View style={styles.createRow}><View style={styles.flex}><FormInput accessibilityLabel="New group name" value={newName} onChangeText={setNewName} placeholder="Trip, house, dinner…" /></View><Button label="" icon={Plus} loading={groupMutation.loading} disabled={!newName.trim()} onPress={() => void create()} style={styles.plusButton} /></View>
    {groupsQuery.groups.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupChips}>{groupsQuery.groups.map((group) => <AnimatedPressable key={group.id} onPress={() => { setSelectedId(group.id); setQuery(''); setMessage(null); }} style={[styles.groupChip, { backgroundColor: selectedId === group.id ? colors.accent : colors.card, borderColor: selectedId === group.id ? colors.accent : colors.border }]}><Text style={[styles.groupChipText, { color: selectedId === group.id ? colors.buttonText : colors.text }]}>{group.name}</Text></AnimatedPressable>)}</ScrollView>}
    {groupsQuery.loading && !groupsQuery.groups.length && <ActivityIndicator color={colors.accent} />}
    {!groupsQuery.loading && !selected && <View style={[styles.empty, { borderColor: colors.border }]}><Users size={30} color={colors.textMuted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Create your first group</Text><Text style={[styles.emptyText, { color: colors.textMuted }]}>Shared expenses and balances will live here.</Text></View>}
    {selected && <>
      <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>{selected.name} roster</Text><Text style={[styles.count, { color: colors.accent }]}>{roster.members.filter((member) => member.status === 'active').length} members</Text></View>
      {selected.role === 'owner' && <><View style={styles.searchRow}><Search size={18} color={colors.textMuted} /><View style={styles.flex}><FormInput accessibilityLabel="Invite by username or email" value={query} onChangeText={setQuery} placeholder="Search username or exact email" autoCapitalize="none" /></View></View>{search.loading && <ActivityIndicator color={colors.accent} />}{search.candidates.map((candidate) => <AnimatedPressable key={candidate.userId} disabled={busy} onPress={() => void invite(candidate.userId)} style={[styles.searchResult, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}><Text style={{ color: colors.accent, fontWeight: '900' }}>{(candidate.username ?? '?')[0]?.toUpperCase()}</Text></View><View style={styles.flex}><Text style={[styles.memberName, { color: colors.text }]}>{candidate.username ?? 'User'}</Text><Text style={[styles.memberEmail, { color: colors.textMuted }]}>{candidate.matchLabel}</Text></View><UserPlus size={19} color={colors.accent} /></AnimatedPressable>)}</>}
      <View style={styles.roster}>{roster.members.filter((member) => member.status === 'active').map((member) => { const balance = balances.balances?.members.find((item) => item.userId === member.userId)?.netAmountMinor ?? 0n; const isSelf = member.userId === user?.id; return <View key={member.userId} style={[styles.member, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}><Text style={{ color: colors.accent, fontWeight: '900' }}>{(member.username ?? '?')[0]?.toUpperCase()}</Text></View><View style={styles.flex}><View style={styles.nameRow}><Text style={[styles.memberName, { color: colors.text }]}>{isSelf ? 'You' : member.username ?? 'Member'}</Text>{member.role === 'owner' && <Crown size={13} color={colors.accent} />}</View><Text style={[styles.balance, { color: balance === 0n ? colors.textMuted : balance > 0n ? colors.success : colors.danger }]}>{balance === 0n ? 'Settled up' : balance > 0n ? `is owed ${formatPaiseAsInr(balance)}` : `owes ${formatPaiseAsInr(-balance)}`}</Text></View>{selected.role === 'owner' && member.role !== 'owner' && <AnimatedPressable accessibilityLabel={`Remove ${member.username ?? 'member'}`} disabled={busy || balance !== 0n} onPress={() => void groupMutation.removeMember(selected.id, member.userId).catch(() => undefined)} style={styles.remove}><Trash2 size={17} color={balance === 0n ? colors.danger : colors.textMuted} /></AnimatedPressable>}</View>; })}</View>
      <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>Settle balances</Text><WalletCards size={20} color={colors.accent} /></View>
      {!balances.loading && !balances.balances?.repayments.length && <Text style={[styles.emptyText, { color: colors.textMuted }]}>Everyone is settled up.</Text>}
      {balances.balances?.repayments.map((repayment, index) => <View key={`${repayment.payerId}-${repayment.payeeId}-${index}`} style={[styles.repayment, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.flex}><Text style={[styles.memberName, { color: colors.text }]}>{nameFor(repayment.payerId)} pays {nameFor(repayment.payeeId)}</Text><Text style={[styles.repaymentAmount, { color: colors.accent }]}>{formatPaiseAsInr(repayment.amountMinor)}</Text></View>{repayment.payerId === user?.id && <Button label="Record" loading={settlementMutation.loading} onPress={() => void settle(repayment.payeeId, repayment.amountMinor)} />}</View>)}
    </>}
    {(message || groupsQuery.error || roster.error || balances.error || search.error || groupMutation.error || settlementMutation.error) && <Text style={[styles.message, { color: message?.includes('created') || message?.includes('sent') || message?.includes('accepted') || message?.includes('recorded') ? colors.success : colors.danger }]}>{message || groupsQuery.error || roster.error || balances.error || search.error || groupMutation.error || settlementMutation.error}</Text>}
    <Button label="Done" variant="secondary" disabled={busy} onPress={onClose} />
  </ScrollView></AppModal>;
}

const styles = StyleSheet.create({
  content: { gap: 14 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontFamily: typography.display, fontSize: 29, fontWeight: '800' }, subtitle: { fontSize: 12 }, createRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 }, flex: { flex: 1 }, plusButton: { width: 52, paddingHorizontal: 0 }, groupChips: { gap: 7 }, groupChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 9 }, groupChipText: { fontWeight: '700', fontSize: 12 }, empty: { borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderRadius: 17, alignItems: 'center', padding: 25 }, emptyTitle: { fontWeight: '700', marginTop: 8 }, emptyText: { fontSize: 11, marginTop: 3 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { fontSize: 18, fontWeight: '700' }, count: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }, searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, searchResult: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, memberName: { fontSize: 13, fontWeight: '700' }, memberEmail: { fontSize: 10, marginTop: 2 }, roster: { gap: 8 }, member: { minHeight: 60, borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, balance: { fontSize: 10, fontWeight: '700', marginTop: 3 }, remove: { padding: 8 }, message: { fontWeight: '700', fontSize: 12 }, invitation: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }, inviteAction: { padding: 8 }, repayment: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }, repaymentAmount: { fontWeight: '800', marginTop: 3 },
});
