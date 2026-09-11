import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText).toString('base64')}`;
const errorsUrl = moduleUrl(await readFile(new URL('../src/utils/expenseErrors.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../src/services/personalExpenses.ts', import.meta.url), 'utf8')).replace('@/utils/expenseErrors', errorsUrl);
const { savePersonalExpense } = await import(moduleUrl(source));
const input = { id: 'request-id', description: ' Sample task ', amount: 10, expenseDate: '2026-09-11', category: 'Food' };

test('one RPC saves a personal entry and reuses its ID on retry', async () => {
  const calls = [];
  const client = { rpc: async (...args) => { calls.push(args); return { data: { id: input.id, amount: 10, splits: [{ amount_owed: 10 }] }, error: null }; } };
  await savePersonalExpense(client, input);
  await savePersonalExpense(client, input);
  assert.deepEqual(calls[0], ['save_personal_expense_v1', {
    p_id: 'request-id', p_description: 'Sample task', p_amount: 10,
    p_expense_date: '2026-09-11', p_category: 'Food', p_custom_category_note: null,
  }]);
  assert.deepEqual(calls[0], calls[1]);
});

test('invalid input is rejected before contacting the database', async () => {
  const client = { rpc: () => { assert.fail('Unexpected database write'); } };
  for (const update of [{ amount: -10 }, { amount: 1.005 }, { expenseDate: '2026-02-30' }, { expenseDate: 'bad' }, { category: 'Other' }, { description: ' ' }]) {
    await assert.rejects(savePersonalExpense(client, { ...input, ...update }));
  }
});

test('database failures are preserved; no partial-write fallback is attempted', async () => {
  const error = { message: 'Ledger check rejected the save', code: 'P0001' };
  await assert.rejects(savePersonalExpense({ rpc: async () => ({ error }) }, input), (cause) => cause === error);
  await assert.rejects(savePersonalExpense({ rpc: async () => ({ error: { code: 'PGRST202' } }) }, input), /database update/);
  await assert.rejects(savePersonalExpense({ rpc: async () => ({ data: null, error: null }) }, input), /invalid expense/);
});
