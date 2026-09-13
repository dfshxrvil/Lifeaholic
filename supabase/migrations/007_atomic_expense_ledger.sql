-- Save both personal and shared expenses as a complete, balanced ledger.
begin;

create or replace function public.save_expense_ledger_v2(
  p_id uuid,
  p_description text,
  p_amount numeric,
  p_expense_date date,
  p_category text,
  p_custom_category_note text,
  p_group_id uuid,
  p_paid_by uuid,
  p_split_type text,
  p_splits jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved public.expenses;
  split_total numeric;
  split_count integer;
  saved_splits jsonb;
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
  if p_paid_by is null then raise exception 'Choose who paid.'; end if;
  if (p_group_id is null and p_split_type <> 'personal')
    or (p_group_id is not null and p_split_type not in ('split_equally', 'you_owed_full', 'other_owed_full', 'custom')) then
    raise exception 'Choose a valid split type.';
  end if;
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'Add at least one expense split.';
  end if;

  begin
    select count(*), coalesce(sum(item.amount), 0)
      into split_count, split_total
    from jsonb_to_recordset(p_splits) as item(user_id uuid, amount numeric, is_settled boolean)
    where item.user_id is not null and item.amount is not null
      and item.amount >= 0 and item.amount = round(item.amount, 2);
  exception when others then
    raise exception 'Expense splits are invalid.';
  end;
  if split_count <> jsonb_array_length(p_splits) then raise exception 'Expense splits are invalid.'; end if;
  if split_total <> p_amount then raise exception 'Expense splits must add up to the expense total.'; end if;
  if (select count(distinct item.user_id) from jsonb_to_recordset(p_splits) as item(user_id uuid, amount numeric, is_settled boolean)) <> split_count then
    raise exception 'Each person can appear only once in an expense split.';
  end if;

  if p_group_id is null then
    if p_paid_by <> actor or split_count <> 1 or not exists (
      select 1 from jsonb_to_recordset(p_splits) as item(user_id uuid, amount numeric, is_settled boolean)
      where item.user_id = actor and item.amount = p_amount
    ) then raise exception 'A personal expense must be paid and owed by this account.'; end if;
  else
    if not public.is_group_member(p_group_id, actor) then raise exception 'You are not a member of this group.'; end if;
    if not public.is_group_member(p_group_id, p_paid_by) then raise exception 'The payer must be a group member.'; end if;
    if exists (
      select 1 from jsonb_to_recordset(p_splits) as item(user_id uuid, amount numeric, is_settled boolean)
      where not public.is_group_member(p_group_id, item.user_id)
    ) then raise exception 'Every expense split must belong to a group member.'; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 0));
  select * into saved from public.expenses where id = p_id for update;
  if found and (
    (saved.group_id is null and (p_group_id is not null or saved.created_by <> actor))
    or (saved.group_id is not null and (p_group_id is distinct from saved.group_id or not public.is_group_member(saved.group_id, actor)))
  ) then raise exception 'This expense cannot be changed by this account.'; end if;

  set constraints all deferred;
  insert into public.expenses (id, created_by, group_id, description, amount,
    expense_date, paid_by, split_type, category, custom_category_note)
  values (p_id, actor, p_group_id, trim(p_description), p_amount,
    p_expense_date, p_paid_by, p_split_type, p_category,
    case when p_category = 'Other' then trim(p_custom_category_note) else null end)
  on conflict (id) do update set description = excluded.description,
    amount = excluded.amount, expense_date = excluded.expense_date,
    paid_by = excluded.paid_by, split_type = excluded.split_type,
    category = excluded.category, custom_category_note = excluded.custom_category_note
  returning * into saved;

  delete from public.expense_payments where expense_id = p_id;
  insert into public.expense_payments (expense_id, user_id, amount_paid)
    values (p_id, p_paid_by, p_amount);
  delete from public.expense_splits where expense_id = p_id;
  insert into public.expense_splits (expense_id, user_id, amount_owed, is_settled)
    select p_id, item.user_id, item.amount, coalesce(item.is_settled, false)
    from jsonb_to_recordset(p_splits) as item(user_id uuid, amount numeric, is_settled boolean);

  select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
    into saved_splits from public.expense_splits item where item.expense_id = p_id;
  return to_jsonb(saved) || jsonb_build_object('splits', saved_splits);
end;
$$;

revoke all on function public.save_expense_ledger_v2(uuid, text, numeric, date, text, text, uuid, uuid, text, jsonb) from public;
grant execute on function public.save_expense_ledger_v2(uuid, text, numeric, date, text, text, uuid, uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
