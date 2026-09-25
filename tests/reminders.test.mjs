import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/reminderGrouping.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { groupReminders } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const reminder = (id, target_date, target_time = '09:00:00') => ({
  id, user_id: 'user', title: id, target_date, target_time, alert_type: 'standard',
  is_completed: false, notification_id: null, created_at: '2026-01-01T00:00:00Z',
});

test('reminders are sorted and grouped into overdue, today, tomorrow, and later', () => {
  const groups = groupReminders([
    reminder('later', '2026-10-02'),
    reminder('today-late', '2026-09-25', '17:00:00'),
    reminder('overdue', '2026-09-24'),
    reminder('tomorrow', '2026-09-26'),
    reminder('today-early', '2026-09-25', '08:00:00'),
  ], new Date(2026, 8, 25, 12));
  assert.deepEqual(groups.map(group => group.title), ['Overdue', 'Today', 'Tomorrow', 'Later']);
  assert.deepEqual(groups[1].data.map(item => item.id), ['today-early', 'today-late']);
});

test('015 migration creates a constrained, row-secured reminders table', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create table auth.users (id uuid primary key);
      insert into auth.users values ('11111111-1111-4111-8111-111111111111');
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    `);
    const migration = await readFile(new URL('../supabase/migrations/015_standalone_reminders.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const table = (await db.query("select relrowsecurity from pg_class where oid = 'public.reminders'::regclass")).rows[0];
    assert.equal(table.relrowsecurity, true);
    const policyCount = (await db.query("select count(*)::int as count from pg_policies where schemaname = 'public' and tablename = 'reminders'")).rows[0].count;
    assert.equal(policyCount, 4);
    await assert.rejects(
      db.query("insert into public.reminders(user_id, title, target_date, target_time, alert_type) values ('11111111-1111-4111-8111-111111111111', 'Test', '2026-09-25', '09:00', 'loud')"),
    );
  } finally {
    await db.close();
  }
});
