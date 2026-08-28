import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { calculateUserBalance } from '@/hooks/useExpenses';
import { supabase } from '@/services/supabase';
import type { Expense, ExpenseSplit, ExpenseWithSplits, Group, GroupMemberProfile, Profile } from '@/types/database';

export type GroupBalance = { userId: string; owedToUser: number; userOwes: number; net: number };

export function useGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [membersByGroup, setMembersByGroup] = useState<Record<string, GroupMemberProfile[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) { setGroups([]); setMembersByGroup({}); return; }
    setLoading(true); setError(null);
    try {
      const { data: groupRows, error: groupsError } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
      if (groupsError) throw groupsError;
      const nextGroups = groupRows ?? [];
      setGroups(nextGroups);
      if (nextGroups.length === 0) { setMembersByGroup({}); return; }
      const ids = nextGroups.map((group) => group.id);
      const { data: memberships, error: membersError } = await supabase.from('group_members').select('*').in('group_id', ids);
      if (membersError) throw membersError;
      const userIds = [...new Set((memberships ?? []).map((member) => member.user_id))];
      const { data: profiles, error: profilesError } = userIds.length
        ? await supabase.from('profiles').select('*').in('id', userIds)
        : { data: [] as Profile[], error: null };
      if (profilesError) throw profilesError;
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const grouped: Record<string, GroupMemberProfile[]> = {};
      for (const member of memberships ?? []) {
        const profile = profileMap.get(member.user_id);
        if (profile) grouped[member.group_id] = [...(grouped[member.group_id] ?? []), { ...member, profile }];
      }
      setMembersByGroup(grouped);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load groups.');
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const createGroup = useCallback(async (name: string) => {
    if (!user) throw new Error('Sign in to create a group.');
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Give the group a name.');
    const { data, error: createError } = await supabase.from('groups').insert({ name: trimmed, created_by: user.id }).select().single();
    if (createError) throw createError;
    await refresh();
    return data;
  }, [user, refresh]);

  const searchProfiles = useCallback(async (query: string) => {
    const term = query.trim().replace(/[%_,()]/g, '');
    if (term.length < 2) return [];
    const { data, error: searchError } = await supabase.from('profiles').select('*')
      .or(`username.ilike.%${term}%,email.ilike.%${term}%`).limit(12);
    if (searchError) throw searchError;
    return (data ?? []).filter((profile) => profile.id !== user?.id);
  }, [user?.id]);

  const addMember = useCallback(async (groupId: string, userId: string) => {
    const { error: addError } = await supabase.from('group_members').insert({ group_id: groupId, user_id: userId });
    if (addError && addError.code !== '23505') throw addError;
    await refresh();
  }, [refresh]);

  const removeMember = useCallback(async (groupId: string, userId: string) => {
    const { error: removeError } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
    if (removeError) throw removeError;
    await refresh();
  }, [refresh]);

  const getGroupBalances = useCallback(async (groupId: string): Promise<GroupBalance[]> => {
    const { data: expenseRows, error: expensesError } = await supabase.from('expenses').select('*').eq('group_id', groupId);
    if (expensesError) throw expensesError;
    const typedExpenses = (expenseRows ?? []) as Expense[];
    if (typedExpenses.length === 0) return (membersByGroup[groupId] ?? []).map((member) => ({ userId: member.user_id, owedToUser: 0, userOwes: 0, net: 0 }));
    const { data: splitRows, error: splitsError } = await supabase.from('expense_splits').select('*').in('expense_id', typedExpenses.map((expense) => expense.id));
    if (splitsError) throw splitsError;
    const splits = (splitRows ?? []) as ExpenseSplit[];
    const withSplits: ExpenseWithSplits[] = typedExpenses.map((expense) => ({ ...expense, splits: splits.filter((split) => split.expense_id === expense.id) }));
    return (membersByGroup[groupId] ?? []).map((member) => {
      const balance = calculateUserBalance(withSplits, member.user_id);
      return { userId: member.user_id, owedToUser: balance.owedToYou, userOwes: balance.youOwe, net: balance.net };
    });
  }, [membersByGroup]);

  return { groups, membersByGroup, loading, error, refresh, createGroup, searchProfiles, addMember, removeMember, getGroupBalances };
}
