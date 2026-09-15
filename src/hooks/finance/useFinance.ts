import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { financeRepository } from '@/repositories/financeRepository';
import { notifyFinanceChanged, subscribeToFinanceChanges } from '@/services/finance/financeEvents';
import type {
  FinanceExpense,
  FinanceExpenseDraft,
  FinanceExpenseFilters,
  FinanceGroup,
  FinanceGroupBalances,
  FinanceGroupMember,
  FinanceId,
  FinanceInvitation,
  FinanceInviteCandidate,
  FinanceSettlementDraft,
} from '@/types/finance';

const errorMessage = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;

function useAuthBoundary(userId: string | undefined) {
  const [dataUserId, setDataUserId] = useState(userId);
  useEffect(() => setDataUserId(userId), [userId]);
  return dataUserId === userId;
}

function useRefreshSubscription(refresh: () => Promise<void>) {
  useEffect(() => subscribeToFinanceChanges(() => { void refresh(); }), [refresh]);
}

export function useFinanceGroups() {
  const { user } = useAuth();
  const currentAuth = useAuthBoundary(user?.id);
  const [groups, setGroups] = useState<FinanceGroup[]>([]);
  const [invitations, setInvitations] = useState<FinanceInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++version.current;
    if (!user?.id) { setGroups([]); setInvitations([]); setLoading(false); setError(null); return; }
    setLoading(true); setError(null);
    try {
      const [nextGroups, nextInvitations] = await Promise.all([financeRepository.listGroups(), financeRepository.listInvitations()]);
      if (request === version.current) { setGroups(nextGroups); setInvitations(nextInvitations); }
    } catch (cause) {
      if (request === version.current) setError(errorMessage(cause, 'Unable to load finance groups.'));
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { setGroups([]); setInvitations([]); setError(null); void refresh(); return () => { version.current += 1; }; }, [refresh]);
  useRefreshSubscription(refresh);
  return { groups: currentAuth ? groups : [], invitations: currentAuth ? invitations : [], loading, error: currentAuth ? error : null, refresh };
}

export function useGroupRoster(groupId: FinanceId | null | undefined) {
  const { user } = useAuth();
  const currentAuth = useAuthBoundary(user?.id);
  const [members, setMembers] = useState<FinanceGroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++version.current;
    if (!user?.id || !groupId) { setMembers([]); setLoading(false); setError(null); return; }
    setLoading(true); setError(null);
    try { const result = await financeRepository.getGroupRoster(groupId); if (request === version.current) setMembers(result); }
    catch (cause) { if (request === version.current) setError(errorMessage(cause, 'Unable to load the group roster.')); }
    finally { if (request === version.current) setLoading(false); }
  }, [groupId, user?.id]);
  useEffect(() => { setMembers([]); setError(null); void refresh(); return () => { version.current += 1; }; }, [refresh]);
  useRefreshSubscription(refresh);
  return { members: currentAuth ? members : [], loading, error: currentAuth ? error : null, refresh };
}

