-- Harden the finance JSON boundary used by the mobile client.
-- This migration is forward-only and safe to re-run after migration 010.

create or replace function private.finance_expense_json(p_expense_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id,
    'logicalExpenseId', e.logical_expense_id,
    'revision', e.revision,
    'supersedesExpenseId', e.supersedes_expense_id,
    'groupId', e.group_id,
    'description', e.description,
    'totalAmountMinor', e.total_amount_minor::text,
    'currencyCode', e.currency_code,
    'category', e.category,
    'customCategoryNote', e.custom_category_note,
    'expenseDate', e.expense_date,
    'createdBy', e.created_by,
    'createdAt', e.created_at,
    'status', e.status,
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', p.user_id,
        'amountPaidMinor', p.amount_paid_minor::text,
        'amountOwedMinor', p.amount_owed_minor::text
      ) order by p.user_id)
      from public.finance_expense_participants p
      where p.expense_id = e.id
    ), '[]'::jsonb)
  )
  from public.finance_expenses e
  where e.id = p_expense_id;
$$;

create or replace function private.finance_settlement_json(p_settlement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'groupId', s.group_id,
    'payerId', s.payer_id,
    'payeeId', s.payee_id,
    'amountMinor', s.amount_minor::text,
    'currencyCode', s.currency_code,
    'settlementDate', s.settlement_date,
    'note', s.note,
    'createdBy', s.created_by,
    'createdAt', s.created_at,
    'status', s.status,
    'reversedAt', s.reversed_at,
    'reversedBy', s.reversed_by,
    'reversalReason', s.reversal_reason
  )
  from public.finance_settlements s
  where s.id = p_settlement_id;
$$;

