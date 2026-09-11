-- Personal entries must commit their payment and owed share together.
-- Some deployed projects already have expense_payments and deferred ledger checks.
-- Preserve those checks and the existing group-expense functions.
begin;

create table if not exists public.expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount_paid numeric(10, 2) not null check (amount_paid > 0),
  unique (expense_id, user_id)
);
alter table public.expense_payments enable row level security;

create or replace function public.save_personal_expense_v1(
  p_id uuid,
  p_description text,
  p_amount numeric,
  p_expense_date date,
  p_category text,
  p_custom_category_note text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved public.expenses;
  share public.expense_splits;
begin
  if actor is null then raise exception 'Sign in to save an expense.'; end if;
  if p_id is null then raise exception 'Expense ID is required.'; end if;
  if p_description is null or char_length(trim(p_description)) not between 1 and 200 then
    raise exception 'Add a description of 1 to 200 characters.';
  end if;
  if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity')
    or p_amount < 0.01 or p_amount > 99999999.99 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter an amount between 0.01 and 99,999,999.99 with at most two decimal places.';
  end if;
  if p_expense_date is null then raise exception 'Choose an expense date.'; end if;
  if p_category is null or p_category not in ('Food', 'Online shopping', 'Investments', 'Other') then
    raise exception 'Choose a valid category.';
  end if;
  if p_category = 'Other' and nullif(trim(p_custom_category_note), '') is null then
    raise exception 'Add a note for the Other category.';
  end if;

  -- Serialize retries/edits for this ID, including concurrent first submissions.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 0));
  select * into saved from public.expenses where id = p_id for update;
  if found and (saved.created_by <> actor or saved.group_id is not null) then
    raise exception 'This personal expense cannot be changed by this account.';
  end if;

  -- Existing deferrable balance constraints must see the complete transaction.
  set constraints all deferred;
  insert into public.expenses (id, created_by, group_id, description, amount,
    expense_date, paid_by, split_type, category, custom_category_note)
  values (p_id, actor, null, trim(p_description), p_amount,
    p_expense_date, actor, 'personal', p_category,
    case when p_category = 'Other' then trim(p_custom_category_note) else null end)
  on conflict (id) do update set description = excluded.description,
    amount = excluded.amount, expense_date = excluded.expense_date,
    paid_by = excluded.paid_by, split_type = excluded.split_type,
    category = excluded.category, custom_category_note = excluded.custom_category_note
  returning * into saved;

  delete from public.expense_payments where expense_id = p_id;
  insert into public.expense_payments (expense_id, user_id, amount_paid)
    values (p_id, actor, p_amount);
  delete from public.expense_splits where expense_id = p_id;
  insert into public.expense_splits (expense_id, user_id, amount_owed, is_settled)
    values (p_id, actor, p_amount, false) returning * into share;

  return to_jsonb(saved) || jsonb_build_object('splits', jsonb_build_array(to_jsonb(share)));
end;
$$;

revoke all on function public.save_personal_expense_v1(uuid, text, numeric, date, text, text) from public;
grant execute on function public.save_personal_expense_v1(uuid, text, numeric, date, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
