import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase';
import type { Expense, ExpenseCategory, ExpenseSplit, ExpenseSplitType, ExpenseWithSplits } from '@/types/database';

export type ExpenseFilters = {
  startDate?: string;
  endDate?: string;
  groupId?: string;
  personalOnly?: boolean;
  groupOnly?: boolean;
  search?: string;
};

export type SplitDraft = { userId: string; amount: number };
export type CreateExpenseInput = {
  description: string;
  amount: number;
  expenseDate: string;
  groupId?: string | null;
  paidBy?: string;
  splitType?: ExpenseSplitType;
  memberIds?: string[];
  counterpartyId?: string;
  customSplits?: SplitDraft[];
  category?: ExpenseCategory;
  customCategoryNote?: string | null;
};
export type UpdateExpenseInput = Partial<CreateExpenseInput>;

const cents = (value: number) => Math.round(value * 100);
const money = (value: number) => Math.round(value) / 100;

export function calculateSplitDistributions(input: {
  amount: number;
  splitType: ExpenseSplitType;
  currentUserId: string;
  memberIds?: string[];
  counterpartyId?: string;
  customSplits?: SplitDraft[];
}): SplitDraft[] {
  const totalCents = cents(input.amount);
  if (!Number.isFinite(totalCents) || totalCents <= 0) throw new Error('Amount must be greater than zero.');

  if (input.splitType === 'personal') return [{ userId: input.currentUserId, amount: money(totalCents) }];
  if (input.splitType === 'you_owed_full') {
    if (!input.counterpartyId) throw new Error('Choose who owes this expense.');
    return [{ userId: input.counterpartyId, amount: money(totalCents) }];
  }
  if (input.splitType === 'other_owed_full') return [{ userId: input.currentUserId, amount: money(totalCents) }];
  if (input.splitType === 'custom') {
    const splits = (input.customSplits ?? []).filter((split) => split.amount >= 0);
    if (splits.length === 0 || splits.reduce((sum, split) => sum + cents(split.amount), 0) !== totalCents) {
      throw new Error('Custom splits must add up to the expense total.');
    }
    return splits.map((split) => ({ ...split, amount: money(cents(split.amount)) }));
  }

  const members = [...new Set(input.memberIds ?? [])];
  if (members.length === 0) throw new Error('This group has no members.');
  const base = Math.floor(totalCents / members.length);
  let remainder = totalCents - base * members.length;
  return members.map((userId) => {
    const share = base + (remainder > 0 ? 1 : 0);
    remainder -= remainder > 0 ? 1 : 0;
    return { userId, amount: money(share) };
  });
}

async function attachSplits(expenses: Expense[]): Promise<ExpenseWithSplits[]> {
  if (expenses.length === 0) return [];
  const { data, error } = await supabase.from('expense_splits').select('*').in('expense_id', expenses.map((expense) => expense.id));
  if (error) throw error;
  const byExpense = new Map<string, ExpenseSplit[]>();
  for (const split of data ?? []) byExpense.set(split.expense_id, [...(byExpense.get(split.expense_id) ?? []), split]);
  return expenses.map((expense) => ({ ...expense, splits: byExpense.get(expense.id) ?? [] }));
}

export function calculateUserBalance(expenses: ExpenseWithSplits[], userId: string) {
  let owedToYou = 0;
  let youOwe = 0;
  for (const expense of expenses) {
    for (const split of expense.splits) {
      if (split.is_settled || split.user_id === expense.paid_by) continue;
      if (expense.paid_by === userId) owedToYou += Number(split.amount_owed);
      if (split.user_id === userId) youOwe += Number(split.amount_owed);
    }
  }
  return { owedToYou: money(cents(owedToYou)), youOwe: money(cents(youOwe)), net: money(cents(owedToYou - youOwe)) };
}

