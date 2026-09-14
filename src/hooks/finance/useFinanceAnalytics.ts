import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  calculateMonthlyAnalytics,
  getCategoryBreakdown,
  getDailySpendSeries,
  getDaysInMonth,
  getSpendingSourceBreakdown,
  getTopOutflows,
} from '@/domain/finance/analytics';
import { financeRepository } from '@/repositories/financeRepository';
import { subscribeToFinanceChanges } from '@/services/finance/financeEvents';
import type { FinanceExpense, FinanceExpenseFilters, FinanceId } from '@/types/finance';
import { toDateKey } from '@/utils/dates';

export type FinanceAnalyticsScope = 'personal' | 'group';

function previousMonthStart(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year!, monthNumber! - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

async function listAllExpenses(filters: Omit<FinanceExpenseFilters, 'cursor' | 'limit' | 'search'>): Promise<FinanceExpense[]> {
  const expenses: FinanceExpense[] = [];
  let cursor: FinanceExpenseFilters['cursor'] = null;
  const seenCursors = new Set<string>();
  do {
    const page = await financeRepository.listExpenses({ ...filters, cursor, limit: 100, search: null });
    expenses.push(...page.entries);
    cursor = page.nextCursor;
    if (cursor) {
      const key = `${cursor.expenseDate}|${cursor.createdAt}|${cursor.id}`;
      if (seenCursors.has(key)) throw new Error('Expense pagination returned a repeated cursor.');
      seenCursors.add(key);
    }
  } while (cursor);
  return expenses;
}

export function useFinanceAnalytics({ month, scope, groupId }: { month: string; scope: FinanceAnalyticsScope; groupId?: FinanceId | null }) {
  const { user } = useAuth();
  const [personalExpenses, setPersonalExpenses] = useState<FinanceExpense[]>([]);
  const [groupExpenses, setGroupExpenses] = useState<FinanceExpense[]>([]);
  const [previousExpenses, setPreviousExpenses] = useState<FinanceExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const monthStart = `${month}-01`;
  const selectedGroupId = scope === 'group' ? groupId ?? null : null;

  const refresh = useCallback(async () => {
    const request = ++version.current;
    if (!user?.id) { setPersonalExpenses([]); setGroupExpenses([]); setPreviousExpenses([]); setLoading(false); setError(null); return; }
    setLoading(true); setError(null);
    try {
      const [personal, group, previous] = await Promise.all([
        listAllExpenses({ scope: 'personal', monthStart, groupId: null }),
        listAllExpenses({ scope: 'group', monthStart, groupId: selectedGroupId }),
        listAllExpenses({ scope, monthStart: previousMonthStart(month), groupId: selectedGroupId }),
      ]);
      if (request === version.current) { setPersonalExpenses(personal); setGroupExpenses(group); setPreviousExpenses(previous); }
    } catch (cause) {
      if (request === version.current) setError(cause instanceof Error ? cause.message : 'Unable to load financial analytics.');
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [month, monthStart, scope, selectedGroupId, user?.id]);

  useEffect(() => { setPersonalExpenses([]); setGroupExpenses([]); setPreviousExpenses([]); setError(null); void refresh(); return () => { version.current += 1; }; }, [refresh]);
  useEffect(() => subscribeToFinanceChanges(() => { void refresh(); }), [refresh]);

  const activeExpenses = scope === 'personal' ? personalExpenses : groupExpenses;
  const analyticsUserId = scope === 'group' ? user?.id : undefined;
  const result = {
    expenses: activeExpenses,
    monthly: calculateMonthlyAnalytics(activeExpenses, month, previousExpenses, { userId: analyticsUserId, referenceDate: toDateKey(new Date()) }),
    categories: getCategoryBreakdown(activeExpenses, analyticsUserId),
    daily: getDailySpendSeries(activeExpenses, getDaysInMonth(month), analyticsUserId),
    topOutflows: getTopOutflows(activeExpenses, 3, analyticsUserId),
    sources: user?.id ? getSpendingSourceBreakdown(personalExpenses, groupExpenses, user.id) : { personalMinor: 0n, groupShareMinor: 0n, totalMinor: 0n, personalShareBasisPoints: 0n, groupShareBasisPoints: 0n },
  };

  return { ...result, loading, error, refresh };
}
