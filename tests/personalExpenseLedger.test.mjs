import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
// Isolated dependency: npm install --prefix artifacts/finance-test-runtime --no-save --package-lock=false @electric-sql/pglite
import { PGlite } from '../artifacts/finance-test-runtime/node_modules/@electric-sql/pglite/dist/index.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const failedId = '44444444-4444-4444-8444-444444444444';

test('personal ledger saves atomically, retries safely, and enforces ownership', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.profiles (id uuid primary key, username text);
      insert into profiles values ('${alice}', 'alice'), ('${bob}', 'bob');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/003_finance_schema.sql', import.meta.url), 'utf8'));
    const iteration4 = await readFile(new URL('../supabase/migrations/004_iteration_four.sql', import.meta.url), 'utf8');
    await db.exec(iteration4.slice(iteration4.indexOf('-- Finance categories.'), iteration4.indexOf('-- Notes retain')));
    const migration = await readFile(new URL('../supabase/migrations/006_personal_expense_ledger.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    // Apply twice to check compatibility with an already-created payments table.
    await db.exec(migration);
    await db.exec(`
      create function public.check_test_ledger() returns trigger language plpgsql as $$
      declare eid uuid; expected numeric; paid numeric; owed numeric;
      begin
        if tg_table_name = 'expenses' then eid := coalesce(new.id, old.id);
        else eid := coalesce(new.expense_id, old.expense_id); end if;
        select amount into expected from expenses where id = eid;
        if not found then return null; end if;
        select coalesce(sum(amount_paid), 0) into paid from expense_payments where expense_id = eid;
        select coalesce(sum(amount_owed), 0) into owed from expense_splits where expense_id = eid;
        if paid <> expected or owed <> expected then
          raise exception 'Expense ledger is unbalanced: paid %, owed %, expected %', paid, owed, expected;
        end if;
        return null;
      end $$;
      create constraint trigger check_expense after insert or update or delete on expenses
        deferrable initially deferred for each row execute function check_test_ledger();
      create constraint trigger check_payment after insert or update or delete on expense_payments
        deferrable initially deferred for each row execute function check_test_ledger();
      create constraint trigger check_split after insert or update or delete on expense_splits
        deferrable initially deferred for each row execute function check_test_ledger();
      select set_config('request.jwt.claim.sub', '${alice}', false);
    `);
    const save = (amount = 10, expenseId = id, category = 'Food', note = null, description = 'Sample task') => db.query(
      'select save_personal_expense_v1($1, $2, $3, $4, $5, $6) as expense',
      [expenseId, description, amount, '2026-09-11', category, note],
    );
    const ledger = async () => (await db.query(`select e.amount,
      (select sum(amount_paid) from expense_payments where expense_id=e.id) as paid,
      (select sum(amount_owed) from expense_splits where expense_id=e.id) as owed
      from expenses e where id='${id}'`)).rows[0];

    // Reproduce the original missing-payment failure inside an isolated transaction.
    await assert.rejects(db.exec(`begin;
      insert into expenses (id, created_by, description, amount, paid_by, split_type, category)
        values ('${id}', '${alice}', 'Sample task', 10, '${alice}', 'personal', 'Food');
      insert into expense_splits (expense_id, user_id, amount_owed) values ('${id}', '${alice}', 10);
      commit;`), /unbalanced: paid 0, owed 10.00, expected 10.00/);
    await db.exec('rollback');

    await db.exec('set role authenticated');
    const first = (await save()).rows[0].expense;
    assert.equal(Number(first.amount), 10);
    assert.equal(first.paid_by, alice);
    assert.equal(first.splits.length, 1);
    assert.equal(first.splits[0].user_id, alice);
    assert.equal(Number(first.splits[0].amount_owed), 10);
    await save(); // same request ID after a lost response
    await save(12.50); // edit
    await db.exec('reset role');
    assert.deepEqual(Object.fromEntries(Object.entries(await ledger()).map(([k, v]) => [k, Number(v)])), { amount: 12.5, paid: 12.5, owed: 12.5 });
    for (const table of ['expenses', 'expense_payments', 'expense_splits']) {
      assert.equal((await db.query(`select count(*)::int as count from ${table}`)).rows[0].count, 1);
    }

    // A write failure after changing the expense must roll back the entire edit.
    await db.exec(`alter table expense_payments add constraint test_failure check (amount_paid <> 13)`);
    await assert.rejects(save(13));
    assert.equal(Number((await ledger()).amount), 12.5);
    await assert.rejects(save(13, failedId));
    assert.equal((await db.query(`select count(*)::int as count from expenses where id='${failedId}'`)).rows[0].count, 0);

    for (const amount of [0, -10, 0.001, 10.001, 100000000, 'NaN', 'Infinity']) await assert.rejects(save(amount));
    await assert.rejects(save(10, id, 'Other'));
    await assert.rejects(save(10, id, 'Unknown'));
    await assert.rejects(save(10, id, 'Food', null, 'x'.repeat(201)));
    for (const category of ['Food', 'Online shopping', 'Investments', 'Other']) {
      await save(10, id, category, category === 'Other' ? 'Sample note' : null);
    }
    await db.exec(`select set_config('request.jwt.claim.sub', '${bob}', false); set role authenticated`);
    await assert.rejects(save(), /cannot be changed by this account/);
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role authenticated`);
    await assert.rejects(save(), /Sign in/);
    await db.exec('reset role; set role anon');
    await assert.rejects(save(), /permission denied/);
    await db.exec('reset role');
    assert.equal(Number((await ledger()).paid), 10);
    // A single expense delete cascades both sides of the ledger.
    await db.exec(`delete from expenses where id='${id}'`);
    for (const table of ['expenses', 'expense_payments', 'expense_splits']) {
      assert.equal((await db.query(`select count(*)::int as count from ${table}`)).rows[0].count, 0);
    }
  } finally { await db.close(); }
});
