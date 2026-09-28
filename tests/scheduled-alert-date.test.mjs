import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/scheduledAlertDate.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { scheduledAlertDate, scheduledAlertTimestamp } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('scheduled alerts preserve the selected local date and time', () => {
  const value = scheduledAlertDate('2026-12-31', '23:59');
  assert.ok(value);
  assert.equal(value.getFullYear(), 2026);
  assert.equal(value.getMonth(), 11);
  assert.equal(value.getDate(), 31);
  assert.equal(value.getHours(), 23);
  assert.equal(value.getMinutes(), 59);
  assert.equal(value.getSeconds(), 0);
});

test('scheduled alert validation rejects malformed and impossible values', () => {
  assert.equal(scheduledAlertDate('2026-02-29', '09:00'), null);
  assert.equal(scheduledAlertDate('2026-04-31', '09:00'), null);
  assert.equal(scheduledAlertDate('2026-01-01', '24:00'), null);
  assert.equal(scheduledAlertDate('01/01/2026', '09:00'), null);
  assert.ok(Number.isNaN(scheduledAlertTimestamp({ date: 'invalid', time: '09:00' })));
});
