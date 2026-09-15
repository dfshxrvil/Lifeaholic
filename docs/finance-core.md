# Finance rebuild in progress

Migration `010_rebuild_finance.sql` defines the new integer-paise participant ledger, immutable revisions, settlements, invitations, RLS policies, invariant triggers, and the only permitted finance RPC boundary. It is a clean-slate design and does not reuse the retired backend.

The TypeScript domain types and exact money/ledger utilities live under `src/types/finance.ts` and `src/domain/finance/`. `src/repositories/financeRepository.ts` is the sole client-side finance persistence boundary and validates every RPC response before exposing domain objects.

The hooks under `src/hooks/finance/` clear data on account changes, reject stale responses, paginate expense history, and retain idempotency keys across retries of the same logical action. The existing screen and modal shells are connected to these hooks for personal and group expenses, immutable edits, archives, invitations, rosters, balances, and settlements. The widget deep link continues to open the expense composer.

Apply migration 009 before migration 010 on an existing database. Editing this repository does not apply either migration to a hosted database.

## Transaction date and time

Apply migrations through `013_finance_transaction_timestamp.sql` before releasing the date/time picker client. The create and edit RPCs accept `transactionTimestamp` as an ISO timestamp with a timezone and store it in `finance_expenses.transaction_timestamp` (`timestamptz`). `expenseDate` remains the selected local date for monthly reporting, even when its UTC timestamp falls on another day. `created_at` retains the insertion time used by audit and membership-access rules.

Legacy expenses have a null transaction timestamp because their actual time was not recorded. The editor starts these at midnight on their expense date and prompts the user to choose a time. Older clients may still omit the timestamp. Future timestamps are rejected in the picker handler, repository, and RPC; Android's native time dialog cannot disable individual future times.

The native dependency requires a new app build (including CocoaPods installation on macOS for iOS). Web uses browser date/time inputs. Run `npm test` for local PostgreSQL migration, create/edit, UTC precision, legacy compatibility, and future-time rejection coverage; run `npx tsc --noEmit` for types.
