// Supabase can return plain error objects rather than Error instances.
export function expenseErrorMessage(cause: unknown, fallback: string): string {
  if (typeof cause === 'object' && cause !== null && 'message' in cause
    && typeof cause.message === 'string' && cause.message.trim()) {
    return cause.message;
  }
  return fallback;
}

export function validateExpenseDetails(description: string, amount: number): void {
  if (!description.trim()) throw new Error('Add a description.');
  if ([...description.trim()].length > 200) throw new Error('Keep the description to 200 characters or fewer.');
  // Match numeric(10, 2), including the rounding performed by PostgreSQL.
  const roundedAmount = Math.round(amount * 100) / 100;
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) throw new Error('Enter an amount of at least 0.01.');
  if (roundedAmount > 99999999.99) throw new Error('Enter an amount no greater than 99,999,999.99.');
  if (Math.abs(amount - roundedAmount) > 0.00000001) throw new Error('Use at most two decimal places.');
}

export function parseExpenseAmount(value: string): number {
  const text = value.trim().replace(/^₹\s*/, '');
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{0,2})?|\.\d{1,2})$/.test(text)) {
    throw new Error('Enter a valid amount with at most two decimal places.');
  }
  const amount = Number(text.replace(/,/g, ''));
  validateExpenseDetails('Expense', amount);
  return amount;
}
