import type { ExpenseCategory, ExpenseSplitType, ExpenseWithSplits } from '@/types/database';

export const MAX_EXPENSE_CENTS = 9_999_999_999;
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = ['Food', 'Online shopping', 'Investments', 'Other'];

export type SplitDraft = { userId: string; amount: number; isSettled?: boolean };
export type CreateExpenseInput = {
  requestId?: string;
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
export type LedgerWrite = {
  id: string;
  description: string;
  amount: number;
  expenseDate: string;
  category: ExpenseCategory;
  customCategoryNote: string | null;
  groupId: string | null;
  paidBy: string;
  splitType: ExpenseSplitType;
  splits: SplitDraft[];
};
export type ExpenseBalance = { owedToYou: number; youOwe: number; net: number };

export function toCents(value: number, label = 'Amount'): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(value - cents / 100) > 0.00000001) {
    throw new Error(`${label} must use at most two decimal places.`);
  }
  return cents;
}

export function fromCents(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('Money value is outside the supported range.');
  return value / 100;
}

export function parseExpenseAmount(value: string): number {
  const text = value.trim().replace(/^₹\s*/, '');
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{0,2})?|\.\d{1,2})$/.test(text)) {
    throw new Error('Enter a valid amount with at most two decimal places.');
  }
  const amount = Number(text.replace(/,/g, ''));
  validateExpenseDetails('Expense', amount);
  return amount;
}

export function validateExpenseDetails(description: string, amount: number): void {
  const normalized = description.trim();
  if (!normalized) throw new Error('Add a description.');
  if ([...normalized].length > 200) throw new Error('Keep the description to 200 characters or fewer.');
  const cents = toCents(amount);
  if (cents < 1) throw new Error('Enter an amount of at least 0.01.');
  if (cents > MAX_EXPENSE_CENTS) throw new Error('Enter an amount no greater than 99,999,999.99.');
}

export function validateDateKey(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid expense date.');
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Choose a valid expense date.');
  }
}

export function calculateSplitDistributions(input: {
  amount: number;
  splitType: ExpenseSplitType;
  currentUserId: string;
  memberIds?: string[];
  counterpartyId?: string;
  customSplits?: SplitDraft[];
}): SplitDraft[] {
  const totalCents = toCents(input.amount);
  if (totalCents <= 0) throw new Error('Amount must be greater than zero.');
  if (!input.currentUserId) throw new Error('Sign in to split an expense.');

  if (input.splitType === 'personal') return [{ userId: input.currentUserId, amount: fromCents(totalCents) }];
  if (input.splitType === 'you_owed_full') {
    if (!input.counterpartyId) throw new Error('Choose who owes this expense.');
    return [{ userId: input.counterpartyId, amount: fromCents(totalCents) }];
  }
  if (input.splitType === 'other_owed_full') {
    if (!input.counterpartyId) throw new Error('Choose who paid for this expense.');
    return [{ userId: input.currentUserId, amount: fromCents(totalCents) }];
  }
  if (input.splitType === 'custom') {
    const splits = input.customSplits ?? [];
    if (splits.length === 0) throw new Error('Add at least one custom split.');
    const seen = new Set<string>();
    let sum = 0;
    const normalized = splits.map((split) => {
      if (!split.userId || seen.has(split.userId)) throw new Error('Each person can appear only once in a split.');
      seen.add(split.userId);
      const splitCents = toCents(split.amount, 'Split amount');
      if (splitCents < 0) throw new Error('Split amounts cannot be negative.');
      sum += splitCents;
      return { userId: split.userId, amount: fromCents(splitCents), isSettled: split.isSettled };
    });
    if (sum !== totalCents) throw new Error('Custom splits must add up to the expense total.');
    return normalized;
  }

  const members = [...new Set((input.memberIds ?? []).filter(Boolean))];
  if (members.length === 0) throw new Error('This group has no members.');
  const base = Math.floor(totalCents / members.length);
  let remainder = totalCents % members.length;
  return members.map((userId) => {
    const getsRemainder = remainder > 0;
    if (getsRemainder) remainder -= 1;
    const share = base + (getsRemainder ? 1 : 0);
    return { userId, amount: fromCents(share) };
  });
}

