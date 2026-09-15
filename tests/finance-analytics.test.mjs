import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const typesSource = await readFile(new URL('../src/types/finance.ts', import.meta.url), 'utf8');
const analyticsSource = await readFile(new URL('../src/domain/finance/analytics.ts', import.meta.url), 'utf8');
const compile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const typesUrl = `data:text/javascript;base64,${Buffer.from(compile(typesSource)).toString('base64')}`;
const analyticsJavaScript = compile(analyticsSource).replace(/from ['"]@\/types\/finance['"]/, `from '${typesUrl}'`);
const analytics = await import(`data:text/javascript;base64,${Buffer.from(analyticsJavaScript).toString('base64')}`);

const expense = (overrides = {}) => ({
  id: overrides.id ?? crypto.randomUUID(),
  logicalExpenseId: overrides.id ?? crypto.randomUUID(),
  revision: 1,
  supersedesExpenseId: null,
  groupId: null,
  description: 'Expense',
  totalAmountMinor: 10_000n,
  currencyCode: 'INR',
  category: 'Food',
  customCategoryNote: null,
  expenseDate: '2026-09-01',
  createdBy: 'alice',
  createdAt: '2026-09-01T10:00:00.000Z',
  status: 'active',
  participants: [{ userId: 'alice', amountPaidMinor: 10_000n, amountOwedMinor: 10_000n }],
  ...overrides,
});

test('monthly analytics uses bigint paise for totals, daily run rate, and MoM basis points', () => {
  const current = [expense(), expense({ id: 'laundry', totalAmountMinor: 5_000n, category: 'Laundry', expenseDate: '2026-09-10' })];
  const previous = [expense({ id: 'previous', totalAmountMinor: 10_000n, expenseDate: '2026-08-05' })];
  const result = analytics.calculateMonthlyAnalytics(current, '2026-09', previous, { referenceDate: '2026-09-10' });
  assert.equal(result.totalSpentMinor, 15_000n);
  assert.equal(result.averageDailySpendMinor, 1_500n);
  assert.equal(result.previousMonthSpentMinor, 10_000n);
  assert.equal(result.monthOverMonthChangeMinor, 5_000n);
  assert.equal(result.monthOverMonthBasisPoints, 5_000n);
});

test('category breakdown includes all seven categories and preserves exact shares', () => {
  const result = analytics.getCategoryBreakdown([
    expense({ totalAmountMinor: 1_000n }),
    expense({ id: 'grocery', totalAmountMinor: 3_000n, category: 'Grocery' }),
  ]);
  assert.equal(result.length, 7);
  assert.equal(result.find((entry) => entry.category === 'Food').shareBasisPoints, 2_500n);
  assert.equal(result.find((entry) => entry.category === 'Grocery').shareBasisPoints, 7_500n);
  assert.equal(result.find((entry) => entry.category === 'Drinks').amountMinor, 0n);
});

test('pie breakdown uses bigint totals and whole-percent division for all seven categories', () => {
  const result = analytics.calculateCategoryPieBreakdown([
    expense({ totalAmountMinor: 1_000n }),
    expense({ id: 'grocery', totalAmountMinor: 3_000n, category: 'Grocery' }),
  ]);
  assert.equal(result.totalMonthlySpendMinor, 4_000n);
  assert.equal(result.slices.length, 7);
  assert.equal(result.slices.find((entry) => entry.category === 'Food').percentage, 25n);
  assert.equal(result.slices.find((entry) => entry.category === 'Grocery').percentage, 75n);
  assert.equal(result.slices.find((entry) => entry.category === 'Drinks').percentage, 0n);
});

test('pie breakdown uses the authenticated user owed share and handles zero totals', () => {
  const group = expense({
    groupId: 'group-1',
    totalAmountMinor: 3_000n,
    category: 'Drinks',
    participants: [
      { userId: 'alice', amountPaidMinor: 3_000n, amountOwedMinor: 1_000n },
      { userId: 'bob', amountPaidMinor: 0n, amountOwedMinor: 2_000n },
    ],
  });
  const alice = analytics.calculateCategoryPieBreakdown([group], 'alice');
  assert.equal(alice.totalMonthlySpendMinor, 1_000n);
  assert.equal(alice.slices.find((entry) => entry.category === 'Drinks').amountMinor, 1_000n);
  assert.equal(alice.slices.find((entry) => entry.category === 'Drinks').percentage, 100n);
  const empty = analytics.calculateCategoryPieBreakdown([], 'alice');
  assert.equal(empty.totalMonthlySpendMinor, 0n);
  assert.ok(empty.slices.every((entry) => entry.percentage === 0n && entry.shareBasisPoints === 0n));
});

test('group analytics counts the signed-in user owed share rather than the whole group bill', () => {
  const group = expense({
    groupId: 'group-1',
    totalAmountMinor: 3_000n,
    participants: [
      { userId: 'alice', amountPaidMinor: 3_000n, amountOwedMinor: 1_000n },
      { userId: 'bob', amountPaidMinor: 0n, amountOwedMinor: 2_000n },
    ],
  });
  assert.equal(analytics.getExpenseSpendMinor(group, 'alice'), 1_000n);
  assert.equal(analytics.getExpenseSpendMinor(group, 'bob'), 2_000n);
  assert.equal(analytics.calculateMonthlyAnalytics([group], '2026-09', [], { userId: 'alice', referenceDate: '2026-09-01' }).totalSpentMinor, 1_000n);
});

test('daily series and top outflows are deterministic', () => {
  const entries = [
    expense({ id: 'small', totalAmountMinor: 500n, expenseDate: '2026-09-02' }),
    expense({ id: 'largest', totalAmountMinor: 9_000n, expenseDate: '2026-09-05' }),
    expense({ id: 'middle', totalAmountMinor: 4_000n, expenseDate: '2026-09-02' }),
  ];
  const daily = analytics.getDailySpendSeries(entries, 30);
  assert.equal(daily[1].amountMinor, 4_500n);
  assert.equal(daily[1].transactionCount, 2);
  assert.deepEqual(analytics.getTopOutflows(entries, 2).map((entry) => entry.id), ['largest', 'middle']);
});