export function useExpenses(filters: ExpenseFilters = {}) {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseWithSplits[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterKey = JSON.stringify(filters);

  const refresh = useCallback(async () => {
    if (!user) { setExpenses([]); return; }
    setLoading(true); setError(null);
    try {
      let query = supabase.from('expenses').select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false });
      if (filters.startDate) query = query.gte('expense_date', filters.startDate);
      if (filters.endDate) query = query.lte('expense_date', filters.endDate);
      if (filters.groupId) query = query.eq('group_id', filters.groupId);
      else if (filters.personalOnly) query = query.is('group_id', null);
      else if (filters.groupOnly) query = query.not('group_id', 'is', null);
      if (filters.search?.trim()) query = query.ilike('description', `%${filters.search.trim()}%`);
      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setExpenses(await attachSplits(data ?? []));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load expenses.');
    } finally { setLoading(false); }
  // filterKey deliberately stabilizes callers that pass an inline filter object.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, filterKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  const createExpense = useCallback(async (input: CreateExpenseInput) => {
    if (!user) throw new Error('Sign in to add an expense.');
    const description = input.description.trim();
    if (!description) throw new Error('Add a description.');
    const splitType = input.groupId ? (input.splitType ?? 'split_equally') : 'personal';
    const paidBy = input.groupId && splitType === 'other_owed_full'
      ? input.counterpartyId
      : splitType === 'you_owed_full' ? user.id : (input.paidBy ?? user.id);
    if (!paidBy) throw new Error('Choose who paid.');
    const category = input.category ?? 'Other'; const customCategoryNote = input.customCategoryNote?.trim() || null;
    if (category === 'Other' && !customCategoryNote) throw new Error('Add a note for the Other category.');
    const splits = calculateSplitDistributions({ ...input, splitType, currentUserId: user.id });
    const { data: expense, error: expenseError } = await supabase.from('expenses').insert({
      created_by: user.id, group_id: input.groupId ?? null, description, amount: input.amount,
      expense_date: input.expenseDate, paid_by: paidBy, split_type: splitType, category, custom_category_note: customCategoryNote,
    }).select().single();
    if (expenseError) throw expenseError;
    const { error: splitsError } = await supabase.from('expense_splits').insert(splits.map((split) => ({
      expense_id: expense.id, user_id: split.userId, amount_owed: split.amount,
    })));
    if (splitsError) {
      await supabase.from('expenses').delete().eq('id', expense.id);
      throw splitsError;
    }
    await refresh();
    return { ...expense, splits: splits.map((split, index) => ({ id: `new-${index}`, expense_id: expense.id, user_id: split.userId, amount_owed: split.amount, is_settled: false })) } as ExpenseWithSplits;
  }, [user, refresh]);

  const updateExpense = useCallback(async (expenseId: string, updates: UpdateExpenseInput) => {
    if (!user) throw new Error('Sign in to update an expense.');
    const existing = expenses.find((expense) => expense.id === expenseId);
    if (!existing) throw new Error('Expense not found.');
    const groupId = updates.groupId === undefined ? existing.group_id : updates.groupId;
    const splitType = groupId ? (updates.splitType ?? existing.split_type) : 'personal';
    const paidBy = splitType === 'you_owed_full' ? user.id
      : splitType === 'other_owed_full' ? (updates.counterpartyId ?? existing.paid_by)
      : (updates.paidBy ?? existing.paid_by ?? user.id);
    const payload = {
      description: updates.description?.trim() ?? existing.description,
      amount: updates.amount ?? Number(existing.amount), expense_date: updates.expenseDate ?? existing.expense_date,
      group_id: groupId ?? null, paid_by: paidBy, split_type: splitType,
      category: updates.category ?? existing.category, custom_category_note: updates.customCategoryNote === undefined ? existing.custom_category_note : updates.customCategoryNote?.trim() || null,
    };
    if (payload.category === 'Other' && !payload.custom_category_note) throw new Error('Add a note for the Other category.');
    const shouldResplit = updates.amount !== undefined || updates.groupId !== undefined || updates.splitType !== undefined || updates.memberIds !== undefined || updates.counterpartyId !== undefined || updates.customSplits !== undefined;
    const { error: updateError } = await supabase.from('expenses').update(payload).eq('id', expenseId);
    if (updateError) throw updateError;
    if (shouldResplit) {
      const previousCounterparty = splitType === 'other_owed_full' ? existing.paid_by : existing.splits.find((split) => split.user_id !== user.id)?.user_id;
      const splits = calculateSplitDistributions({
        amount: payload.amount, splitType, currentUserId: user.id,
        memberIds: updates.memberIds ?? existing.splits.map((split) => split.user_id),
        counterpartyId: updates.counterpartyId ?? previousCounterparty,
        customSplits: updates.customSplits ?? existing.splits.map((split) => ({ userId: split.user_id, amount: Number(split.amount_owed) })),
      });
      const { error: deleteError } = await supabase.from('expense_splits').delete().eq('expense_id', expenseId);
      if (deleteError) throw deleteError;
      const { error: insertError } = await supabase.from('expense_splits').insert(splits.map((split) => ({ expense_id: expenseId, user_id: split.userId, amount_owed: split.amount })));
      if (insertError) throw insertError;
    }
    await refresh();
  }, [user, expenses, refresh]);

  const deleteExpense = useCallback(async (expenseId: string) => {
    setError(null);
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', expenseId);
    if (deleteError) { setError(deleteError.message); return; }
    setExpenses((current) => current.filter((expense) => expense.id !== expenseId));
  }, []);

  const balance = useMemo(() => user ? calculateUserBalance(expenses, user.id) : { owedToYou: 0, youOwe: 0, net: 0 }, [expenses, user]);
  const total = useMemo(() => money(cents(expenses.reduce((sum, expense) => sum + Number(expense.amount), 0))), [expenses]);
  return { expenses, loading, error, total, balance, refresh, createExpense, updateExpense, deleteExpense };
}
