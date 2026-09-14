import type { Paise } from '@/types/finance';

export const MAX_FINANCE_PAISE = 9_000_000_000_000_000n;

export class FinanceMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinanceMoneyError';
  }
}

export function assertPaise(value: bigint | number | string, options: { allowZero?: boolean } = {}): Paise {
  let paise: bigint;
  try {
    if (typeof value === 'bigint') paise = value;
    else if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw new FinanceMoneyError('Money must be a safe integer number of paise.');
      paise = BigInt(value);
    } else {
      if (!/^(0|[1-9]\d*)$/.test(value)) throw new FinanceMoneyError('Money must contain integer paise only.');
      paise = BigInt(value);
    }
  } catch (cause) {
    if (cause instanceof FinanceMoneyError) throw cause;
    throw new FinanceMoneyError('Money could not be represented as integer paise.');
  }
  if (paise < 0n || (!options.allowZero && paise === 0n)) throw new FinanceMoneyError(options.allowZero ? 'Money cannot be negative.' : 'Money must be greater than zero.');
  if (paise > MAX_FINANCE_PAISE) throw new FinanceMoneyError('Money exceeds the supported maximum.');
  return paise;
}

export function assertSignedPaise(value: bigint | number | string): Paise {
  let paise: bigint;
  try {
    if (typeof value === 'bigint') paise = value;
    else if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw new FinanceMoneyError('Money must be a safe integer number of paise.');
      paise = BigInt(value);
    } else {
      if (!/^-?(0|[1-9]\d*)$/.test(value)) throw new FinanceMoneyError('Money must contain integer paise only.');
      paise = BigInt(value);
    }
  } catch (cause) {
    if (cause instanceof FinanceMoneyError) throw cause;
    throw new FinanceMoneyError('Money could not be represented as integer paise.');
  }
  if (paise < -MAX_FINANCE_PAISE || paise > MAX_FINANCE_PAISE) throw new FinanceMoneyError('Money exceeds the supported maximum.');
  return paise;
}

export function parseRupeesToPaise(input: string, options: { allowZero?: boolean } = {}): Paise {
  const normalized = input.trim().replace(/^₹\s*/, '');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    throw new FinanceMoneyError('Enter a rupee amount with no more than two decimal places.');
  }
  const [whole = '0', fraction = ''] = normalized.split('.');
  return assertPaise(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')), options);
}

export function formatPaiseDecimal(value: bigint | number, locale = 'en-IN'): string {
  const paise = assertSignedPaise(value);
  const absolute = paise < 0n ? -paise : paise;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${paise < 0n ? '−' : ''}${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole)}.${fraction}`;
}

export function formatPaiseAsInr(value: bigint | number, locale = 'en-IN'): string {
  const decimal = formatPaiseDecimal(value, locale);
  return decimal.startsWith('−') ? `−₹${decimal.slice(1)}` : `₹${decimal}`;
}

export function paiseToRupeeInput(value: bigint | number): string {
  const paise = assertPaise(value, { allowZero: true });
  return `${paise / 100n}.${(paise % 100n).toString().padStart(2, '0')}`;
}
