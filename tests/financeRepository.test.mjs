import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText).toString('base64')}`;
const domainUrl = moduleUrl(await readFile(new URL('../src/features/finance/domain.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../src/features/finance/repository.ts', import.meta.url), 'utf8'))
  .replace('@/features/finance/domain', domainUrl);
const { FinanceRepository } = await import(moduleUrl(source));

const write = {
  id: 'request-id', description: 'Lunch', amount: 10, expenseDate: '2026-09-13', category: 'Food',
  customCategoryNote: null, groupId: 'group-id', paidBy: 'alice', splitType: 'split_equally',
  splits: [{ userId: 'alice', amount: 6 }, { userId: 'bob', amount: 4, isSettled: true }],
};

test('saves the entire ledger through one RPC request', async () => {
  const calls = [];
  const client = { rpc: async (...args) => {
    calls.push(args);
    return { data: { id: 'request-id', created_by: 'alice', group_id: 'group-id', description: 'Lunch', amount: 10,
      expense_date: '2026-09-13', paid_by: 'alice', split_type: 'split_equally', category: 'Food', custom_category_note: null,
      created_at: '2026-09-13T00:00:00Z', splits: [
        { id: 'a', expense_id: 'request-id', user_id: 'alice', amount_owed: 6, is_settled: false },
        { id: 'b', expense_id: 'request-id', user_id: 'bob', amount_owed: 4, is_settled: true },
      ] }, error: null };
  } };
  await new FinanceRepository(client).saveExpense(write);
  assert.deepEqual(calls, [['save_expense_ledger_v2', {
    p_id: 'request-id', p_description: 'Lunch', p_amount: 10, p_expense_date: '2026-09-13',
    p_category: 'Food', p_custom_category_note: null, p_group_id: 'group-id', p_paid_by: 'alice',
    p_split_type: 'split_equally', p_splits: [
      { user_id: 'alice', amount: 6, is_settled: false },
      { user_id: 'bob', amount: 4, is_settled: true },
    ],
  }]]);
});

test('does not fall back to partial writes when the RPC fails', async () => {
  const error = { code: 'P0001', message: 'Expense ledger is unbalanced' };
  await assert.rejects(new FinanceRepository({ rpc: async () => ({ error }) }).saveExpense(write), (cause) => cause === error);
  await assert.rejects(new FinanceRepository({ rpc: async () => ({ data: null, error: null }) }).saveExpense(write), /invalid expense/);
  await assert.rejects(new FinanceRepository({ rpc: async () => ({ error: { code: 'PGRST202' } }) }).saveExpense(write), /migration 007/);
});

test('rejects invalid ledgers before contacting Supabase', async () => {
  const client = { rpc: () => assert.fail('Unexpected database write') };
  await assert.rejects(new FinanceRepository(client).saveExpense({ ...write, splits: [{ userId: 'alice', amount: 3 }] }), /add up/);
});

test('uses server-side lifecycle RPCs for deletes, member removal, and settlement', async () => {
  const calls = [];
  const client = { rpc: async (...args) => { calls.push(args); return { data: true, error: null }; } };
  const repository = new FinanceRepository(client);
  await repository.deleteExpense('expense-id');
  await repository.removeGroupMember('group-id', 'bob');
  await repository.setSplitSettled('expense-id', 'bob', true);
  assert.deepEqual(calls, [
    ['delete_finance_expense_v3', { p_expense_id: 'expense-id' }],
    ['remove_group_member_v3', { p_group_id: 'group-id', p_user_id: 'bob' }],
    ['set_expense_split_settled_v3', { p_expense_id: 'expense-id', p_user_id: 'bob', p_settled: true }],
  ]);
});

test('reports the required lifecycle migration instead of attempting a direct fallback', async () => {
  const repository = new FinanceRepository({ rpc: async () => ({ error: { code: 'PGRST202' } }) });
  await assert.rejects(repository.deleteExpense('expense-id'), /migration 008/);
  await assert.rejects(repository.removeGroupMember('group-id', 'bob'), /migration 008/);
  await assert.rejects(repository.setSplitSettled('expense-id', 'bob', true), /migration 008/);
});

function queryResult(result, calls, table) {
  const query = {};
  for (const method of ['select', 'order', 'gte', 'lte', 'eq', 'is', 'not', 'ilike', 'in', 'limit', 'single', 'insert', 'delete']) {
    query[method] = (...args) => { calls.push([table, method, ...args]); return query; };
  }
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return query;
}

test('loads filtered expenses and attaches their splits without N-per-row queries', async () => {
  const calls = [];
  const stored = { id: 'expense-id', created_by: 'alice', group_id: null, description: 'Coffee', amount: 4.5,
    expense_date: '2026-09-13', paid_by: 'alice', split_type: 'personal', category: 'Food', custom_category_note: null,
    created_at: '2026-09-13T00:00:00Z' };
  const split = { id: 'split-id', expense_id: 'expense-id', user_id: 'alice', amount_owed: 4.5, is_settled: false };
  const client = { from: (table) => queryResult(table === 'expenses' ? { data: [stored], error: null } : { data: [split], error: null }, calls, table) };
  const result = await new FinanceRepository(client).listExpenses({ startDate: '2026-09-01', endDate: '2026-09-30', personalOnly: true, search: 'coffee' });
  assert.deepEqual(result[0].splits, [split]);
  assert.equal(calls.filter(([table, method]) => table === 'expense_splits' && method === 'select').length, 1);
  assert.ok(calls.some(([table, method, column, value]) => table === 'expenses' && method === 'gte' && column === 'expense_date' && value === '2026-09-01'));
  assert.ok(calls.some(([table, method]) => table === 'expenses' && method === 'ilike'));
});

test('fails reads when stored split rows do not balance the expense', async () => {
  const calls = [];
  const stored = { id: 'expense-id', created_by: 'alice', group_id: null, description: 'Coffee', amount: 4.5,
    expense_date: '2026-09-13', paid_by: 'alice', split_type: 'personal', category: 'Food', custom_category_note: null,
    created_at: '2026-09-13T00:00:00Z' };
  const client = { from: (table) => queryResult({ data: table === 'expenses' ? [stored] : [], error: null }, calls, table) };
  await assert.rejects(new FinanceRepository(client).listExpenses({ personalOnly: true }), /unbalanced/);
});
