import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/expenseTimestamp.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { mergeExpenseTimestamp, formatExpenseDate, formatExpenseTime } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('date and time selection preserve the other local component, including month boundaries', () => {
  const original = new Date(2026, 0, 31, 17, 25, 32, 123);
  const backdated = mergeExpenseTimestamp(original, new Date(2024, 1, 29), 'date');
  assert.equal(backdated.getFullYear(), 2024);
  assert.equal(backdated.getMonth(), 1);
  assert.equal(backdated.getDate(), 29);
  assert.equal(backdated.getHours(), 17);
  assert.equal(backdated.getMinutes(), 25);
  assert.equal(backdated.getSeconds(), 32);
  const timed = mergeExpenseTimestamp(backdated, new Date(2026, 8, 15, 0, 5), 'time');
  assert.equal(timed.toDateString(), backdated.toDateString());
  assert.equal(timed.getHours(), 0);
  assert.equal(timed.getMinutes(), 5);
  assert.equal(timed.getSeconds(), 0);
  assert.equal(timed.getMilliseconds(), 0);
  assert.equal(original.getFullYear(), 2026);
});

test('chips label relative dates across year boundaries and midnight/noon in 12-hour time', () => {
  const now = new Date(2026, 0, 1, 12);
  assert.equal(formatExpenseDate(now, now), 'Today');
  assert.equal(formatExpenseDate(new Date(2025, 11, 31), now), 'Yesterday');
  assert.equal(formatExpenseDate(new Date(2025, 11, 30), now), '30 Dec 2025');
  assert.equal(formatExpenseTime(new Date(2026, 0, 1)), '12:00 AM');
  assert.equal(formatExpenseTime(now), '12:00 PM');
  assert.equal(formatExpenseTime(new Date(2026, 0, 1, 17)), '05:00 PM');
});

test('PostgreSQL create/edit RPCs store exact historical timestamps and reject future instants', async () => {
  const db = new PGlite();
  const actor = '11111111-1111-4111-8111-111111111111';
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '${actor}'::uuid $$;
      create table public.profiles (id uuid primary key, username text, email text);
      insert into public.profiles values ('${actor}', 'Tester', 'test@example.com');
    `);
    for (const file of ['010_rebuild_finance.sql', '011_add_finance_categories.sql', '012_finance_rpc_contract_hardening.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    const draft = () => ({
      idempotencyKey: randomUUID(), groupId: null, description: 'Historical expense', totalAmountMinor: '1050',
      category: 'Food', customCategoryNote: null, expenseDate: '2024-02-29',
      participants: [{ userId: actor, amountPaidMinor: '1050', amountOwedMinor: '1050' }],
    });
    const create = async payload => (await db.query('select public.finance_create_expense($1::jsonb) as expense', [JSON.stringify(payload)])).rows[0].expense;
    const legacy = await create(draft());
    const migration = await readFile(new URL('../supabase/migrations/013_finance_transaction_timestamp.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Safe to reapply.
    assert.equal((await db.query('select transaction_timestamp from public.finance_expenses where id = $1', [legacy.id])).rows[0].transaction_timestamp, null);

    // Just after local midnight in India: the UTC date is the preceding day.
    const iso = new Date('2024-02-29T00:05:32.123+05:30').toISOString();
    const payload = { ...draft(), transactionTimestamp: iso };
    const saved = await create(payload);
    assert.equal(new Date(saved.transactionTimestamp).toISOString(), iso);
    assert.equal(saved.expenseDate, '2024-02-29');
    assert.notEqual(new Date(saved.createdAt).toISOString(), iso);
    const stored = (await db.query('select transaction_timestamp from public.finance_expenses where id = $1', [saved.id])).rows[0];
    assert.equal(stored.transaction_timestamp.toISOString(), iso);
    assert.equal((await create(payload)).id, saved.id);

    const edited = (await db.query('select public.finance_edit_expense($1, $2::jsonb) as expense', [saved.id, JSON.stringify({ ...payload, idempotencyKey: randomUUID(), description: 'Edited description' })])).rows[0].expense;
    assert.equal(new Date(edited.transactionTimestamp).toISOString(), iso);
    assert.equal(edited.revision, 2);
    const revisedIso = '2024-02-29T11:30:00.000Z';
    const revised = (await db.query('select public.finance_edit_expense($1, $2::jsonb) as expense', [edited.id, JSON.stringify({ ...payload, idempotencyKey: randomUUID(), transactionTimestamp: revisedIso })])).rows[0].expense;
    assert.equal(new Date(revised.transactionTimestamp).toISOString(), revisedIso);

    for (const invalid of [new Date(Date.now() + 86400000).toISOString(), 'infinity', 'invalid', '2024-02-29T12:00:00', null]) {
      await assert.rejects(create({ ...draft(), transactionTimestamp: invalid }), error => error.code === '22023');
    }
    assert.equal((await db.query('select count(*)::int as count from public.finance_expenses')).rows[0].count, 4);
  } finally {
    await db.close();
  }
});
