import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

let source = await readFile(new URL('../src/repositories/financeRepository.ts', import.meta.url), 'utf8');
source = source
  .replace("import { assertPaise, assertParticipantLedger, assertSignedPaise } from '@/domain/finance';", `
    const toPaise = (value) => typeof value === 'bigint' ? value : BigInt(value);
    const assertPaise = (value, options = {}) => {
      const result = toPaise(value);
      if (result < 0n || (!options.allowZero && result === 0n)) throw new Error('Invalid paise');
      return result;
    };
    const assertSignedPaise = toPaise;
    const assertParticipantLedger = (total, participants) => {
      const paid = participants.reduce((sum, item) => sum + item.amountPaidMinor, 0n);
      const owed = participants.reduce((sum, item) => sum + item.amountOwedMinor, 0n);
      if (paid !== total || owed !== total) throw new Error('Invalid ledger');
    };
  `)
  .replace("import { supabase } from '@/services/supabase';", 'const supabase = { rpc() { throw new Error("unused default client"); } };')
  .replace("import { FINANCE_CATEGORIES } from '@/types/finance';", "const FINANCE_CATEGORIES = ['Food', 'Online shopping', 'Investments', 'Laundry', 'Drinks', 'Grocery', 'Other'];")
  .replace(/import type \{[\s\S]*?\} from '@\/types\/finance';/, '');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const repositoryModule = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const { FinanceRepository, FinanceRepositoryError } = repositoryModule;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EXPENSE_ID = '22222222-2222-4222-8222-222222222222';
const LOGICAL_ID = '33333333-3333-4333-8333-333333333333';
const KEY = '44444444-4444-4444-8444-444444444444';
const expenseResponse = (money = '1050') => ({
  id: EXPENSE_ID,
  logicalExpenseId: LOGICAL_ID,
  revision: 1,
  supersedesExpenseId: null,
  groupId: null,
  description: 'Lunch',
  totalAmountMinor: money,
  currencyCode: 'INR',
  category: 'Food',
  customCategoryNote: null,
  expenseDate: '2026-09-15',
  createdBy: USER_ID,
  createdAt: '2026-09-15T12:00:00.000Z',
  status: 'active',
  participants: [{ userId: USER_ID, amountPaidMinor: money, amountOwedMinor: money }],
});

test('listExpenses sends the exact RPC signature and accepts safe integer transit values', async () => {
  const calls = [];
  const client = { rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: { entries: [expenseResponse(1050)], totalAmountMinor: 1050, nextCursor: null }, error: null };
  } };
  const repository = new FinanceRepository(client);
  const result = await repository.listExpenses({ scope: 'personal', monthStart: '2026-09-01', search: ' lunch ', limit: 25 });
  assert.equal(result.entries[0].totalAmountMinor, 1050n);
  assert.deepEqual(calls[0], {
    name: 'finance_list_expenses',
    args: {
      p_scope: 'personal', p_month_start: '2026-09-01', p_group_id: null, p_search: 'lunch',
      p_cursor_date: null, p_cursor_created_at: null, p_cursor_id: null, p_limit: 25,
    },
  });
});

test('createExpense serializes bigint paise and new categories as the canonical payload', async () => {
  let call;
  const client = { rpc: async (name, args) => { call = { name, args }; return { data: { ...expenseResponse(), category: 'Laundry' }, error: null }; } };
  const repository = new FinanceRepository(client);
  await repository.createExpense({
    idempotencyKey: KEY,
    groupId: null,
    description: ' Laundry ',
    totalAmountMinor: 1050n,
    category: 'Laundry',
    customCategoryNote: null,
    expenseDate: '2026-09-15',
    participants: [{ userId: USER_ID, amountPaidMinor: 1050n, amountOwedMinor: 1050n }],
  });
  assert.equal(call.name, 'finance_create_expense');
  assert.equal(call.args.p_payload.totalAmountMinor, '1050');
  assert.equal(call.args.p_payload.participants[0].amountPaidMinor, '1050');
  assert.equal(call.args.p_payload.category, 'Laundry');
});

test('create and edit serialize local-offset transaction times to UTC and preserve returned precision', async () => {
  const calls = [];
  const repository = new FinanceRepository({ rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: { ...expenseResponse(), transactionTimestamp: args.p_payload.transactionTimestamp }, error: null };
  } });
  const draft = {
    idempotencyKey: KEY, groupId: null, description: 'Late snack', totalAmountMinor: 1050n,
    category: 'Food', customCategoryNote: null, expenseDate: '2024-02-29',
    transactionTimestamp: '2024-02-29T00:05:32.123+05:30',
    participants: [{ userId: USER_ID, amountPaidMinor: 1050n, amountOwedMinor: 1050n }],
  };
  const expected = '2024-02-28T18:35:32.123Z';
  assert.equal((await repository.createExpense(draft)).transactionTimestamp, expected);
  assert.equal((await repository.editExpense(EXPENSE_ID, draft)).transactionTimestamp, expected);
  assert.deepEqual(calls.map(call => call.name), ['finance_create_expense', 'finance_edit_expense']);
  for (const call of calls) {
    assert.equal(call.args.p_payload.transactionTimestamp, expected);
    assert.equal(call.args.p_payload.expenseDate, '2024-02-29');
  }
  for (const invalid of ['invalid', '2024-02-29T12:00:00', new Date(Date.now() + 86400000).toISOString()]) {
    await assert.rejects(repository.createExpense({ ...draft, transactionTimestamp: invalid }), error => error.code === 'FINANCE_INPUT');
  }
  assert.equal(calls.length, 2);
});

test('contract and RPC failures retain the operation, expense ID, code, details, and hint', async () => {
  const malformed = { ...expenseResponse(), totalAmountMinor: 1.5 };
  const malformedRepository = new FinanceRepository({ rpc: async () => ({ data: { entries: [malformed], totalAmountMinor: '1050', nextCursor: null }, error: null }) });
  await assert.rejects(
    malformedRepository.listExpenses({ scope: 'personal', monthStart: '2026-09-01' }),
    (error) => error instanceof FinanceRepositoryError
      && error.operation === 'finance_list_expenses'
      && error.code === 'FINANCE_CONTRACT'
      && error.message.includes(EXPENSE_ID),
  );

  const rpcRepository = new FinanceRepository({ rpc: async () => ({ data: null, error: { message: 'Denied', code: '42501', details: 'RLS', hint: 'Sign in again' } }) });
  await assert.rejects(
    rpcRepository.listExpenses({ scope: 'personal', monthStart: '2026-09-01' }),
    (error) => error.operation === 'finance_list_expenses' && error.code === '42501' && error.details === 'RLS' && error.hint === 'Sign in again',
  );
});
