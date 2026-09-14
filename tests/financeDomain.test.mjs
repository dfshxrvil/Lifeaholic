import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/features/finance/domain.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const domain = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

const expense = (updates = {}) => ({
  id: 'expense-id', created_by: 'alice', group_id: 'group-id', description: 'Lunch', amount: 10,
  expense_date: '2026-09-13', paid_by: 'alice', split_type: 'split_equally', category: 'Food',
  custom_category_note: null, created_at: '2026-09-13T00:00:00Z',
  splits: [
    { id: 'a', expense_id: 'expense-id', user_id: 'alice', amount_owed: 5, is_settled: false },
    { id: 'b', expense_id: 'expense-id', user_id: 'bob', amount_owed: 5, is_settled: false },
  ], ...updates,
});

test('parses supported Indian and international money formats without rounding input', () => {
  for (const [input, expected] of [['10', 10], ['10.50', 10.5], ['.50', 0.5], ['₹ 1,000.25', 1000.25], ['1,00,000', 100000]]) {
    assert.equal(domain.parseExpenseAmount(input), expected);
  }
  for (const input of ['-10', '10abc', '1e3', '', '0', '1.234', '1,2', 'Infinity']) {
    assert.throws(() => domain.parseExpenseAmount(input), input);
  }
});

test('uses integer cents and enforces database limits', () => {
  assert.equal(domain.toCents(12.5), 1250);
  assert.equal(domain.fromCents(1250), 12.5);
  for (const amount of [0, -1, 0.001, NaN, Infinity, 100000000]) assert.throws(() => domain.validateExpenseDetails('Lunch', amount));
  for (const amount of [0.01, 12.5, 99999999.99]) assert.doesNotThrow(() => domain.validateExpenseDetails('Lunch', amount));
  assert.throws(() => domain.validateExpenseDetails('x'.repeat(201), 1));
  assert.doesNotThrow(() => domain.validateExpenseDetails('😀'.repeat(200), 1));
});

test('equal splits distribute remainder cents deterministically and exactly', () => {
  const splits = domain.calculateSplitDistributions({ amount: 10.01, splitType: 'split_equally', currentUserId: 'alice', memberIds: ['alice', 'bob', 'carol', 'alice'] });
  assert.deepEqual(splits, [
    { userId: 'alice', amount: 3.34 },
    { userId: 'bob', amount: 3.34 },
    { userId: 'carol', amount: 3.33 },
  ]);
  assert.equal(splits.reduce((sum, split) => sum + domain.toCents(split.amount), 0), 1001);
});

test('full and custom split rules reject missing, duplicate, and unbalanced parties', () => {
  assert.deepEqual(domain.calculateSplitDistributions({ amount: 7, splitType: 'you_owed_full', currentUserId: 'alice', counterpartyId: 'bob' }), [{ userId: 'bob', amount: 7 }]);
  assert.deepEqual(domain.calculateSplitDistributions({ amount: 7, splitType: 'other_owed_full', currentUserId: 'alice', counterpartyId: 'bob' }), [{ userId: 'alice', amount: 7 }]);
  assert.throws(() => domain.calculateSplitDistributions({ amount: 7, splitType: 'other_owed_full', currentUserId: 'alice' }), /paid/);
  assert.throws(() => domain.calculateSplitDistributions({ amount: 7, splitType: 'custom', currentUserId: 'alice', customSplits: [{ userId: 'bob', amount: 6 }] }), /add up/);
  assert.throws(() => domain.calculateSplitDistributions({ amount: 7, splitType: 'custom', currentUserId: 'alice', customSplits: [{ userId: 'bob', amount: 3 }, { userId: 'bob', amount: 4 }] }), /once/);
});

test('builds complete personal and group ledger writes', () => {
  const personal = domain.buildCreateLedger({ description: ' Coffee ', amount: 44, expenseDate: '2026-09-13', category: 'Food' }, 'alice', 'personal-id');
  assert.deepEqual({ groupId: personal.groupId, paidBy: personal.paidBy, splitType: personal.splitType, splits: personal.splits },
    { groupId: null, paidBy: 'alice', splitType: 'personal', splits: [{ userId: 'alice', amount: 44 }] });
  const group = domain.buildCreateLedger({ description: 'Dinner', amount: 9.99, expenseDate: '2026-09-13', groupId: 'group-id', paidBy: 'bob', splitType: 'split_equally', memberIds: ['alice', 'bob'], category: 'Food' }, 'alice', 'group-expense');
  assert.equal(group.paidBy, 'bob');
  assert.deepEqual(group.splits.map((split) => split.amount), [5, 4.99]);
});

test('metadata edits preserve settlement state while financial edits resplit', () => {
  const metadata = domain.buildUpdateLedger(expense({ splits: [
    { id: 'a', expense_id: 'expense-id', user_id: 'alice', amount_owed: 5, is_settled: false },
    { id: 'b', expense_id: 'expense-id', user_id: 'bob', amount_owed: 5, is_settled: true },
  ] }), { description: 'Updated' }, 'alice');
  assert.deepEqual(metadata.splits.map((split) => split.isSettled), [false, true]);
  const financial = domain.buildUpdateLedger(expense(), { amount: 12, memberIds: ['alice', 'bob'] }, 'alice');
  assert.deepEqual(financial.splits.map((split) => split.amount), [6, 6]);
  assert.deepEqual(financial.splits.map((split) => split.isSettled), [undefined, undefined]);
});

test('balances and totals are calculated in cents and ignore settled shares', () => {
  const open = expense();
  const settled = expense({ id: 'second', amount: 3, paid_by: 'bob', splits: [{ id: 'c', expense_id: 'second', user_id: 'alice', amount_owed: 3, is_settled: true }] });
  assert.deepEqual(domain.calculateUserBalance([open, settled], 'alice'), { owedToYou: 5, youOwe: 0, net: 5 });
  assert.deepEqual(domain.calculateUserBalance([open], 'bob'), { owedToYou: 0, youOwe: 5, net: -5 });
  assert.equal(domain.calculateExpenseTotal([open, settled]), 13);
});

test('preserves useful database errors', () => {
  assert.equal(domain.expenseErrorMessage({ message: 'Ledger rejected the save' }, 'fallback'), 'Ledger rejected the save');
  assert.equal(domain.expenseErrorMessage({}, 'fallback'), 'fallback');
});

test('rejects invalid dates, scope changes, and incomplete stored ledgers', () => {
  assert.throws(() => domain.buildCreateLedger({ description: 'Lunch', amount: 10, expenseDate: '2026-02-30', category: 'Food' }, 'alice', 'id'), /date/);
  assert.throws(() => domain.buildUpdateLedger(expense(), { groupId: 'another-group' }, 'alice'), /move/);
  assert.throws(() => domain.validateStoredExpense(expense({ splits: [] })), /unbalanced/);
  assert.throws(() => domain.validateStoredExpense(expense({ splits: [{ id: 'a', expense_id: 'wrong', user_id: 'alice', amount_owed: 10, is_settled: false }] })), /invalid splits/);
  assert.doesNotThrow(() => domain.validateStoredExpense(expense()));
});
