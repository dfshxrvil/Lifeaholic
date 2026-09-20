-- Keep creation time for auditing and membership access; transaction time is user-selected.
begin;
alter table public.finance_expenses add column if not exists transaction_timestamp timestamptz;
comment on column public.finance_expenses.transaction_timestamp is
  'Exact transaction instant. NULL for legacy expenses whose time was not recorded.';

create or replace function private.finance_insert_expense(
  p_actor uuid, p_payload jsonb, p_logical_id uuid, p_revision integer, p_supersedes uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_group_id uuid;
  v_total bigint;
  v_date date;
  v_timestamp timestamptz;
  v_category text;
  v_note text;
  v_participants jsonb;
  v_count integer;
  v_distinct integer;
  v_paid bigint;
  v_owed bigint;
  v_bad integer;
  v_key uuid;
  v_fingerprint text := p_payload::text;
begin
  if p_actor is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception using errcode = '22023', message = 'Expense payload must be an object'; end if;
  begin
    v_key := (p_payload->>'idempotencyKey')::uuid;
    v_group_id := nullif(p_payload->>'groupId', '')::uuid;
    v_date := (p_payload->>'expenseDate')::date;
    v_timestamp := (p_payload->>'transactionTimestamp')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = 'Expense identifiers or date are invalid';
  end;
  if p_payload ? 'transactionTimestamp' and (
    v_timestamp is null or not isfinite(v_timestamp) or v_timestamp > clock_timestamp()
    or coalesce(p_payload->>'transactionTimestamp', '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
  ) then
    raise exception using errcode = '22023', message = 'Choose a valid date and time that is not in the future';
  end if;
  if coalesce(p_payload->>'totalAmountMinor', '') !~ '^[1-9][0-9]{0,15}$' then
    raise exception using errcode = '22023', message = 'Expense amount must be positive integer minor units';
  end if;
  v_total := (p_payload->>'totalAmountMinor')::bigint;
  if v_total > 9000000000000000 then raise exception using errcode = '22003', message = 'Expense amount is too large'; end if;
  v_category := p_payload->>'category';
  v_note := nullif(trim(p_payload->>'customCategoryNote'), '');
  v_participants := p_payload->'participants';
  if jsonb_typeof(v_participants) <> 'array' or jsonb_array_length(v_participants) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Expense needs between 1 and 100 participants';
  end if;
  select count(*)::integer, count(distinct x.user_id)::integer,
         coalesce(sum(x.paid), 0), coalesce(sum(x.owed), 0),
         count(*) filter (where x.user_id is null or x.paid_text !~ '^(0|[1-9][0-9]{0,15})$'
                                      or x.owed_text !~ '^(0|[1-9][0-9]{0,15})$')::integer
    into v_count, v_distinct, v_paid, v_owed, v_bad
  from (
    select case when value->>'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then (value->>'userId')::uuid end as user_id,
           value->>'amountPaidMinor' as paid_text,
           value->>'amountOwedMinor' as owed_text,
           case when value->>'amountPaidMinor' ~ '^(0|[1-9][0-9]{0,15})$' then (value->>'amountPaidMinor')::bigint else 0 end as paid,
           case when value->>'amountOwedMinor' ~ '^(0|[1-9][0-9]{0,15})$' then (value->>'amountOwedMinor')::bigint else 0 end as owed
    from jsonb_array_elements(v_participants)
  ) x;
  if v_bad > 0 or v_count <> v_distinct then raise exception using errcode = '22023', message = 'Participants or minor-unit amounts are invalid'; end if;
  if v_paid <> v_total or v_owed <> v_total then raise exception using errcode = '23514', message = 'Paid and owed sums must both equal the expense total'; end if;
  if v_group_id is null then
    if v_count <> 1 or not exists (
      select 1 from jsonb_array_elements(v_participants) j
      where (j->>'userId')::uuid = p_actor
        and (j->>'amountPaidMinor')::bigint = v_total and (j->>'amountOwedMinor')::bigint = v_total
    ) then raise exception using errcode = '23514', message = 'A personal expense must be fully paid and owed by its creator'; end if;
  else
    if not private.finance_is_current_member(v_group_id, p_actor) then raise exception using errcode = '42501', message = 'Active group membership required'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_participants) j
      where not private.finance_is_current_member(v_group_id, (j->>'userId')::uuid)
    ) then raise exception using errcode = '42501', message = 'Every participant must be an active group member'; end if;
  end if;
  insert into public.finance_expenses (
    id, logical_expense_id, revision, supersedes_expense_id, group_id, description,
    total_amount_minor, category, custom_category_note, expense_date, transaction_timestamp, created_by,
    idempotency_key, request_fingerprint
  ) values (
    v_id, p_logical_id, p_revision, p_supersedes, v_group_id, trim(p_payload->>'description'),
    v_total, v_category, v_note, v_date, v_timestamp, p_actor, v_key, v_fingerprint
  );
  insert into public.finance_expense_participants(expense_id, user_id, amount_paid_minor, amount_owed_minor)
  select v_id, (j->>'userId')::uuid, (j->>'amountPaidMinor')::bigint, (j->>'amountOwedMinor')::bigint
  from jsonb_array_elements(v_participants) j;
  perform private.finance_assert_expense_balanced(v_id);
  return v_id;
end;
$$;

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
    'transactionTimestamp', e.transaction_timestamp,
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


commit;
