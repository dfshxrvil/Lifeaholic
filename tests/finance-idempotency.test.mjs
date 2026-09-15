import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/domain/finance/idempotency.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { FinanceIdempotencyAction } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('an idempotency action retains its key across retries of the same input', () => {
  let sequence = 0;
  const action = new FinanceIdempotencyAction(() => `key-${++sequence}`);
  action.begin();
  const first = action.keyFor('same-input');
  assert.equal(action.keyFor('same-input'), first);
  assert.equal(sequence, 1);
});

test('a changed input, completed action, or explicit reset starts a new key', () => {
  let sequence = 0;
  const action = new FinanceIdempotencyAction(() => `key-${++sequence}`);
  action.begin();
  const first = action.keyFor('first-input');
  assert.notEqual(action.keyFor('changed-input'), first);
  action.complete();
  const afterComplete = action.keyFor('changed-input');
  action.reset();
  assert.notEqual(action.keyFor('changed-input'), afterComplete);
});