function normalizeCommon(input: CreateExpenseInput) {
  const description = input.description.trim();
  validateExpenseDetails(description, input.amount);
  validateDateKey(input.expenseDate);
  const category = input.category ?? 'Other';
  if (!EXPENSE_CATEGORIES.includes(category)) throw new Error('Choose a valid category.');
  const customCategoryNote = input.customCategoryNote?.trim() || null;
  if (category === 'Other' && !customCategoryNote) throw new Error('Add a note for the Other category.');
  return { description, category, customCategoryNote };
}

export function buildCreateLedger(input: CreateExpenseInput, currentUserId: string, id: string): LedgerWrite {
  if (!currentUserId) throw new Error('Sign in to add an expense.');
  if (!id) throw new Error('Expense ID is required.');
  const common = normalizeCommon(input);
  const groupId = input.groupId ?? null;
  const splitType: ExpenseSplitType = groupId ? (input.splitType ?? 'split_equally') : 'personal';
  const paidBy = !groupId ? currentUserId : splitType === 'other_owed_full'
    ? input.counterpartyId : splitType === 'you_owed_full' ? currentUserId : (input.paidBy ?? currentUserId);
  if (!paidBy) throw new Error('Choose who paid.');
  const splits = calculateSplitDistributions({ ...input, splitType, currentUserId });
  return validateLedger({ id, ...common, amount: fromCents(toCents(input.amount)), expenseDate: input.expenseDate,
    groupId, paidBy, splitType, splits });
}

export function buildUpdateLedger(existing: ExpenseWithSplits, updates: UpdateExpenseInput, currentUserId: string): LedgerWrite {
  if (!currentUserId) throw new Error('Sign in to update an expense.');
  const groupId = updates.groupId === undefined ? existing.group_id : updates.groupId;
  if (Boolean(existing.group_id) !== Boolean(groupId) || (existing.group_id && existing.group_id !== groupId)) {
    throw new Error('Create a new expense to move between personal and group expenses.');
  }
  const splitType: ExpenseSplitType = groupId ? (updates.splitType ?? existing.split_type) : 'personal';
  const previousCounterparty = splitType === 'other_owed_full' ? existing.paid_by
    : existing.splits.find((split) => split.user_id !== currentUserId)?.user_id;
  const paidBy = !groupId ? currentUserId : splitType === 'you_owed_full' ? currentUserId
    : splitType === 'other_owed_full' ? (updates.counterpartyId ?? previousCounterparty)
    : (updates.paidBy ?? existing.paid_by);
  if (!paidBy) throw new Error('Choose who paid.');
  const merged: CreateExpenseInput = {
    description: updates.description ?? existing.description,
    amount: updates.amount ?? Number(existing.amount),
    expenseDate: updates.expenseDate ?? existing.expense_date,
    groupId: groupId ?? null,
    category: updates.category ?? existing.category,
    customCategoryNote: updates.customCategoryNote === undefined ? existing.custom_category_note : updates.customCategoryNote,
  };
  const common = normalizeCommon(merged);
  const shouldResplit = ['amount', 'groupId', 'splitType', 'memberIds', 'counterpartyId', 'customSplits']
    .some((key) => Object.prototype.hasOwnProperty.call(updates, key));
  const splits = shouldResplit ? calculateSplitDistributions({
    amount: merged.amount, splitType, currentUserId,
    memberIds: updates.memberIds ?? existing.splits.map((split) => split.user_id),
    counterpartyId: updates.counterpartyId ?? previousCounterparty,
    customSplits: updates.customSplits ?? existing.splits.map((split) => ({ userId: split.user_id, amount: Number(split.amount_owed) })),
  }) : existing.splits.map((split) => ({ userId: split.user_id, amount: Number(split.amount_owed), isSettled: split.is_settled }));
  return validateLedger({ id: existing.id, ...common, amount: fromCents(toCents(merged.amount)), expenseDate: merged.expenseDate,
    groupId: groupId ?? null, paidBy, splitType, splits });
}

