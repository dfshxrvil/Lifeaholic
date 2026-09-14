-- Permanently remove the retired finance backend and all stored finance data.
begin;

drop function if exists public.save_personal_expense_v1(uuid, text, numeric, date, text, text);
drop function if exists public.save_expense_ledger_v2(uuid, text, numeric, date, text, text, uuid, uuid, text, jsonb);
drop function if exists public.delete_finance_expense_v3(uuid);
drop function if exists public.remove_group_member_v3(uuid, uuid);
drop function if exists public.set_expense_split_settled_v3(uuid, uuid, boolean);

drop table if exists public.expense_payments;
drop table if exists public.expense_splits;
drop table if exists public.expenses;
drop table if exists public.group_members;
drop table if exists public.groups;

drop function if exists public.can_access_expense(uuid, uuid);
drop function if exists public.is_group_member(uuid, uuid);
drop function if exists public.is_group_creator(uuid, uuid);
drop function if exists public.add_group_creator_as_member();

-- Remove the profile discovery policy added solely for group invitations.
drop policy if exists "profiles_select_authenticated" on public.profiles;

commit;
