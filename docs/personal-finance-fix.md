# Personal expense ledger fix

The deployed database has `expense_payments` and balance validation absent from the original repository migrations. The old app submitted an expense and its owed share in separate requests, without submitting the payment. A ₹10 personal entry therefore failed with paid ₹0 / owed ₹10 / expected ₹10.

## Apply

Run `supabase/migrations/006_personal_expense_ledger.sql` in the project's Supabase SQL editor, then deploy/rebuild the updated app. Apply earlier migrations first on a new database. Migration 006 preserves existing ledger triggers and group functions, creates the payment table only if absent, and adds an authenticated personal-save RPC. No existing expense records are rewritten by the migration.

The RPC authenticates the caller, restricts edits to their personal expenses, and writes the expense, payment, and owed share in one transaction. It uses a stable expense ID for retries and serializes concurrent writes to that ID. Any failure rolls back all three writes. Personal edits use the same transaction; deleting an expense uses the existing cascading foreign keys.

This workspace only has the public API key. The migration has **not** been applied to the live database, and its full custom trigger definitions are not available here. The verified live payment columns are `id`, `expense_id`, `user_id`, and `amount_paid`. Live verification is still required after applying the migration, especially if additional custom mandatory columns or immediate triggers exist.

## Verification

```powershell
npm.cmd install --prefix artifacts/finance-test-runtime --no-save --package-lock=false @electric-sql/pglite
node --test tests/expenseErrors.test.mjs tests/personalExpenses.test.mjs tests/personalExpenseLedger.test.mjs
npm.cmd run typecheck
```

The database regression runs PostgreSQL in an isolated local runtime. It reproduces the missing-payment error with deferred balance checks, then verifies ₹10 saving, idempotent retries, amount edits, all categories, rollback after a payment write fails, input limits, account isolation, unauthenticated access rejection, and cascading deletion. The simulated checks are not a copy of the unavailable live triggers.

After migration and app update, save a personal expense for ₹10. Verify its payment and owed share are both ₹10, it appears in the selected month, and the monthly total increases by ₹10. Retry with the same request ID to confirm there is one entry. Verify a historical date navigates to its month and search does not change the monthly total. Use a disposable test entry for deletion checks.
