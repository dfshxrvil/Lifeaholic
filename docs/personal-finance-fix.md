# Personal expense ledger fix

The deployed database has `expense_payments` and balance validation absent from the original repository migrations. The old app submitted an expense and its owed share in separate requests, without submitting the payment. A ₹10 personal entry therefore failed with paid ₹0 / owed ₹10 / expected ₹10.

## Apply

Run `supabase/migrations/006_personal_expense_ledger.sql` and then `supabase/migrations/007_atomic_expense_ledger.sql` in the project's Supabase SQL editor, then deploy/rebuild the updated app. Apply earlier migrations first on a new database. Migration 006 preserves existing ledger triggers and group functions, creates the payment table only if absent, and adds an authenticated personal-save RPC. Migration 007 extends the same atomic ledger write to shared expenses. Neither migration rewrites existing expense records.

The RPCs authenticate the caller, verify personal ownership or group membership, and write the expense, payment, and every owed share in one transaction. They use a stable expense ID for retries and serialize concurrent writes to that ID. Any failure rolls back all ledger rows. Personal and shared edits use the same transaction; deleting an expense uses the existing cascading foreign keys.

This workspace only has the public API key, so migrations must be applied through an authenticated Supabase dashboard or CLI session. The public API confirms that the personal-save RPC from migration 006 is live. Migration 007 still requires deployment. The verified live payment columns are `id`, `expense_id`, `user_id`, and `amount_paid`. Live verification is still required after applying migration 007, especially if additional custom mandatory columns or immediate triggers exist.

## Verification

```powershell
npm.cmd install --prefix artifacts/finance-test-runtime --no-save --package-lock=false @electric-sql/pglite
node --test tests/expenseErrors.test.mjs tests/personalExpenses.test.mjs tests/personalExpenseLedger.test.mjs
npm.cmd run typecheck
```

The database regression runs PostgreSQL in an isolated local runtime. It reproduces the missing-payment error with deferred balance checks, then verifies balanced personal and shared saving, idempotent retries, amount edits, all categories, rollback after a payment write fails, input limits, account and group isolation, unauthenticated access rejection, and cascading deletion. The simulated checks are not a copy of the unavailable live triggers.

After migration and app update, save a personal expense for ₹10 and a shared expense split between two group members. Verify each payment and the sum of its owed shares match the transaction amount, each entry appears in the selected month, and the totals update once. Retry with the same request ID to confirm there is one entry. Verify a historical date navigates to its month and search does not change the monthly total. Use disposable test entries for deletion checks.