create or replace function public.finance_create_expense(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_key uuid;
  v_fp text;
  v_existing public.finance_expenses;
  v_id uuid;
  v_logical uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  begin
    v_key := (p_payload->>'idempotencyKey')::uuid;
  exception when others then
    raise exception using errcode = '22023', message = 'Valid idempotency key required';
  end;
  v_fp := p_payload::text;
  select * into v_existing
  from public.finance_expenses
  where created_by = v_actor and idempotency_key = v_key;
  if found then
    if v_existing.request_fingerprint <> v_fp then
      raise exception using errcode = '23505', message = 'Idempotency key was reused with different input';
    end if;
    return private.finance_expense_json(v_existing.id);
  end if;
  v_id := private.finance_insert_expense(v_actor, p_payload, v_logical, 1, null);
  return private.finance_expense_json(v_id);
exception when unique_violation then
  select * into v_existing
  from public.finance_expenses
  where created_by = v_actor and idempotency_key = v_key;
  if v_existing.request_fingerprint is distinct from v_fp then
    raise exception using errcode = '23505', message = 'Idempotency key was reused with different input';
  end if;
  return private.finance_expense_json(v_existing.id);
end;
$$;

create or replace function public.finance_edit_expense(p_expense_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_old public.finance_expenses;
  v_key uuid;
  v_fp text;
  v_existing public.finance_expenses;
  v_id uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  begin v_key := (p_payload->>'idempotencyKey')::uuid;
  exception when others then raise exception using errcode = '22023', message = 'Valid idempotency key required'; end;
  v_fp := p_payload::text;
  select * into v_existing from public.finance_expenses where created_by = v_actor and idempotency_key = v_key;
  if found then
    if v_existing.request_fingerprint <> v_fp or v_existing.supersedes_expense_id is distinct from p_expense_id then
      raise exception using errcode = '23505', message = 'Idempotency key was reused with different input';
    end if;
    return private.finance_expense_json(v_existing.id);
  end if;
  select * into v_old from public.finance_expenses where id = p_expense_id for update;
  if not found then raise exception using errcode = '22023', message = 'Active expense not found'; end if;
  if v_old.status <> 'active' then
    select * into v_existing from public.finance_expenses where created_by = v_actor and idempotency_key = v_key;
    if found and v_existing.request_fingerprint = v_fp and v_existing.supersedes_expense_id = p_expense_id then
      return private.finance_expense_json(v_existing.id);
    end if;
    raise exception using errcode = '22023', message = 'Active expense not found';
  end if;
  if v_old.created_by <> v_actor then raise exception using errcode = '42501', message = 'Only the expense creator can edit it'; end if;
  update public.finance_expenses set status = 'superseded', archived_at = now(), archived_by = v_actor where id = v_old.id;
  v_id := private.finance_insert_expense(v_actor, p_payload, v_old.logical_expense_id, v_old.revision + 1, v_old.id);
  return private.finance_expense_json(v_id);
end;
$$;

create or replace function public.finance_archive_expense(p_expense_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_exp public.finance_expenses;
  v_fp text;
  v_op public.finance_operation_requests;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  v_fp := jsonb_build_object('expenseId', p_expense_id)::text;
  select * into v_op from public.finance_operation_requests where actor_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_op.operation <> 'archive_expense' or v_op.request_fingerprint <> v_fp then
      raise exception using errcode = '23505', message = 'Idempotency key was reused with different input';
    end if;
    return private.finance_expense_json(v_op.result_id);
  end if;
  select * into v_exp from public.finance_expenses where id = p_expense_id for update;
  if not found then raise exception using errcode = '22023', message = 'Expense not found'; end if;
  if v_exp.created_by <> v_actor and (v_exp.group_id is null or not private.finance_is_owner(v_exp.group_id, v_actor)) then
    raise exception using errcode = '42501', message = 'Expense archive is not authorized';
  end if;
  insert into public.finance_operation_requests(actor_id, idempotency_key, operation, request_fingerprint, result_type, result_id)
  values(v_actor, p_idempotency_key, 'archive_expense', v_fp, 'expense', p_expense_id);
  if v_exp.status = 'active' then
    update public.finance_expenses set status = 'archived', archived_at = now(), archived_by = v_actor where id = p_expense_id;
  end if;
  return private.finance_expense_json(p_expense_id);
end;
$$;

create or replace function public.finance_get_expense(p_expense_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if not private.finance_can_access_expense(p_expense_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'Expense is not accessible';
  end if;
  return private.finance_expense_json(p_expense_id);
end;
$$;

create or replace function public.finance_list_expenses(
  p_scope text,
  p_month_start date,
  p_group_id uuid default null,
  p_search text default null,
  p_cursor_date date default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_entries jsonb;
  v_total bigint;
  v_has_more boolean;
  v_last record;
  v_result jsonb;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_scope not in ('personal', 'group') or p_month_start is null or extract(day from p_month_start) <> 1 then
    raise exception using errcode = '22023', message = 'Invalid expense scope or month';
  end if;
  if (p_cursor_date is null) <> (p_cursor_created_at is null)
     or (p_cursor_date is null) <> (p_cursor_id is null) then
    raise exception using errcode = '22023', message = 'Expense cursor must be complete';
  end if;
  if p_group_id is not null and not private.finance_is_current_member(p_group_id, v_actor) then
    raise exception using errcode = '42501', message = 'Active group membership required';
  end if;

  with candidates as materialized (
    select e.*
    from public.finance_expenses e
    where e.status = 'active'
      and e.expense_date >= p_month_start
      and e.expense_date < (p_month_start + interval '1 month')::date
      and ((p_scope = 'personal' and e.group_id is null and e.created_by = v_actor)
        or (p_scope = 'group' and e.group_id is not null and private.finance_can_access_expense(e.id, v_actor)
          and (p_group_id is null or e.group_id = p_group_id)))
      and (nullif(trim(p_search), '') is null
        or position(lower(trim(p_search)) in lower(e.description || ' ' || e.category || ' ' || coalesce(e.custom_category_note, ''))) > 0)
      and (p_cursor_date is null or (e.expense_date, e.created_at, e.id) < (p_cursor_date, p_cursor_created_at, p_cursor_id))
    order by e.expense_date desc, e.created_at desc, e.id desc
    limit v_limit + 1
  ), page as (
    select * from candidates
    order by expense_date desc, created_at desc, id desc
    limit v_limit
  )
  select
    coalesce((select jsonb_agg(private.finance_expense_json(id) order by expense_date desc, created_at desc, id desc) from page), '[]'::jsonb),
    (select count(*) > v_limit from candidates)
  into v_entries, v_has_more;

  select coalesce(sum(e.total_amount_minor), 0)
  into v_total
  from public.finance_expenses e
  where e.status = 'active'
    and e.expense_date >= p_month_start
    and e.expense_date < (p_month_start + interval '1 month')::date
    and ((p_scope = 'personal' and e.group_id is null and e.created_by = v_actor)
      or (p_scope = 'group' and e.group_id is not null and private.finance_can_access_expense(e.id, v_actor)
        and (p_group_id is null or e.group_id = p_group_id)));

  v_result := jsonb_build_object(
    'entries', v_entries,
    'totalAmountMinor', v_total::text,
    'nextCursor', null
  );
  if v_has_more then
    select e.expense_date, e.created_at, e.id
    into v_last
    from public.finance_expenses e
    where e.id = (v_entries->(jsonb_array_length(v_entries) - 1)->>'id')::uuid;
    v_result := jsonb_set(v_result, '{nextCursor}', jsonb_build_object(
      'expenseDate', v_last.expense_date,
      'createdAt', v_last.created_at,
      'id', v_last.id
    ));
  end if;
  return v_result;
end;
$$;

revoke all on function private.finance_expense_json(uuid) from public;
revoke all on function private.finance_settlement_json(uuid) from public;
revoke all on function public.finance_create_expense(jsonb) from public;
revoke all on function public.finance_edit_expense(uuid, jsonb) from public;
revoke all on function public.finance_archive_expense(uuid, uuid) from public;
revoke all on function public.finance_get_expense(uuid) from public;
revoke all on function public.finance_list_expenses(text, date, uuid, text, date, timestamptz, uuid, integer) from public;

grant execute on function public.finance_create_expense(jsonb) to authenticated;
grant execute on function public.finance_edit_expense(uuid, jsonb) to authenticated;
grant execute on function public.finance_archive_expense(uuid, uuid) to authenticated;
grant execute on function public.finance_get_expense(uuid) to authenticated;
grant execute on function public.finance_list_expenses(text, date, uuid, text, date, timestamptz, uuid, integer) to authenticated;

-- Ask PostgREST to refresh its function metadata after the forward migration.
notify pgrst, 'reload schema';