export function validateLedger(input: LedgerWrite): LedgerWrite {
  if (!input.id) throw new Error('Expense ID is required.');
  if (!input.paidBy) throw new Error('Choose who paid.');
  validateExpenseDetails(input.description, input.amount);
  validateDateKey(input.expenseDate);
  if (!EXPENSE_CATEGORIES.includes(input.category)) throw new Error('Choose a valid category.');
  if (input.category === 'Other' && !input.customCategoryNote?.trim()) throw new Error('Add a note for the Other category.');
  if (input.groupId ? input.splitType === 'personal' : input.splitType !== 'personal') throw new Error('Choose a valid split type.');
  const totalCents = toCents(input.amount);
  const seen = new Set<string>();
  let splitCents = 0;
  for (const split of input.splits) {
    if (!split.userId || seen.has(split.userId)) throw new Error('Each person can appear only once in a split.');
    seen.add(split.userId);
    const amount = toCents(split.amount, 'Split amount');
    if (amount < 0) throw new Error('Split amounts cannot be negative.');
    splitCents += amount;
  }
  if (input.splits.length === 0 || splitCents !== totalCents) throw new Error('Expense splits must add up to the expense total.');
  if (!input.groupId && (input.splits.length !== 1 || input.splits[0]?.userId !== input.paidBy)) {
    throw new Error('A personal expense must be paid and owed by the same account.');
  }
  return input;
}

export function validateStoredExpense(expense: ExpenseWithSplits): ExpenseWithSplits {
  if (!expense.id || !expense.paid_by || !Array.isArray(expense.splits)) throw new Error('Stored expense is incomplete.');
  validateExpenseDetails(expense.description, Number(expense.amount));
  validateDateKey(expense.expense_date);
  if (!EXPENSE_CATEGORIES.includes(expense.category)) throw new Error('Stored expense has an invalid category.');
  if (expense.category === 'Other' && !expense.custom_category_note?.trim()) throw new Error('Stored expense is missing its category note.');
  if (expense.group_id ? expense.split_type === 'personal' : expense.split_type !== 'personal') {
    throw new Error('Stored expense has an invalid scope.');
  }
  const expected = toCents(Number(expense.amount), 'Stored expense amount');
  const users = new Set<string>();
  let owed = 0;
  for (const split of expense.splits) {
    if (!split.id || split.expense_id !== expense.id || !split.user_id || users.has(split.user_id)) {
      throw new Error('Stored expense has invalid splits.');
    }
    users.add(split.user_id);
    const amount = toCents(Number(split.amount_owed), 'Stored split amount');
    if (amount < 0) throw new Error('Stored expense has a negative split.');
    owed += amount;
  }
  if (expense.splits.length === 0 || owed !== expected) throw new Error('Stored expense ledger is unbalanced.');
  if (!expense.group_id && (expense.splits.length !== 1 || expense.splits[0]?.user_id !== expense.paid_by)) {
    throw new Error('Stored personal expense has an invalid owner share.');
  }
  return expense;
}

export function calculateUserBalance(expenses: ExpenseWithSplits[], userId: string): ExpenseBalance {
  let owed = 0;
  let owes = 0;
  for (const expense of expenses) {
    for (const split of expense.splits) {
      if (split.is_settled || split.user_id === expense.paid_by) continue;
      const amount = toCents(Number(split.amount_owed), 'Stored split amount');
      if (expense.paid_by === userId) owed += amount;
      if (split.user_id === userId) owes += amount;
    }
  }
  return { owedToYou: fromCents(owed), youOwe: fromCents(owes), net: fromCents(owed - owes) };
}

export function calculateExpenseTotal(expenses: ExpenseWithSplits[]): number {
  return fromCents(expenses.reduce((sum, expense) => sum + toCents(Number(expense.amount), 'Stored expense amount'), 0));
}

export function expenseErrorMessage(cause: unknown, fallback: string): string {
  if (typeof cause === 'object' && cause !== null && 'message' in cause
    && typeof cause.message === 'string' && cause.message.trim()) return cause.message;
  return fallback;
}