export function useFinanceExpenses(filters: FinanceExpenseFilters) {
  const { user } = useAuth();
  const currentAuth = useAuthBoundary(user?.id);
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [totalAmountMinor, setTotalAmountMinor] = useState(0n);
  const [nextCursor, setNextCursor] = useState<FinanceExpenseFilters['cursor']>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const scope = filters.scope;
  const monthStart = filters.monthStart;
  const groupId = filters.groupId ?? null;
  const search = filters.search?.trim() || null;
  const limit = filters.limit ?? 30;

  const refresh = useCallback(async () => {
    const request = ++version.current;
    if (!user?.id) { setExpenses([]); setTotalAmountMinor(0n); setNextCursor(null); setLoading(false); setError(null); return; }
    setLoading(true); setError(null);
    try {
      const page = await financeRepository.listExpenses({ scope, monthStart, groupId, search, limit, cursor: null });
      if (request === version.current) { setExpenses(page.entries); setTotalAmountMinor(page.totalAmountMinor); setNextCursor(page.nextCursor); }
    } catch (cause) { if (request === version.current) setError(errorMessage(cause, 'Unable to load expenses.')); }
    finally { if (request === version.current) setLoading(false); }
  }, [groupId, limit, monthStart, scope, search, user?.id]);

  const loadMore = useCallback(async () => {
    if (!user?.id || !nextCursor || loadingMore) return;
    const request = version.current;
    setLoadingMore(true);
    try {
      const page = await financeRepository.listExpenses({ scope, monthStart, groupId, search, limit, cursor: nextCursor });
      if (request === version.current) {
        setExpenses((current) => {
          const known = new Set(current.map((expense) => expense.id));
          return [...current, ...page.entries.filter((expense) => !known.has(expense.id))];
        });
        setNextCursor(page.nextCursor);
      }
    } catch (cause) { if (request === version.current) setError(errorMessage(cause, 'Unable to load more expenses.')); }
    finally { if (request === version.current) setLoadingMore(false); }
  }, [groupId, limit, loadingMore, monthStart, nextCursor, scope, search, user?.id]);

  useEffect(() => {
    setExpenses([]); setTotalAmountMinor(0n); setNextCursor(null); setError(null); void refresh();
    return () => { version.current += 1; };
  }, [refresh]);
  useRefreshSubscription(refresh);
  return { expenses: currentAuth ? expenses : [], totalAmountMinor: currentAuth ? totalAmountMinor : 0n, nextCursor: currentAuth ? nextCursor : null, loading, loadingMore, error: currentAuth ? error : null, refresh, loadMore };
}

export function useGroupBalances(groupId: FinanceId | null | undefined) {
  const { user } = useAuth();
  const currentAuth = useAuthBoundary(user?.id);
  const [balances, setBalances] = useState<FinanceGroupBalances | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++version.current;
    if (!user?.id || !groupId) { setBalances(null); setLoading(false); setError(null); return; }
    setLoading(true); setError(null);
    try { const result = await financeRepository.getGroupBalances(groupId); if (request === version.current) setBalances(result); }
    catch (cause) { if (request === version.current) setError(errorMessage(cause, 'Unable to load group balances.')); }
    finally { if (request === version.current) setLoading(false); }
  }, [groupId, user?.id]);
  useEffect(() => { setBalances(null); setError(null); void refresh(); return () => { version.current += 1; }; }, [refresh]);
  useRefreshSubscription(refresh);
  return { balances: currentAuth ? balances : null, loading, error: currentAuth ? error : null, refresh };
}

export function useCombinedGroupBalances(groupIds: readonly FinanceId[]) {
  const { user } = useAuth();
  const currentAuth = useAuthBoundary(user?.id);
  const key = [...groupIds].sort().join(',');
  const [balances, setBalances] = useState<FinanceGroupBalances | null>(null);
  const [loading, setLoading] = useState(false);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++version.current;
    const ids = key ? key.split(',') : [];
    if (!user?.id || !ids.length) { setBalances(null); setLoading(false); return; }
    setLoading(true);
    try {
      const values = await Promise.all(ids.map((id) => financeRepository.getGroupBalances(id)));
      if (request === version.current) setBalances({
        members: [], repayments: values.flatMap((value) => value.repayments),
        youOweMinor: values.reduce((sum, value) => sum + value.youOweMinor, 0n),
        owedToYouMinor: values.reduce((sum, value) => sum + value.owedToYouMinor, 0n),
        netAmountMinor: values.reduce((sum, value) => sum + value.netAmountMinor, 0n),
      });
    } catch { if (request === version.current) setBalances(null); }
    finally { if (request === version.current) setLoading(false); }
  }, [key, user?.id]);
  useEffect(() => { setBalances(null); void refresh(); return () => { version.current += 1; }; }, [refresh]);
  useRefreshSubscription(refresh);
  return { balances: currentAuth ? balances : null, loading, refresh };
}

export function useInviteCandidates(groupId: FinanceId | null | undefined, query: string) {
  const { user } = useAuth();
  const currentAuth = useAuthBoundary(user?.id);
  const [candidates, setCandidates] = useState<FinanceInviteCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const normalized = query.trim();
    if (!user?.id || !groupId || normalized.length < 3) { setCandidates([]); setLoading(false); setError(null); return; }
    setLoading(true); setError(null);
    const timer = setTimeout(() => {
      void financeRepository.searchInviteCandidates(groupId, normalized).then((result) => { if (active) setCandidates(result); })
        .catch((cause) => { if (active) setError(errorMessage(cause, 'Unable to search for members.')); })
        .finally(() => { if (active) setLoading(false); });
    }, 280);
    return () => { active = false; clearTimeout(timer); };
  }, [groupId, query, user?.id]);
  return { candidates: currentAuth ? candidates : [], loading, error: currentAuth ? error : null };
}

