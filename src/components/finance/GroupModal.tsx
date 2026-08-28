import { Crown, Plus, Search, Trash2, UserPlus, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '@/components/ui/AppModal';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Button } from '@/components/ui/Button';
import { FormInput } from '@/components/ui/FormInput';
import { typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { GroupBalance } from '@/hooks/useGroups';
import type { Group, GroupMemberProfile, Profile } from '@/types/database';

type Props = {
  visible: boolean;
  groups: Group[];
  membersByGroup: Record<string, GroupMemberProfile[]>;
  onClose: () => void;
  onCreateGroup: (name: string) => Promise<Group>;
  onSearchProfiles: (query: string) => Promise<Profile[]>;
  onAddMember: (groupId: string, userId: string) => Promise<void>;
  onRemoveMember: (groupId: string, userId: string) => Promise<void>;
  onGetBalances: (groupId: string) => Promise<GroupBalance[]>;
};

const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Math.abs(amount));

export function GroupModal({ visible, groups, membersByGroup, onClose, onCreateGroup, onSearchProfiles, onAddMember, onRemoveMember, onGetBalances }: Props) {
  const { colors } = useTheme(); const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null); const [newName, setNewName] = useState('');
  const [query, setQuery] = useState(''); const [results, setResults] = useState<Profile[]>([]); const [balances, setBalances] = useState<GroupBalance[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const selected = groups.find((group) => group.id === selectedId) ?? null; const members = selectedId ? (membersByGroup[selectedId] ?? []) : [];

  useEffect(() => { if (visible && !selectedId && groups[0]) setSelectedId(groups[0].id); }, [visible, groups, selectedId]);
  useEffect(() => {
    if (!selectedId) { setBalances([]); return; }
    void onGetBalances(selectedId).then(setBalances).catch((cause) => setMessage(cause instanceof Error ? cause.message : 'Unable to load balances.'));
  }, [selectedId, membersByGroup, onGetBalances]);
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(() => void onSearchProfiles(query).then(setResults).catch((cause) => setMessage(cause instanceof Error ? cause.message : 'Search failed.')), 280);
    return () => clearTimeout(timer);
  }, [query, onSearchProfiles]);

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true); setMessage(null);
    try { const group = await onCreateGroup(newName); setSelectedId(group.id); setNewName(''); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to create group.'); }
    finally { setBusy(false); }
  };
  const add = async (profile: Profile) => {
    if (!selectedId) return;
    setBusy(true); setMessage(null);
    try { await onAddMember(selectedId, profile.id); setQuery(''); setResults([]); setMessage('Member added.'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to add member.'); }
    finally { setBusy(false); }
  };
  const existingIds = new Set(members.map((member) => member.user_id));

  return <AppModal visible={visible} onClose={onClose}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={styles.headingRow}><View><Text style={[styles.title, { color: colors.text }]}>Your groups</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>Invite people and see who’s square.</Text></View><Users size={29} color={colors.accent} /></View>
    <View style={styles.createRow}><View style={styles.flex}><FormInput accessibilityLabel="New group name" value={newName} onChangeText={setNewName} placeholder="Trip, house, dinner…" /></View><Button label="" icon={Plus} loading={busy} disabled={!newName.trim()} onPress={() => void create()} style={styles.plusButton} /></View>
    {groups.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupChips}>{groups.map((group) => <AnimatedPressable key={group.id} onPress={() => { setSelectedId(group.id); setQuery(''); }} style={[styles.groupChip, { backgroundColor: selectedId === group.id ? colors.accent : colors.card, borderColor: selectedId === group.id ? colors.accent : colors.border }]}><Text style={[styles.groupChipText, { color: selectedId === group.id ? colors.buttonText : colors.text }]}>{group.name}</Text></AnimatedPressable>)}</ScrollView>}
    {!selected && <View style={[styles.empty, { borderColor: colors.border }]}><Users size={30} color={colors.textMuted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Create your first group</Text><Text style={[styles.emptyText, { color: colors.textMuted }]}>Shared expenses and balances will live here.</Text></View>}
    {selected && <>
      <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>{selected.name} roster</Text><Text style={[styles.count, { color: colors.accent }]}>{members.length} members</Text></View>
      <View style={styles.searchRow}><Search size={18} color={colors.textMuted} /><View style={styles.flex}><FormInput accessibilityLabel="Invite by username or email" value={query} onChangeText={setQuery} placeholder="Search username or email" autoCapitalize="none" /></View></View>
      {results.filter((profile) => !existingIds.has(profile.id)).map((profile) => <AnimatedPressable key={profile.id} disabled={busy} onPress={() => void add(profile)} style={[styles.searchResult, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.avatar}><Text style={{ color: colors.accent, fontWeight: '900' }}>{(profile.username ?? profile.email ?? '?')[0]?.toUpperCase()}</Text></View><View style={styles.flex}><Text style={[styles.memberName, { color: colors.text }]}>{profile.username ?? 'No username'}</Text><Text style={[styles.memberEmail, { color: colors.textMuted }]}>{profile.email}</Text></View><UserPlus size={19} color={colors.accent} /></AnimatedPressable>)}
      <View style={styles.roster}>{members.map((member) => {
        const balance = balances.find((item) => item.userId === member.user_id); const isCreator = member.user_id === selected.created_by; const isSelf = member.user_id === user?.id;
        return <View key={member.user_id} style={[styles.member, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}><Text style={{ color: colors.accent, fontWeight: '900' }}>{(member.profile.username ?? member.profile.email ?? '?')[0]?.toUpperCase()}</Text></View><View style={styles.flex}><View style={styles.nameRow}><Text style={[styles.memberName, { color: colors.text }]}>{isSelf ? 'You' : member.profile.username ?? member.profile.email}</Text>{isCreator && <Crown size={13} color={colors.accent} />}</View><Text style={[styles.balance, { color: !balance?.net ? colors.textMuted : balance.net > 0 ? colors.success : colors.danger }]}>{!balance?.net ? 'Settled up' : balance.net > 0 ? `is owed ${money(balance.net)}` : `owes ${money(balance.net)}`}</Text></View>{selected.created_by === user?.id && !isCreator && <AnimatedPressable accessibilityLabel="Remove member" onPress={() => void onRemoveMember(selected.id, member.user_id)} style={styles.remove}><Trash2 size={17} color={colors.danger} /></AnimatedPressable>}</View>;
      })}</View>
    </>}
    {message && <Text style={[styles.message, { color: message.includes('added') ? colors.success : colors.danger }]}>{message}</Text>}
    <Button label="Done" variant="secondary" onPress={onClose} />
  </ScrollView></AppModal>;
}

const styles = StyleSheet.create({
  content: { gap: 14 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontFamily: typography.display, fontSize: 29, fontWeight: '800' }, subtitle: { fontSize: 12 }, createRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 }, flex: { flex: 1 }, plusButton: { width: 52, paddingHorizontal: 0 }, groupChips: { gap: 7 }, groupChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 9 }, groupChipText: { fontWeight: '700', fontSize: 12 }, empty: { borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderRadius: 17, alignItems: 'center', padding: 25 }, emptyTitle: { fontWeight: '700', marginTop: 8 }, emptyText: { fontSize: 11, marginTop: 3 }, sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }, sectionTitle: { fontSize: 18, fontWeight: '700' }, count: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }, searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, searchResult: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, memberName: { fontSize: 13, fontWeight: '700' }, memberEmail: { fontSize: 10, marginTop: 2 }, roster: { gap: 8 }, member: { minHeight: 60, borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, balance: { fontSize: 10, fontWeight: '700', marginTop: 3 }, remove: { padding: 8 }, message: { fontWeight: '700', fontSize: 12 },
});
