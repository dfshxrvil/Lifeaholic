import { FINANCE_CATEGORIES } from '@/types/finance';
import type { FinanceCategory, FinanceExpense, FinanceId, IsoDate, Paise } from '@/types/finance';

export interface FinanceMonthlyAnalytics {
  totalSpentMinor: Paise;
  previousMonthSpentMinor: Paise;
  averageDailySpendMinor: Paise;
  daysElapsed: number;
  daysInMonth: number;
  monthOverMonthChangeMinor: Paise;
  monthOverMonthBasisPoints: bigint | null;
}

export interface FinanceCategoryBreakdown {
  category: FinanceCategory;
  amountMinor: Paise;
  shareBasisPoints: bigint;
  transactionCount: number;
}

export interface FinanceDailySpend {
  day: number;
  amountMinor: Paise;
  transactionCount: number;
}

export interface FinanceSpendingSources {
  personalMinor: Paise;
  groupShareMinor: Paise;
  totalMinor: Paise;
  personalShareBasisPoints: bigint;
  groupShareBasisPoints: bigint;
}

function monthKey(value: string): string {
  const key = value.slice(0, 7);
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(key)) throw new Error('Target month must use YYYY-MM format.');
  return key;
}

export function getDaysInMonth(targetMonth: string): number {
  const key = monthKey(targetMonth);
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year!, month!, 0)).getUTCDate();
}

export function getExpenseSpendMinor(expense: FinanceExpense, userId?: FinanceId): Paise {
  if (!expense.groupId) return expense.totalAmountMinor;
  if (!userId) return expense.totalAmountMinor;
  return expense.participants.find((participant) => participant.userId === userId)?.amountOwedMinor ?? 0n;
}

function expensesForMonth(expenses: readonly FinanceExpense[], targetMonth: string): FinanceExpense[] {
  const prefix = `${monthKey(targetMonth)}-`;
  return expenses.filter((expense) => expense.status === 'active' && expense.expenseDate.startsWith(prefix));
}

function sumExpenses(expenses: readonly FinanceExpense[], userId?: FinanceId): Paise {
  return expenses.reduce((sum, expense) => expense.status === 'active' ? sum + getExpenseSpendMinor(expense, userId) : sum, 0n);
}

function divideRounded(amount: Paise, divisor: number): Paise {
  if (divisor <= 0) return 0n;
  const denominator = BigInt(divisor);
  return (amount + denominator / 2n) / denominator;
}

function signedRatioBasisPoints(numerator: bigint, denominator: bigint): bigint | null {
  if (denominator === 0n) return null;
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute * 10_000n + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
}

export function calculateMonthlyAnalytics(
  expenses: readonly FinanceExpense[],
  targetMonth: string,
  previousMonthExpenses: readonly FinanceExpense[],
  options: { userId?: FinanceId; referenceDate?: IsoDate } = {},
): FinanceMonthlyAnalytics {
  const key = monthKey(targetMonth);
  const current = expensesForMonth(expenses, key);
  const totalSpentMinor = sumExpenses(current, options.userId);
  const previousMonthSpentMinor = sumExpenses(previousMonthExpenses, options.userId);
  const daysInMonth = getDaysInMonth(key);
  const reference = options.referenceDate ?? `${key}-${String(daysInMonth).padStart(2, '0')}`;
  const referenceMonth = reference.slice(0, 7);
  const daysElapsed = referenceMonth < key ? 0 : referenceMonth > key ? daysInMonth : Math.min(daysInMonth, Math.max(0, Number(reference.slice(8, 10))));
  const monthOverMonthChangeMinor = totalSpentMinor - previousMonthSpentMinor;
  return {
    totalSpentMinor,
    previousMonthSpentMinor,
    averageDailySpendMinor: divideRounded(totalSpentMinor, daysElapsed),
    daysElapsed,
    daysInMonth,
    monthOverMonthChangeMinor,
    monthOverMonthBasisPoints: signedRatioBasisPoints(monthOverMonthChangeMinor, previousMonthSpentMinor),
  };
}

export function getCategoryBreakdown(expenses: readonly FinanceExpense[], userId?: FinanceId): FinanceCategoryBreakdown[] {
  const totals = new Map<FinanceCategory, { amountMinor: Paise; transactionCount: number }>(
    FINANCE_CATEGORIES.map((category) => [category, { amountMinor: 0n, transactionCount: 0 }]),
  );
  for (const expense of expenses) {
    if (expense.status !== 'active') continue;
    const current = totals.get(expense.category)!;
    const amountMinor = getExpenseSpendMinor(expense, userId);
    current.amountMinor += amountMinor;
    if (amountMinor > 0n) current.transactionCount += 1;
  }
  const total = [...totals.values()].reduce((sum, item) => sum + item.amountMinor, 0n);
  return FINANCE_CATEGORIES.map((category) => {
    const entry = totals.get(category)!;
    return {
      category,
      amountMinor: entry.amountMinor,
      transactionCount: entry.transactionCount,
      shareBasisPoints: total === 0n ? 0n : (entry.amountMinor * 10_000n + total / 2n) / total,
    };
  });
}

export function getDailySpendSeries(expenses: readonly FinanceExpense[], daysInMonth: number, userId?: FinanceId): FinanceDailySpend[] {
  if (!Number.isInteger(daysInMonth) || daysInMonth < 1 || daysInMonth > 31) throw new Error('Days in month must be between 1 and 31.');
  const series = Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1, amountMinor: 0n, transactionCount: 0 }));
  for (const expense of expenses) {
    if (expense.status !== 'active') continue;
    const day = Number(expense.expenseDate.slice(8, 10));
    const entry = series[day - 1];
    if (!entry) continue;
    const amountMinor = getExpenseSpendMinor(expense, userId);
    entry.amountMinor += amountMinor;
    if (amountMinor > 0n) entry.transactionCount += 1;
  }
  return series;
}

export function getTopOutflows(expenses: readonly FinanceExpense[], limit = 3, userId?: FinanceId): FinanceExpense[] {
  const count = Math.max(0, Math.floor(limit));
  return [...expenses]
    .filter((expense) => expense.status === 'active' && getExpenseSpendMinor(expense, userId) > 0n)
    .sort((left, right) => {
      const difference = getExpenseSpendMinor(right, userId) - getExpenseSpendMinor(left, userId);
      if (difference !== 0n) return difference > 0n ? 1 : -1;
      return right.expenseDate.localeCompare(left.expenseDate) || right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
    })
    .slice(0, count);
}

export function getSpendingSourceBreakdown(
  personalExpenses: readonly FinanceExpense[],
  groupExpenses: readonly FinanceExpense[],
  userId: FinanceId,
): FinanceSpendingSources {
  const personalMinor = sumExpenses(personalExpenses);
  const groupShareMinor = sumExpenses(groupExpenses, userId);
  const totalMinor = personalMinor + groupShareMinor;
  const personalShareBasisPoints = totalMinor === 0n ? 0n : (personalMinor * 10_000n + totalMinor / 2n) / totalMinor;
  return { personalMinor, groupShareMinor, totalMinor, personalShareBasisPoints, groupShareBasisPoints: totalMinor === 0n ? 0n : 10_000n - personalShareBasisPoints };
}
