import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { calculateUserBalance, expenseErrorMessage } from '@/features/finance/domain';
import { FinanceRepository } from '@/features/finance/repository';
import { supabase } from '@/services/supabase';
import type { Group, GroupMemberProfile, Profile } from '@/types/database';

export type GroupBalance = { userId: string; owedToUser: number; userOwes: number; net: number };

const repository = new FinanceRepository(supabase);

export function useGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [membersByGroup, setMembersByGroup] = useState<Record<string, GroupMemberProfile[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeUser = useRef(user?.id ?? '');
  const requestVersion = useRef(0);

  useLayoutEffect(() => {
    activeUser.current = user?.id ?? '';
    requestVersion.current += 1;
  }, [user?.id]);

  const refresh = useCallback(async () => {
    const userId = user?.id ?? '';
    const version = ++requestVersion.current;
    const isCurrent = () => activeUser.current === userId && requestVersion.current === version;
    if (!userId) {
      setGroups([]);
      setMembersByGroup({});
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const directory = await repository.loadGroupDirectory();
      if (isCurrent()) {
        setGroups(directory.groups);
        setMembersByGroup(directory.membersByGroup);
      }
    } catch (cause) {
      if (isCurrent()) setError(expenseErrorMessage(cause, 'Unable to load groups.'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh]);

  const createGroup = useCallback(async (name: string) => {
    if (!user) throw new Error('Sign in to create a group.');
    const group = await repository.createGroup(name, user.id);
    await refresh();
    return group;
  }, [user, refresh]);

  const searchProfiles = useCallback(
    (query: string): Promise<Profile[]> => repository.searchProfiles(query, user?.id),
    [user?.id],
  );

  const addMember = useCallback(async (groupId: string, userId: string) => {
    await repository.addGroupMember(groupId, userId);
    await refresh();
  }, [refresh]);

  const removeMember = useCallback(async (groupId: string, userId: string) => {
    await repository.removeGroupMember(groupId, userId);
    await refresh();
  }, [refresh]);

  const getGroupBalances = useCallback(async (groupId: string): Promise<GroupBalance[]> => {
    const expenses = await repository.listExpenses({ groupId });
    return (membersByGroup[groupId] ?? []).map((member) => {
      const balance = calculateUserBalance(expenses, member.user_id);
      return { userId: member.user_id, owedToUser: balance.owedToYou, userOwes: balance.youOwe, net: balance.net };
    });
  }, [membersByGroup]);

  return { groups, membersByGroup, loading, error, refresh, createGroup, searchProfiles, addMember, removeMember, getGroupBalances };
}
