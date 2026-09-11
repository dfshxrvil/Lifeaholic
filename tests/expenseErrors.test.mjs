import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/expenseErrors.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { expenseErrorMessage, validateExpenseDetails, parseExpenseAmount } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('preserves plain Supabase errors and native validation errors', () => {
  assert.equal(expenseErrorMessage({ code: '42501', message: 'new row violates row-level security policy' }, 'Unable to add expense.'), 'new row violates row-level security policy');
  assert.equal(expenseErrorMessage(new Error('Add a description.'), 'fallback'), 'Add a description.');
  for (const error of [null, undefined, {}, { message: 123 }, { message: ' ' }]) {
    assert.equal(expenseErrorMessage(error, 'fallback'), 'fallback');
  }
});

test('parses rupees without silently changing invalid input', () => {
  for (const [input, expected] of [['10', 10], ['10.50', 10.5], ['.50', 0.5], ['₹ 1,000.25', 1000.25], ['1,00,000', 100000]]) {
    assert.equal(parseExpenseAmount(input), expected);
  }
  for (const input of ['-10', '10abc', '1e3', '', '0', '1.234', '1.2.3', '1,2', '1 0', 'Infinity']) {
    assert.throws(() => parseExpenseAmount(input), input);
  }
});

test('validates database limits before writing an expense', () => {
  for (const amount of [0, -1, 0.001, NaN, Infinity, 100000000, 99999999.999]) {
    assert.throws(() => validateExpenseDetails('Lunch', amount));
  }
  for (const amount of [0.01, 12.50, 99999999.99]) {
    assert.doesNotThrow(() => validateExpenseDetails('Lunch', amount));
  }
  assert.throws(() => validateExpenseDetails(' ', 1));
  assert.throws(() => validateExpenseDetails('x'.repeat(201), 1));
  assert.doesNotThrow(() => validateExpenseDetails('x'.repeat(200), 1));
  assert.doesNotThrow(() => validateExpenseDetails('😀'.repeat(200), 1));
});
