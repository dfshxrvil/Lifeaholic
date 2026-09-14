import type { SupabaseClient } from '@supabase/supabase-js';
import { validateLedger, validateStoredExpense, type LedgerWrite } from '@/features/finance/domain';
import type { Database, Expense, ExpenseSplit, ExpenseWithSplits, Group, GroupMemberProfile, Profile } from '@/types/database';

export type ExpenseFilters = {
  startDate?: string;
  endDate?: string;
  groupId?: string;
  personalOnly?: boolean;
  groupOnly?: boolean;
  search?: string;
};
export type GroupDirectory = { groups: Group[]; membersByGroup: Record<string, GroupMemberProfile[]> };

function throwRpcError(error: { code?: string; message?: string }, migration: string): never {
  if (error.code === 'PGRST202') throw new Error(`Finance needs a database update. Apply ${migration}.`);
  throw error;
}

function assertExpense(value: unknown, expectedId: string): ExpenseWithSplits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The server returned an invalid expense.');
  const expense = value as Partial<ExpenseWithSplits>;
  if (expense.id !== expectedId || !Array.isArray(expense.splits)) throw new Error('The server returned an invalid expense.');
  return validateStoredExpense(expense as ExpenseWithSplits);
}

export class FinanceRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async listExpenses(filters: ExpenseFilters): Promise<ExpenseWithSplits[]> {
    let query = this.client.from('expenses').select('*')
      .order('expense_date', { ascending: false }).order('created_at', { ascending: false });
    if (filters.startDate) query = query.gte('expense_date', filters.startDate);
    if (filters.endDate) query = query.lte('expense_date', filters.endDate);
    if (filters.groupId) query = query.eq('group_id', filters.groupId);
    else if (filters.personalOnly) query = query.is('group_id', null);
    else if (filters.groupOnly) query = query.not('group_id', 'is', null);
    if (filters.search?.trim()) query = query.ilike('description', `%${filters.search.trim()}%`);
    const { data, error } = await query;
    if (error) throw error;
    const expenses = (data ?? []) as Expense[];
    if (expenses.length === 0) return [];
    const { data: splitRows, error: splitError } = await this.client.from('expense_splits').select('*')
      .in('expense_id', expenses.map((expense) => expense.id));
    if (splitError) throw splitError;
    const byExpense = new Map<string, ExpenseSplit[]>();
    for (const split of splitRows ?? []) byExpense.set(split.expense_id, [...(byExpense.get(split.expense_id) ?? []), split]);
    return expenses.map((expense) => validateStoredExpense({ ...expense, splits: byExpense.get(expense.id) ?? [] }));
  }

  async saveExpense(write: LedgerWrite): Promise<ExpenseWithSplits> {
    validateLedger(write);
    const { data, error } = await this.client.rpc('save_expense_ledger_v2', {
      p_id: write.id, p_description: write.description, p_amount: write.amount,
      p_expense_date: write.expenseDate, p_category: write.category,
      p_custom_category_note: write.category === 'Other' ? write.customCategoryNote : null,
      p_group_id: write.groupId, p_paid_by: write.paidBy, p_split_type: write.splitType,
      p_splits: write.splits.map((split) => ({ user_id: split.userId, amount: split.amount, is_settled: split.isSettled ?? false })),
    });
    if (error) throwRpcError(error, 'migration 007_atomic_expense_ledger.sql');
    return assertExpense(data, write.id);
  }

  async deleteExpense(expenseId: string): Promise<void> {
    if (!expenseId) throw new Error('Expense ID is required.');
    const { error } = await this.client.rpc('delete_finance_expense_v3', { p_expense_id: expenseId });
    if (error) throwRpcError(error, 'migration 008_finance_core.sql');
  }

  async loadGroupDirectory(): Promise<GroupDirectory> {
    const { data: groupRows, error: groupError } = await this.client.from('groups').select('*').order('created_at', { ascending: false });
    if (groupError) throw groupError;
    const groups = groupRows ?? [];
    if (groups.length === 0) return { groups: [], membersByGroup: {} };
    const { data: memberships, error: memberError } = await this.client.from('group_members').select('*').in('group_id', groups.map((group) => group.id));
    if (memberError) throw memberError;
    const userIds = [...new Set((memberships ?? []).map((member) => member.user_id))];
    const { data: profiles, error: profileError } = userIds.length
      ? await this.client.from('profiles').select('*').in('id', userIds)
      : { data: [] as Profile[], error: null };
    if (profileError) throw profileError;
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const membersByGroup: Record<string, GroupMemberProfile[]> = {};
    for (const membership of memberships ?? []) {
      const profile = profileMap.get(membership.user_id);
      if (profile) (membersByGroup[membership.group_id] ??= []).push({ ...membership, profile });
    }
    return { groups, membersByGroup };
  }

  async createGroup(name: string, userId: string): Promise<Group> {
    const normalized = name.trim();
    if (!userId) throw new Error('Sign in to create a group.');
    if (!normalized) throw new Error('Give the group a name.');
    if ([...normalized].length > 100) throw new Error('Keep the group name to 100 characters or fewer.');
    const { data, error } = await this.client.from('groups').insert({ name: normalized, created_by: userId }).select().single();
    if (error) throw error;
    return data;
  }

  async searchProfiles(query: string, excludedUserId?: string): Promise<Profile[]> {
    const term = query.trim();
    if (term.length < 2) return [];
    if (term.length > 100) throw new Error('Search is too long.');
    const pattern = `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    const [username, email] = await Promise.all([
      this.client.from('profiles').select('*').ilike('username', pattern).limit(12),
      this.client.from('profiles').select('*').ilike('email', pattern).limit(12),
    ]);
    if (username.error) throw username.error;
    if (email.error) throw email.error;
    const profiles = new Map<string, Profile>();
    for (const profile of [...(username.data ?? []), ...(email.data ?? [])]) {
      if (profile.id !== excludedUserId) profiles.set(profile.id, profile);
    }
    return [...profiles.values()].slice(0, 12);
  }

  async addGroupMember(groupId: string, userId: string): Promise<void> {
    if (!groupId || !userId) throw new Error('Choose a group and member.');
    const { error } = await this.client.from('group_members').insert({ group_id: groupId, user_id: userId });
    if (error && error.code !== '23505') throw error;
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    if (!groupId || !userId) throw new Error('Choose a group and member.');
    const { error } = await this.client.rpc('remove_group_member_v3', { p_group_id: groupId, p_user_id: userId });
    if (error) throwRpcError(error, 'migration 008_finance_core.sql');
  }

  async setSplitSettled(expenseId: string, userId: string, settled: boolean): Promise<void> {
    if (!expenseId || !userId) throw new Error('Choose an expense and member.');
    const { error } = await this.client.rpc('set_expense_split_settled_v3', {
      p_expense_id: expenseId, p_user_id: userId, p_settled: settled,
    });
    if (error) throwRpcError(error, 'migration 008_finance_core.sql');
  }
}
