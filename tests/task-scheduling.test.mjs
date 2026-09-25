import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

const dateSource = await readFile(new URL('../src/utils/scheduledAlertDate.ts', import.meta.url), 'utf8');
const taskSource = (await readFile(new URL('../src/utils/taskScheduling.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '');
const { outputText } = ts.transpileModule(`${dateSource}\n${taskSource}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { taskTriggerDate, sortTasksForDate } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const task = (id, task_time, created_at = '2026-09-25T00:00:00Z') => ({
  id, user_id: 'user', title: id, description: null, date: '2026-09-25', original_date: '2026-09-25',
  task_time, reminder_offset: null, notification_id: null, is_completed: false, priority: 'red', completed_at: null,
  created_at, subtasks: [],
});

test('task reminder trigger subtracts the selected offset from local task time', () => {
  const trigger = taskTriggerDate('2026-09-25', '14:30:00', 60);
  assert.ok(trigger);
  assert.equal(trigger.getFullYear(), 2026);
  assert.equal(trigger.getMonth(), 8);
  assert.equal(trigger.getDate(), 25);
  assert.equal(trigger.getHours(), 13);
  assert.equal(trigger.getMinutes(), 30);
});

test('today sorts upcoming times, then passed times, then all-day tasks', () => {
  const sorted = sortTasksForDate([
    task('all-day', null), task('passed', '08:00:00'), task('later', '15:00:00'), task('nearest', '13:00:00'),
  ], '2026-09-25', new Date(2026, 8, 25, 12));
  assert.deepEqual(sorted.map(item => item.id), ['nearest', 'later', 'passed', 'all-day']);
});

test('014 migration adds nullable time and constrained reminder metadata', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.tasks (
        id uuid primary key, user_id uuid not null, title text not null, date date not null,
        is_completed boolean not null default false
      );
    `);
    const migration = await readFile(new URL('../supabase/migrations/014_task_time_and_reminders.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.query("insert into tasks(id,user_id,title,date,task_time,reminder_offset) values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Timed','2026-09-25','09:30',15)");
    await assert.rejects(db.query("insert into tasks(id,user_id,title,date,reminder_offset) values ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','Invalid','2026-09-25',15)"));
    await assert.rejects(db.query("insert into tasks(id,user_id,title,date,task_time,reminder_offset) values ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','Invalid','2026-09-25','09:30',10081)"));
    const saved = (await db.query("select task_time::text, reminder_offset, notification_id from tasks where title = 'Timed'")).rows[0];
    assert.equal(saved.task_time, '09:30:00');
    assert.equal(saved.reminder_offset, 15);
    assert.equal(saved.notification_id, null);
  } finally {
    await db.close();
  }
});
