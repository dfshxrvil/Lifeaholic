# Finance rebuild in progress

Migration `010_rebuild_finance.sql` defines the new integer-paise participant ledger, immutable revisions, settlements, invitations, RLS policies, invariant triggers, and the only permitted finance RPC boundary. It is a clean-slate design and does not reuse the retired backend.

The TypeScript domain types and exact money/ledger utilities live under `src/types/finance.ts` and `src/domain/finance/`. `src/repositories/financeRepository.ts` is the sole client-side finance persistence boundary and validates every RPC response before exposing domain objects.

The hooks under `src/hooks/finance/` clear data on account changes, reject stale responses, paginate expense history, and retain idempotency keys across retries of the same logical action. The existing screen and modal shells are connected to these hooks for personal and group expenses, immutable edits, archives, invitations, rosters, balances, and settlements. The widget deep link continues to open the expense composer.

Apply migration 009 before migration 010 on an existing database. Editing this repository does not apply either migration to a hosted database.