function stableValue(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${key}:${stableValue(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

function useIdempotentMutation() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = useRef<{ fingerprint: string; key: string } | null>(null);
  const inFlight = useRef<{ fingerprint: string; promise: Promise<unknown> } | null>(null);
  const beginAction = useCallback(() => { action.current = { fingerprint: '', key: randomUUID() }; setError(null); }, []);
  const resetAction = useCallback(() => { action.current = null; inFlight.current = null; setError(null); setLoading(false); }, []);
  useEffect(() => resetAction(), [resetAction, user?.id]);
  const run = useCallback(async <T,>(input: unknown, operation: (idempotencyKey: string) => Promise<T>): Promise<T> => {
    const fingerprint = stableValue(input);
    if (inFlight.current?.fingerprint === fingerprint) return inFlight.current.promise as Promise<T>;
    if (!action.current || (action.current.fingerprint && action.current.fingerprint !== fingerprint)) action.current = { fingerprint, key: randomUUID() };
    else action.current.fingerprint = fingerprint;
    const key = action.current.key;
    setLoading(true); setError(null);
    const promise = operation(key);
    inFlight.current = { fingerprint, promise };
    try {
      const result = await promise;
      action.current = null;
      notifyFinanceChanged();
      return result;
    } catch (cause) {
      setError(errorMessage(cause, 'Finance operation failed.'));
      throw cause;
    } finally {
      if (inFlight.current?.promise === promise) { inFlight.current = null; setLoading(false); }
    }
  }, []);
  return { loading, error, beginAction, resetAction, run };
}

export function useExpenseMutations() {
  const mutation = useIdempotentMutation();
  return {
    loading: mutation.loading, error: mutation.error,
    beginAction: mutation.beginAction, resetAction: mutation.resetAction,
    createExpense: (input: Omit<FinanceExpenseDraft, 'idempotencyKey'>) => mutation.run(input, (key) => financeRepository.createExpense({ ...input, idempotencyKey: key })),
    editExpense: (expenseId: FinanceId, input: Omit<FinanceExpenseDraft, 'idempotencyKey'>) => mutation.run({ expenseId, input }, (key) => financeRepository.editExpense(expenseId, { ...input, idempotencyKey: key })),
    archiveExpense: (expenseId: FinanceId) => mutation.run({ expenseId }, (key) => financeRepository.archiveExpense(expenseId, key)),
  };
}

export function useGroupMutations() {
  const mutation = useIdempotentMutation();
  return {
    loading: mutation.loading, error: mutation.error,
    createGroup: (name: string) => mutation.run({ name: name.trim() }, (key) => financeRepository.createGroup(name, key)),
    archiveGroup: (groupId: FinanceId) => mutation.run({ groupId }, (key) => financeRepository.archiveGroup(groupId, key)),
    inviteMember: (groupId: FinanceId, userId: FinanceId) => mutation.run({ groupId, userId }, (key) => financeRepository.inviteMember(groupId, userId, key)),
    respondToInvitation: (invitationId: FinanceId, accept: boolean) => mutation.run({ invitationId, accept }, (key) => financeRepository.respondToInvitation(invitationId, accept, key)),
    removeMember: (groupId: FinanceId, userId: FinanceId) => mutation.run({ groupId, userId }, (key) => financeRepository.removeMember(groupId, userId, key)),
  };
}

export function useSettlementMutations() {
  const mutation = useIdempotentMutation();
  return {
    loading: mutation.loading, error: mutation.error,
    recordSettlement: (input: Omit<FinanceSettlementDraft, 'idempotencyKey'>) => mutation.run(input, (key) => financeRepository.recordSettlement({ ...input, idempotencyKey: key })),
    reverseSettlement: (settlementId: FinanceId, reason: string) => mutation.run({ settlementId, reason }, (key) => financeRepository.reverseSettlement(settlementId, reason, key)),
  };
}
