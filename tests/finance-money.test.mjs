import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/domain/finance/money.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const money = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('INR display formatting handles zero, signs, paise, and Indian grouping', () => {
  assert.equal(money.formatPaiseAsInr(0n), '₹0.00');
  assert.equal(money.formatPaiseAsInr(15_050n), '₹150.50');
  assert.equal(money.formatPaiseAsInr(-123_456_789n), '−₹12,34,567.89');
});

test('money formatting sends a safe number rather than bigint across the Intl boundary', () => {
  const OriginalNumberFormat = Intl.NumberFormat;
  const receivedTypes = [];
  Intl.NumberFormat = class {
    format(value) {
      receivedTypes.push(typeof value);
      return String(value);
    }
  };
  try {
    assert.equal(money.formatPaiseAsInr(12_345n), '₹123.45');
  } finally {
    Intl.NumberFormat = OriginalNumberFormat;
  }
  assert.deepEqual(receivedTypes, ['number']);
});

test('the maximum supported paise value remains exact after whole-rupee conversion', () => {
  const wholeRupees = money.MAX_FINANCE_PAISE / 100n;
  assert.equal(BigInt(Number(wholeRupees)), wholeRupees);
  assert.match(money.formatPaiseAsInr(money.MAX_FINANCE_PAISE), /^₹[\d,]+\.00$/);
});
