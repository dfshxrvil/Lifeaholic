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

export async function savePersonalExpense(client: SupabaseClient<Database>, input: PersonalExpenseInput): Promise<ExpenseWithSplits> {
  validateExpenseDetails(input.description, input.amount);
  const date = new Date(`${input.expenseDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate) || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== input.expenseDate) throw new Error('Choose a valid expense date.');
  if (input.category === 'Other' && !input.customCategoryNote?.trim()) throw new Error('Add a note for the Other category.');
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
