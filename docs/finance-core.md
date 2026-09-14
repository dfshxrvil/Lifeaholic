# Finance core architecture

The finance tracker keeps React state, business rules, and persistence in separate layers. The screen and modals depend on the existing hooks and do not contain ledger rules.

## Domain

`src/features/finance/domain.ts` is pure TypeScript. It parses and validates amounts and dates, converts all money to integer cents, allocates equal/full/custom splits, builds complete create and update commands, validates stored ledgers, and calculates totals and balances. It has no React, Expo, or Supabase dependency.

Every ledger command has one expense ID, one payer, a scope and split type that agree, and unique shares whose integer-cent sum exactly matches the expense. Metadata edits preserve settlement state. Financial edits calculate a fresh distribution and reset settlement state.

## Repository

`src/features/finance/repository.ts` is the only client-side module that talks to finance tables or RPCs. Reads load expenses and all related splits in two bounded queries, then validate every returned ledger before exposing it. Writes use `save_expense_ledger_v2`; there is no partial table-write fallback. Deletes, settlement changes, and member removal use the server-side functions added by migration 008.

Profile search avoids constructing PostgREST boolean expressions from user input. Group directory assembly and profile joins also live in the repository.

## Hooks

`useExpenses` and `useGroups` coordinate authenticated state, request cancellation, refreshes, and errors. They delegate calculations and persistence to the domain and repository. Request-version guards prevent a response from a previous user or filter scope from replacing current state.

## Database invariants

Migration 007 atomically writes the expense, payment, and every owed share. Migration 008 keeps lifecycle operations on the server, exposes payment rows only to accounts that can access the expense, prevents deletion by unauthorized accounts, and prevents removing a group member whose identity is part of the group's financial history.

The database regression executes these migrations in PostgreSQL, reproduces the original missing-payment failure, and checks retries, rollback, ownership, group membership, settlement, protected removal, and cascading deletion.
