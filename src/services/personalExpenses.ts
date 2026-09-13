import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ExpenseCategory, ExpenseWithSplits } from '@/types/database';
import { validateExpenseDetails } from '@/utils/expenseErrors';

export type PersonalExpenseInput = {
  id: string;
  description: string;
  amount: number;
  expenseDate: string;
  category: ExpenseCategory;
  customCategoryNote?: string | null;
};

export type ExpenseLedgerInput = PersonalExpenseInput & {
  groupId: string | null;
  paidBy: string;
  splitType: 'personal' | 'split_equally' | 'you_owed_full' | 'other_owed_full' | 'custom';
  splits: { userId: string; amount: number; isSettled?: boolean }[];
};

function validateInput(input: PersonalExpenseInput): void {
  validateExpenseDetails(input.description, input.amount);
  const date = new Date(`${input.expenseDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate) || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== input.expenseDate) throw new Error('Choose a valid expense date.');
  if (input.category === 'Other' && !input.customCategoryNote?.trim()) throw new Error('Add a note for the Other category.');
}

export async function savePersonalExpense(client: SupabaseClient<Database>, input: PersonalExpenseInput): Promise<ExpenseWithSplits> {
  validateInput(input);
  const { data, error } = await client.rpc('save_personal_expense_v1', {
    p_id: input.id, p_description: input.description.trim(), p_amount: input.amount,
    p_expense_date: input.expenseDate, p_category: input.category,
    p_custom_category_note: input.category === 'Other' ? input.customCategoryNote!.trim() : null,
  });
  if (error) {
    if (error.code === 'PGRST202') throw new Error('Personal expense saving needs a database update. Apply migration 006_personal_expense_ledger.sql.');
    throw error;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.id !== input.id || !Array.isArray(data.splits)) {
    throw new Error('The server returned an invalid expense. Retry to confirm the saved entry.');
  }
  return data as unknown as ExpenseWithSplits;
}

export async function saveExpenseLedger(client: SupabaseClient<Database>, input: ExpenseLedgerInput): Promise<ExpenseWithSplits> {
  validateInput(input);
  if (!input.paidBy) throw new Error('Choose who paid.');
  if (input.groupId ? input.splitType === 'personal' : input.splitType !== 'personal') throw new Error('Choose a valid split type.');
  if (input.splits.length === 0) throw new Error('Add at least one expense split.');
  for (const split of input.splits) {
    const rounded = Math.round(split.amount * 100) / 100;
    if (!split.userId || !Number.isFinite(split.amount) || split.amount < 0 || Math.abs(split.amount - rounded) > 0.00000001) {
      throw new Error('Expense splits must use valid amounts with at most two decimal places.');
    }
  }
  if (Math.round(input.splits.reduce((total, split) => total + split.amount, 0) * 100) !== Math.round(input.amount * 100)) {
    throw new Error('Expense splits must add up to the expense total.');
  }
  const { data, error } = await client.rpc('save_expense_ledger_v2', {
    p_id: input.id, p_description: input.description.trim(), p_amount: input.amount,
    p_expense_date: input.expenseDate, p_category: input.category,
    p_custom_category_note: input.category === 'Other' ? input.customCategoryNote!.trim() : null,
    p_group_id: input.groupId, p_paid_by: input.paidBy, p_split_type: input.splitType,
    p_splits: input.splits.map((split) => ({ user_id: split.userId, amount: split.amount, is_settled: split.isSettled ?? false })),
  });
  if (error) {
    if (error.code === 'PGRST202') {
      if (!input.groupId) return savePersonalExpense(client, input);
      throw new Error('Shared expense saving needs a database update. Apply migration 007_atomic_expense_ledger.sql.');
    }
    throw error;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.id !== input.id || !Array.isArray(data.splits)) {
    throw new Error('The server returned an invalid expense. Retry to confirm the saved entry.');
  }
  return data as unknown as ExpenseWithSplits;
}
