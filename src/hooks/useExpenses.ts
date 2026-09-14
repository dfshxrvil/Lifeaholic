import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildCreateLedger,
  buildUpdateLedger,
  calculateExpenseTotal,
  calculateSplitDistributions,
  calculateUserBalance,
  expenseErrorMessage,
  type CreateExpenseInput,
  type SplitDraft,
  type UpdateExpenseInput,
} from '@/features/finance/domain';
import { FinanceRepository, type ExpenseFilters } from '@/features/finance/repository';
import { supabase } from '@/services/supabase';
import type { ExpenseWithSplits } from '@/types/database';

export type { CreateExpenseInput, ExpenseFilters, SplitDraft, UpdateExpenseInput };
export { calculateSplitDistributions, calculateUserBalance };

const repository = new FinanceRepository(supabase);

export function useExpenses(filters: ExpenseFilters = {}) {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseWithSplits[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterKey = JSON.stringify(filters);
  const scope = `${user?.id ?? ''}:${filterKey}`;
  const currentScope = useRef(scope);
  const requestVersion = useRef(0);

  useLayoutEffect(() => {
    currentScope.current = scope;
    requestVersion.current += 1;
  }, [scope]);

  const refresh = useCallback(async () => {
    if (currentScope.current !== scope) return;
    const version = ++requestVersion.current;
    const isCurrent = () => currentScope.current === scope && requestVersion.current === version;
    if (!user) {
      setExpenses([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loaded = await repository.listExpenses(filters);
      if (isCurrent()) setExpenses(loaded);
    } catch (cause) {
      if (isCurrent()) setError(expenseErrorMessage(cause, 'Unable to load expenses.'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  // filterKey stabilizes callers that construct a filter object during render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, filterKey]);

  useEffect(() => {
    setExpenses([]);
    void refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh]);

  const createExpense = useCallback(async (input: CreateExpenseInput) => {
    if (!user) throw new Error('Sign in to add an expense.');
    const write = buildCreateLedger(input, user.id, input.requestId ?? randomUUID());
    const saved = await repository.saveExpense(write);
    await refresh();
    return saved;
  }, [user, refresh]);

  const updateExpense = useCallback(async (expenseId: string, updates: UpdateExpenseInput) => {
    if (!user) throw new Error('Sign in to update an expense.');
    const existing = expenses.find((expense) => expense.id === expenseId);
    if (!existing) throw new Error('Expense not found.');
    await repository.saveExpense(buildUpdateLedger(existing, updates, user.id));
    await refresh();
  }, [user, expenses, refresh]);

  const deleteExpense = useCallback(async (expenseId: string) => {
    setError(null);
    try {
      await repository.deleteExpense(expenseId);
      setExpenses((current) => current.filter((expense) => expense.id !== expenseId));
    } catch (cause) {
      setError(expenseErrorMessage(cause, 'Unable to delete expense.'));
    }
  }, []);

  const balance = useMemo(
    () => user ? calculateUserBalance(expenses, user.id) : { owedToYou: 0, youOwe: 0, net: 0 },
    [expenses, user],
  );
  const total = useMemo(() => calculateExpenseTotal(expenses), [expenses]);
  return { expenses, loading, error, total, balance, refresh, createExpense, updateExpense, deleteExpense };
}
