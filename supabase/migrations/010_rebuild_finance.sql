-- Clean-slate finance backend. No object from the retired finance system is reused.
begin;

create schema if not exists private;
revoke all on schema private from public;

create table public.finance_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id),
  idempotency_key uuid not null,
  request_fingerprint text not null,
  unique (created_by, idempotency_key),
  check ((archived_at is null) = (archived_by is null))
);

create table public.finance_group_members (
  group_id uuid not null references public.finance_groups(id) on delete restrict,
  user_id uuid not null references public.profiles(id),
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'left')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (group_id, user_id),
  check ((status = 'active' and left_at is null) or (status = 'left' and left_at is not null))
);

-- Closed membership periods remain immutable when a former member later rejoins.
create table public.finance_group_membership_history (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.finance_groups(id) on delete restrict,
  user_id uuid not null references public.profiles(id),
  joined_at timestamptz not null,
  left_at timestamptz not null,
  check (left_at >= joined_at),
  unique (group_id, user_id, joined_at, left_at)
);

create table public.finance_group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.finance_groups(id) on delete restrict,
  invited_user_id uuid not null references public.profiles(id),
  invited_by uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  unique (invited_by, idempotency_key),
  check ((status = 'pending' and responded_at is null) or (status <> 'pending' and responded_at is not null))
);
create unique index finance_one_pending_invitation_idx
  on public.finance_group_invitations(group_id, invited_user_id) where status = 'pending';

create table public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  logical_expense_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  supersedes_expense_id uuid references public.finance_expenses(id) on delete restrict,
  group_id uuid references public.finance_groups(id) on delete restrict,
  description text not null check (char_length(trim(description)) between 1 and 240),
  total_amount_minor bigint not null check (total_amount_minor between 1 and 9000000000000000),
  currency_code text not null default 'INR' check (currency_code = 'INR'),
  category text not null check (category in ('Food', 'Online shopping', 'Investments', 'Other')),
  custom_category_note text,
  expense_date date not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'archived', 'superseded')),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id),
  idempotency_key uuid not null,
  request_fingerprint text not null,
  unique (created_by, idempotency_key),
  unique (logical_expense_id, revision),
  check (category <> 'Other' or char_length(trim(custom_category_note)) between 1 and 240),
  check ((status = 'active' and archived_at is null and archived_by is null)
      or (status in ('archived', 'superseded') and archived_at is not null and archived_by is not null)),
  check ((revision = 1 and supersedes_expense_id is null)
      or (revision > 1 and supersedes_expense_id is not null))
);
create unique index finance_one_active_expense_revision_idx
  on public.finance_expenses(logical_expense_id) where status = 'active';

create table public.finance_expense_participants (
  expense_id uuid not null references public.finance_expenses(id) on delete restrict,
  user_id uuid not null references public.profiles(id),
  amount_paid_minor bigint not null check (amount_paid_minor between 0 and 9000000000000000),
  amount_owed_minor bigint not null check (amount_owed_minor between 0 and 9000000000000000),
  created_at timestamptz not null default now(),
  primary key (expense_id, user_id),
  check (amount_paid_minor > 0 or amount_owed_minor > 0)
);

create table public.finance_settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.finance_groups(id) on delete restrict,
  payer_id uuid not null references public.profiles(id),
  payee_id uuid not null references public.profiles(id),
  amount_minor bigint not null check (amount_minor between 1 and 9000000000000000),
  currency_code text not null default 'INR' check (currency_code = 'INR'),
  settlement_date date not null,
  note text check (note is null or char_length(trim(note)) between 1 and 240),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'reversed')),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id),
  reversal_reason text,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  unique (created_by, idempotency_key),
  check (payer_id <> payee_id),
  check ((status = 'active' and reversed_at is null and reversed_by is null and reversal_reason is null)
      or (status = 'reversed' and reversed_at is not null and reversed_by is not null
          and char_length(trim(reversal_reason)) between 1 and 240))
);

create table public.finance_operation_requests (
  actor_id uuid not null references public.profiles(id),
  idempotency_key uuid not null,
  operation text not null,
  request_fingerprint text not null,
  result_type text,
  result_id uuid,
  created_at timestamptz not null default now(),
  primary key (actor_id, idempotency_key),
  check (char_length(operation) between 1 and 80),
  check ((result_type is null) = (result_id is null))
);

create index finance_groups_member_idx on public.finance_group_members(user_id, status, group_id);
create index finance_group_roster_idx on public.finance_group_members(group_id, status, joined_at);
create index finance_membership_history_idx on public.finance_group_membership_history(group_id, user_id, joined_at, left_at);
create index finance_invited_user_idx on public.finance_group_invitations(invited_user_id, status, created_at desc);
create index finance_personal_expenses_idx on public.finance_expenses(created_by, expense_date desc, created_at desc, id desc)
  where group_id is null and status = 'active';
create index finance_group_expenses_idx on public.finance_expenses(group_id, expense_date desc, created_at desc, id desc)
  where group_id is not null and status = 'active';
create index finance_participants_user_idx on public.finance_expense_participants(user_id, expense_id);
create index finance_settlements_group_idx on public.finance_settlements(group_id, settlement_date desc, created_at desc)
  where status = 'active';
create index finance_settlements_payer_idx on public.finance_settlements(payer_id, group_id) where status = 'active';
create index finance_settlements_payee_idx on public.finance_settlements(payee_id, group_id) where status = 'active';

-- Private authorization helpers avoid recursive RLS evaluation.
create or replace function private.finance_is_current_member(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.finance_group_members m
    join public.finance_groups g on g.id = m.group_id
    where m.group_id = p_group_id and m.user_id = p_user_id
      and m.status = 'active' and g.archived_at is null
  );
$$;

create or replace function private.finance_is_owner(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.finance_groups g
    where g.id = p_group_id and g.created_by = p_user_id and g.archived_at is null
  );
$$;

create or replace function private.finance_can_access_expense(p_expense_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.finance_expenses e
    where e.id = p_expense_id and (
      (e.group_id is null and e.created_by = p_user_id)
      or e.created_by = p_user_id
      or exists (select 1 from public.finance_expense_participants p where p.expense_id = e.id and p.user_id = p_user_id)
      or exists (
        select 1 from public.finance_group_members m
        where m.group_id = e.group_id and m.user_id = p_user_id
          and m.joined_at <= e.created_at and (m.left_at is null or e.created_at <= m.left_at)
      )
      or exists (
        select 1 from public.finance_group_membership_history h
        where h.group_id = e.group_id and h.user_id = p_user_id
          and h.joined_at <= e.created_at and e.created_at <= h.left_at
      )
    )
  );
$$;

create or replace function private.finance_can_access_settlement(p_settlement_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.finance_settlements s
    where s.id = p_settlement_id and (
      s.payer_id = p_user_id or s.payee_id = p_user_id
      or private.finance_is_current_member(s.group_id, p_user_id)
    )
  );
$$;

-- Cross-row invariants cannot be expressed by CHECK constraints. These deferred
-- triggers make every transaction finish with a complete balanced participant ledger.
create or replace function private.finance_assert_expense_balanced(p_expense_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_total bigint;
  v_paid bigint;
  v_owed bigint;
  v_count integer;
begin
  select e.total_amount_minor into v_total from public.finance_expenses e where e.id = p_expense_id;
  if not found then return; end if;
  select count(*)::integer, coalesce(sum(p.amount_paid_minor), 0), coalesce(sum(p.amount_owed_minor), 0)
    into v_count, v_paid, v_owed
  from public.finance_expense_participants p where p.expense_id = p_expense_id;
  if v_count = 0 or v_paid <> v_total or v_owed <> v_total then
    raise exception using errcode = '23514', message = 'Finance participant ledger is not balanced';
  end if;
end;
$$;

create or replace function private.finance_balance_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_expense_id uuid;
begin
  if tg_table_name = 'finance_expenses' then
    v_expense_id := coalesce(new.id, old.id);
  else
    v_expense_id := coalesce(new.expense_id, old.expense_id);
  end if;
  perform private.finance_assert_expense_balanced(v_expense_id);
  return null;
end;
$$;

create constraint trigger finance_expense_balance_from_expense
after insert or update of total_amount_minor on public.finance_expenses
deferrable initially deferred for each row execute function private.finance_balance_trigger();

create constraint trigger finance_expense_balance_from_participants
after insert or update or delete on public.finance_expense_participants
deferrable initially deferred for each row execute function private.finance_balance_trigger();

-- Stable response builders keep all money values as decimal strings in JSON.
create or replace function private.finance_expense_json(p_expense_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'logicalExpenseId', e.logical_expense_id, 'revision', e.revision,
    'supersedesExpenseId', e.supersedes_expense_id, 'groupId', e.group_id,
    'description', e.description, 'totalAmountMinor', e.total_amount_minor::text,
    'currencyCode', e.currency_code, 'category', e.category,
    'customCategoryNote', e.custom_category_note, 'expenseDate', e.expense_date,
    'createdBy', e.created_by, 'createdAt', e.created_at, 'status', e.status,
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', p.user_id, 'amountPaidMinor', p.amount_paid_minor::text,
        'amountOwedMinor', p.amount_owed_minor::text
      ) order by p.user_id)
      from public.finance_expense_participants p where p.expense_id = e.id
    ), '[]'::jsonb)
  ) from public.finance_expenses e where e.id = p_expense_id;
$$;

create or replace function private.finance_settlement_json(p_settlement_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'groupId', s.group_id, 'payerId', s.payer_id, 'payeeId', s.payee_id,
    'amountMinor', s.amount_minor::text, 'currencyCode', s.currency_code,
    'settlementDate', s.settlement_date, 'note', s.note, 'createdBy', s.created_by,
    'createdAt', s.created_at, 'status', s.status, 'reversedAt', s.reversed_at,
    'reversedBy', s.reversed_by, 'reversalReason', s.reversal_reason
  ) from public.finance_settlements s where s.id = p_settlement_id;
$$;

-- Inserts a fully validated ledger. Only the public create/edit RPCs can invoke it.
create or replace function private.finance_insert_expense(
  p_actor uuid, p_payload jsonb, p_logical_id uuid, p_revision integer, p_supersedes uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_group_id uuid;
  v_total bigint;
  v_date date;
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
  exception when others then
    raise exception using errcode = '22023', message = 'Expense identifiers or date are invalid';
  end;
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
    total_amount_minor, category, custom_category_note, expense_date, created_by,
    idempotency_key, request_fingerprint
  ) values (
    v_id, p_logical_id, p_revision, p_supersedes, v_group_id, trim(p_payload->>'description'),
    v_total, v_category, v_note, v_date, p_actor, v_key, v_fingerprint
  );
  insert into public.finance_expense_participants(expense_id, user_id, amount_paid_minor, amount_owed_minor)
  select v_id, (j->>'userId')::uuid, (j->>'amountPaidMinor')::bigint, (j->>'amountOwedMinor')::bigint
  from jsonb_array_elements(v_participants) j;
  perform private.finance_assert_expense_balanced(v_id);
  return v_id;
end;
$$;

create or replace function public.finance_create_group(p_name text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_id uuid; v_created_at timestamptz; v_fp text; v_existing public.finance_groups;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  v_fp := jsonb_build_object('name', trim(p_name))::text;
  select * into v_existing from public.finance_groups where created_by = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fp then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
    return jsonb_build_object('id', v_existing.id, 'name', v_existing.name, 'createdBy', v_actor, 'createdAt', v_existing.created_at);
  end if;
  v_id := gen_random_uuid();
  insert into public.finance_groups(id, name, created_by, idempotency_key, request_fingerprint)
    values (v_id, trim(p_name), v_actor, p_idempotency_key, v_fp) returning created_at into v_created_at;
  insert into public.finance_group_members(group_id, user_id, role) values (v_id, v_actor, 'owner');
  return jsonb_build_object('id', v_id, 'name', trim(p_name), 'createdBy', v_actor, 'createdAt', v_created_at);
exception when unique_violation then
  select * into v_existing from public.finance_groups where created_by = v_actor and idempotency_key = p_idempotency_key;
  if v_existing.request_fingerprint is distinct from v_fp then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
  return jsonb_build_object('id', v_existing.id, 'name', v_existing.name, 'createdBy', v_actor, 'createdAt', v_existing.created_at);
end;
$$;

create or replace function public.finance_list_groups()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'createdBy', g.created_by, 'createdAt', g.created_at,
      'role', own.role, 'memberCount', (select count(*) from public.finance_group_members mc where mc.group_id = g.id and mc.status = 'active')
    ) order by lower(g.name), g.id)
    from public.finance_groups g
    join public.finance_group_members own on own.group_id = g.id and own.user_id = v_actor and own.status = 'active'
    where g.archived_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function public.finance_list_invitations()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'groupId', i.group_id, 'groupName', g.name,
      'invitedBy', i.invited_by, 'inviterUsername', p.username, 'createdAt', i.created_at
    ) order by i.created_at desc, i.id)
    from public.finance_group_invitations i
    join public.finance_groups g on g.id = i.group_id
    join public.profiles p on p.id = i.invited_by
    where i.invited_user_id = v_actor and i.status = 'pending' and g.archived_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function public.finance_search_invite_candidates(p_group_id uuid, p_query text, p_limit integer default 10)
returns table(user_id uuid, username text, match_label text)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_query text := lower(trim(p_query)); v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 10);
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if not private.finance_is_owner(p_group_id, v_actor) then raise exception using errcode = '42501', message = 'Only the group owner can search for invitees'; end if;
  if char_length(v_query) not between 3 and 100 then raise exception using errcode = '22023', message = 'Search must contain 3 to 100 characters'; end if;
  return query
    select p.id, p.username,
      case when lower(coalesce(p.email, '')) = v_query then 'Email match' else coalesce(p.username, 'User') end
    from public.profiles p
    where p.id <> v_actor
      and (lower(coalesce(p.email, '')) = v_query or lower(coalesce(p.username, '')) like replace(replace(v_query, '%', '\%'), '_', '\_') || '%' escape '\')
      and not exists(select 1 from public.finance_group_members m where m.group_id = p_group_id and m.user_id = p.id and m.status = 'active')
      and not exists(select 1 from public.finance_group_invitations i where i.group_id = p_group_id and i.invited_user_id = p.id and i.status = 'pending')
    order by case when lower(coalesce(p.email, '')) = v_query then 0 else 1 end, lower(coalesce(p.username, '')), p.id
    limit v_limit;
end;
$$;

create or replace function public.finance_invite_member(p_group_id uuid, p_invited_user_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_id uuid; v_fp text; v_existing public.finance_group_invitations;
begin
  if not private.finance_is_owner(p_group_id, v_actor) then raise exception using errcode = '42501', message = 'Only the group owner can invite members'; end if;
  if p_invited_user_id = v_actor or private.finance_is_current_member(p_group_id, p_invited_user_id) then raise exception using errcode = '22023', message = 'User is already a group member'; end if;
  if not exists(select 1 from public.profiles where id = p_invited_user_id) then raise exception using errcode = '22023', message = 'Invitee does not exist'; end if;
  v_fp := jsonb_build_object('groupId', p_group_id, 'invitedUserId', p_invited_user_id)::text;
  select * into v_existing from public.finance_group_invitations where invited_by = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fp then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
    return jsonb_build_object('id', v_existing.id, 'status', v_existing.status);
  end if;
  insert into public.finance_group_invitations(group_id, invited_user_id, invited_by, idempotency_key, request_fingerprint)
    values (p_group_id, p_invited_user_id, v_actor, p_idempotency_key, v_fp) returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'pending');
exception when unique_violation then
  select * into v_existing from public.finance_group_invitations
    where invited_by = v_actor and idempotency_key = p_idempotency_key;
  if found and v_existing.request_fingerprint = v_fp then
    return jsonb_build_object('id', v_existing.id, 'status', v_existing.status);
  end if;
  raise exception using errcode = '23505', message = 'An invitation is already pending or the idempotency key conflicts';
end;
$$;

create or replace function public.finance_respond_to_invitation(p_invitation_id uuid, p_accept boolean, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_inv public.finance_group_invitations; v_op public.finance_operation_requests; v_fp text;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  v_fp := jsonb_build_object('invitationId', p_invitation_id, 'accept', p_accept)::text;
  select * into v_op from public.finance_operation_requests where actor_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_op.operation <> 'respond_invitation' or v_op.request_fingerprint <> v_fp then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
    return jsonb_build_object('invitationId', v_op.result_id, 'status', case when p_accept then 'accepted' else 'declined' end);
  end if;
  select * into v_inv from public.finance_group_invitations where id = p_invitation_id for update;
  if not found or v_inv.invited_user_id <> v_actor then raise exception using errcode = '42501', message = 'Invitation is not available to this user'; end if;
  if v_inv.status <> 'pending' then raise exception using errcode = '22023', message = 'Invitation was already answered'; end if;
  insert into public.finance_operation_requests(actor_id, idempotency_key, operation, request_fingerprint, result_type, result_id)
    values(v_actor, p_idempotency_key, 'respond_invitation', v_fp, 'invitation', p_invitation_id);
  update public.finance_group_invitations set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now() where id = p_invitation_id;
  if p_accept then
    insert into public.finance_group_members(group_id, user_id, role, status, joined_at, left_at)
      values(v_inv.group_id, v_actor, 'member', 'active', now(), null)
      on conflict(group_id, user_id) do update set status = 'active', joined_at = now(), left_at = null;
  end if;
  return jsonb_build_object('invitationId', p_invitation_id, 'status', case when p_accept then 'accepted' else 'declined' end);
end;
$$;

create or replace function public.finance_create_expense(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_key uuid; v_fp text; v_existing public.finance_expenses; v_id uuid; v_logical uuid := gen_random_uuid();
begin
  begin v_key := (p_payload->>'idempotencyKey')::uuid; exception when others then raise exception using errcode = '22023', message = 'Valid idempotency key required'; end;
  v_fp := p_payload::text;
  select * into v_existing from public.finance_expenses where created_by = v_actor and idempotency_key = v_key;
  if found then
    if v_existing.request_fingerprint <> v_fp then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
    return private.finance_expense_json(v_existing.id);
  end if;
  v_id := private.finance_insert_expense(v_actor, p_payload, v_logical, 1, null);
  return private.finance_expense_json(v_id);
exception when unique_violation then
  select * into v_existing from public.finance_expenses where created_by = v_actor and idempotency_key = v_key;
  if v_existing.request_fingerprint is distinct from v_fp then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
  return private.finance_expense_json(v_existing.id);
end;
$$;

create or replace function public.finance_edit_expense(p_expense_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_old public.finance_expenses; v_key uuid; v_fp text; v_existing public.finance_expenses; v_id uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  begin v_key := (p_payload->>'idempotencyKey')::uuid; exception when others then raise exception using errcode = '22023', message = 'Valid idempotency key required'; end;
  v_fp := p_payload::text;
  select * into v_existing from public.finance_expenses where created_by = v_actor and idempotency_key = v_key;
  if found then
    if v_existing.request_fingerprint <> v_fp or v_existing.supersedes_expense_id is distinct from p_expense_id then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
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
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_exp public.finance_expenses; v_fp text; v_op public.finance_operation_requests;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  v_fp := jsonb_build_object('expenseId', p_expense_id)::text;
  select * into v_op from public.finance_operation_requests where actor_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_op.operation <> 'archive_expense' or v_op.request_fingerprint <> v_fp then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
    return private.finance_expense_json(v_op.result_id);
  end if;
  select * into v_exp from public.finance_expenses where id = p_expense_id for update;
  if not found then raise exception using errcode = '22023', message = 'Expense not found'; end if;
  if v_exp.created_by <> v_actor and (v_exp.group_id is null or not private.finance_is_owner(v_exp.group_id, v_actor)) then raise exception using errcode = '42501', message = 'Expense archive is not authorized'; end if;
  insert into public.finance_operation_requests values(v_actor, p_idempotency_key, 'archive_expense', v_fp, 'expense', p_expense_id, now());
  if v_exp.status = 'active' then update public.finance_expenses set status = 'archived', archived_at = now(), archived_by = v_actor where id = p_expense_id; end if;
  return private.finance_expense_json(p_expense_id);
end;
$$;

create or replace function public.finance_get_expense(p_expense_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.finance_can_access_expense(p_expense_id, auth.uid()) then raise exception using errcode = '42501', message = 'Expense is not accessible'; end if;
  return private.finance_expense_json(p_expense_id);
end;
$$;

create or replace function public.finance_list_expenses(
  p_scope text, p_month_start date, p_group_id uuid default null, p_search text default null,
  p_cursor_date date default null, p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null, p_limit integer default 30
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100); v_entries jsonb; v_total bigint; v_last record; v_result jsonb;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_scope not in ('personal', 'group') or extract(day from p_month_start) <> 1 then raise exception using errcode = '22023', message = 'Invalid expense scope or month'; end if;
  if p_group_id is not null and not private.finance_is_current_member(p_group_id, v_actor) then raise exception using errcode = '42501', message = 'Active group membership required'; end if;
  with page as (
    select e.* from public.finance_expenses e
    where e.status = 'active' and e.expense_date >= p_month_start and e.expense_date < (p_month_start + interval '1 month')::date
      and ((p_scope = 'personal' and e.group_id is null and e.created_by = v_actor)
        or (p_scope = 'group' and e.group_id is not null and private.finance_can_access_expense(e.id, v_actor)
            and (p_group_id is null or e.group_id = p_group_id)))
      and (nullif(trim(p_search), '') is null or position(lower(trim(p_search)) in lower(e.description || ' ' || e.category || ' ' || coalesce(e.custom_category_note, ''))) > 0)
      and (p_cursor_date is null or (e.expense_date, e.created_at, e.id) < (p_cursor_date, p_cursor_created_at, p_cursor_id))
    order by e.expense_date desc, e.created_at desc, e.id desc limit v_limit
  ) select coalesce(jsonb_agg(private.finance_expense_json(id) order by expense_date desc, created_at desc, id desc), '[]'::jsonb)
    into v_entries from page;
  select coalesce(sum(e.total_amount_minor), 0) into v_total from public.finance_expenses e
    where e.status = 'active' and e.expense_date >= p_month_start and e.expense_date < (p_month_start + interval '1 month')::date
      and ((p_scope = 'personal' and e.group_id is null and e.created_by = v_actor)
        or (p_scope = 'group' and e.group_id is not null and private.finance_can_access_expense(e.id, v_actor) and (p_group_id is null or e.group_id = p_group_id)));
  select e.expense_date, e.created_at, e.id into v_last from public.finance_expenses e
    where e.id = nullif(v_entries->(jsonb_array_length(v_entries)-1)->>'id', '')::uuid;
  v_result := jsonb_build_object('entries', v_entries, 'totalAmountMinor', v_total::text, 'nextCursor', null);
  if jsonb_array_length(v_entries) = v_limit then
    v_result := jsonb_set(v_result, '{nextCursor}', jsonb_build_object('expenseDate', v_last.expense_date, 'createdAt', v_last.created_at, 'id', v_last.id));
  end if;
  return v_result;
end;
$$;

create or replace function private.finance_member_net(p_group_id uuid, p_user_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  with movements as (
    select p.amount_paid_minor - p.amount_owed_minor as amount
    from public.finance_expense_participants p join public.finance_expenses e on e.id = p.expense_id
    where e.group_id = p_group_id and e.status = 'active' and p.user_id = p_user_id
    union all select s.amount_minor from public.finance_settlements s where s.group_id = p_group_id and s.status = 'active' and s.payer_id = p_user_id
    union all select -s.amount_minor from public.finance_settlements s where s.group_id = p_group_id and s.status = 'active' and s.payee_id = p_user_id
  ) select coalesce(sum(amount), 0)::bigint from movements;
$$;

create or replace function public.finance_get_group_balances(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_members jsonb; v_debtors jsonb; v_creditors jsonb; v_repayments jsonb := '[]'::jsonb;
  d integer := 0; c integer := 0; d_remaining bigint; c_remaining bigint; v_amount bigint; v_sum bigint;
begin
  if not private.finance_is_current_member(p_group_id, v_actor) then raise exception using errcode = '42501', message = 'Active group membership required'; end if;
  with nets as (
    select m.user_id, private.finance_member_net(p_group_id, m.user_id) as net
    from public.finance_group_members m where m.group_id = p_group_id
  ) select coalesce(jsonb_agg(jsonb_build_object('userId', user_id, 'netAmountMinor', net::text) order by user_id), '[]'::jsonb), coalesce(sum(net), 0)
    into v_members, v_sum from nets;
  if v_sum <> 0 then raise exception using errcode = '23514', message = 'Group ledger does not sum to zero'; end if;
  with nets as (select m.user_id, private.finance_member_net(p_group_id, m.user_id) net from public.finance_group_members m where m.group_id = p_group_id)
  select coalesce(jsonb_agg(jsonb_build_object('userId', user_id, 'amount', (-net)::text) order by net asc, user_id), '[]'::jsonb)
    into v_debtors from nets where net < 0;
  with nets as (select m.user_id, private.finance_member_net(p_group_id, m.user_id) net from public.finance_group_members m where m.group_id = p_group_id)
  select coalesce(jsonb_agg(jsonb_build_object('userId', user_id, 'amount', net::text) order by net desc, user_id), '[]'::jsonb)
    into v_creditors from nets where net > 0;
  if jsonb_array_length(v_debtors) > 0 and jsonb_array_length(v_creditors) > 0 then
    d_remaining := (v_debtors->d->>'amount')::bigint; c_remaining := (v_creditors->c->>'amount')::bigint;
    while d < jsonb_array_length(v_debtors) and c < jsonb_array_length(v_creditors) loop
      v_amount := least(d_remaining, c_remaining);
      v_repayments := v_repayments || jsonb_build_array(jsonb_build_object(
        'payerId', v_debtors->d->>'userId', 'payeeId', v_creditors->c->>'userId', 'amountMinor', v_amount::text));
      d_remaining := d_remaining - v_amount; c_remaining := c_remaining - v_amount;
      if d_remaining = 0 then d := d + 1; if d < jsonb_array_length(v_debtors) then d_remaining := (v_debtors->d->>'amount')::bigint; end if; end if;
      if c_remaining = 0 then c := c + 1; if c < jsonb_array_length(v_creditors) then c_remaining := (v_creditors->c->>'amount')::bigint; end if; end if;
    end loop;
  end if;
  return jsonb_build_object(
    'members', v_members, 'repayments', v_repayments,
    'youOweMinor', greatest(-private.finance_member_net(p_group_id, v_actor), 0)::text,
    'owedToYouMinor', greatest(private.finance_member_net(p_group_id, v_actor), 0)::text,
    'netAmountMinor', private.finance_member_net(p_group_id, v_actor)::text
  );
end;
$$;

create or replace function public.finance_record_settlement(
  p_group_id uuid, p_payee_id uuid, p_amount_minor text, p_settlement_date date,
  p_note text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_amount bigint; v_debt bigint; v_id uuid; v_fp text; v_existing public.finance_settlements;
begin
  if not private.finance_is_current_member(p_group_id, v_actor) or not private.finance_is_current_member(p_group_id, p_payee_id) then raise exception using errcode = '42501', message = 'Both settlement users must be active group members'; end if;
  if v_actor = p_payee_id then raise exception using errcode = '22023', message = 'A user cannot settle with themselves'; end if;
  if coalesce(p_amount_minor, '') !~ '^[1-9][0-9]{0,15}$' then raise exception using errcode = '22023', message = 'Settlement amount must be positive integer minor units'; end if;
  v_amount := p_amount_minor::bigint;
  v_fp := jsonb_build_object('groupId', p_group_id, 'payeeId', p_payee_id, 'amountMinor', p_amount_minor, 'date', p_settlement_date, 'note', nullif(trim(p_note), ''))::text;
  select * into v_existing from public.finance_settlements where created_by = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fp then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
    return private.finance_settlement_json(v_existing.id);
  end if;
  perform 1 from public.finance_groups where id = p_group_id for update;
  v_debt := -private.finance_member_net(p_group_id, v_actor);
  if v_debt <= 0 then raise exception using errcode = '23514', message = 'Payer does not currently owe money in this group'; end if;
  if private.finance_member_net(p_group_id, p_payee_id) <= 0 then raise exception using errcode = '23514', message = 'Payee is not currently owed money in this group'; end if;
  if v_amount > least(v_debt, private.finance_member_net(p_group_id, p_payee_id)) then raise exception using errcode = '23514', message = 'Settlement exceeds the current debt between available balances'; end if;
  insert into public.finance_settlements(group_id, payer_id, payee_id, amount_minor, settlement_date, note, created_by, idempotency_key, request_fingerprint)
    values(p_group_id, v_actor, p_payee_id, v_amount, p_settlement_date, nullif(trim(p_note), ''), v_actor, p_idempotency_key, v_fp) returning id into v_id;
  return private.finance_settlement_json(v_id);
exception when unique_violation then
  select * into v_existing from public.finance_settlements where created_by = v_actor and idempotency_key = p_idempotency_key;
  if v_existing.request_fingerprint is distinct from v_fp then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
  return private.finance_settlement_json(v_existing.id);
end;
$$;

create or replace function public.finance_reverse_settlement(p_settlement_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_settlement public.finance_settlements; v_fp text; v_op public.finance_operation_requests;
begin
  v_fp := jsonb_build_object('settlementId', p_settlement_id, 'reason', trim(p_reason))::text;
  select * into v_op from public.finance_operation_requests where actor_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_op.operation <> 'reverse_settlement' or v_op.request_fingerprint <> v_fp then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
    return private.finance_settlement_json(v_op.result_id);
  end if;
  select * into v_settlement from public.finance_settlements where id = p_settlement_id for update;
  if not found then raise exception using errcode = '22023', message = 'Settlement not found'; end if;
  if v_settlement.created_by <> v_actor and not private.finance_is_owner(v_settlement.group_id, v_actor) then raise exception using errcode = '42501', message = 'Settlement reversal is not authorized'; end if;
  if char_length(trim(p_reason)) not between 1 and 240 then raise exception using errcode = '22023', message = 'A reversal reason is required'; end if;
  insert into public.finance_operation_requests values(v_actor, p_idempotency_key, 'reverse_settlement', v_fp, 'settlement', p_settlement_id, now());
  if v_settlement.status = 'active' then update public.finance_settlements set status = 'reversed', reversed_at = now(), reversed_by = v_actor, reversal_reason = trim(p_reason) where id = p_settlement_id; end if;
  return private.finance_settlement_json(p_settlement_id);
end;
$$;

create or replace function public.finance_get_group_roster(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.finance_is_current_member(p_group_id, auth.uid()) then raise exception using errcode = '42501', message = 'Active group membership required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'username', p.username, 'role', m.role, 'status', m.status, 'joinedAt', m.joined_at, 'leftAt', m.left_at) order by m.role desc, lower(coalesce(p.username, '')), m.user_id)
    from public.finance_group_members m join public.profiles p on p.id = m.user_id where m.group_id = p_group_id), '[]'::jsonb);
end;
$$;

create or replace function public.finance_remove_member(p_group_id uuid, p_user_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_member public.finance_group_members; v_fp text; v_op public.finance_operation_requests;
begin
  if v_actor <> p_user_id and not private.finance_is_owner(p_group_id, v_actor) then raise exception using errcode = '42501', message = 'Member removal is not authorized'; end if;
  select * into v_member from public.finance_group_members where group_id = p_group_id and user_id = p_user_id for update;
  if not found then raise exception using errcode = '22023', message = 'Group member not found'; end if;
  if v_member.role = 'owner' then raise exception using errcode = '23514', message = 'The group owner cannot leave without archiving or transferring ownership'; end if;
  v_fp := jsonb_build_object('groupId', p_group_id, 'userId', p_user_id)::text;
  select * into v_op from public.finance_operation_requests where actor_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_op.operation <> 'remove_member' or v_op.request_fingerprint <> v_fp then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
    return jsonb_build_object('groupId', p_group_id, 'userId', p_user_id, 'status', 'left');
  end if;
  if private.finance_member_net(p_group_id, p_user_id) <> 0 then raise exception using errcode = '23514', message = 'A member with a nonzero balance cannot leave the group'; end if;
  insert into public.finance_operation_requests values(v_actor, p_idempotency_key, 'remove_member', v_fp, 'member', p_user_id, now());
  insert into public.finance_group_membership_history(group_id, user_id, joined_at, left_at)
    values(p_group_id, p_user_id, v_member.joined_at, now());
  update public.finance_group_members set status = 'left', left_at = now() where group_id = p_group_id and user_id = p_user_id;
  return jsonb_build_object('groupId', p_group_id, 'userId', p_user_id, 'status', 'left');
end;
$$;

create or replace function public.finance_archive_group(p_group_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_group public.finance_groups; v_fp text; v_op public.finance_operation_requests;
begin
  select * into v_group from public.finance_groups where id = p_group_id for update;
  if not found or v_group.created_by <> v_actor then raise exception using errcode = '42501', message = 'Only the group owner can archive it'; end if;
  v_fp := jsonb_build_object('groupId', p_group_id)::text;
  select * into v_op from public.finance_operation_requests where actor_id = v_actor and idempotency_key = p_idempotency_key;
  if found then
    if v_op.operation <> 'archive_group' or v_op.request_fingerprint <> v_fp then raise exception using errcode = '23505', message = 'Idempotency key was reused with different input'; end if;
    return jsonb_build_object('id', p_group_id, 'archived', true);
  end if;
  if exists(select 1 from public.finance_group_members m where m.group_id = p_group_id and private.finance_member_net(p_group_id, m.user_id) <> 0) then
    raise exception using errcode = '23514', message = 'A group with outstanding balances cannot be archived';
  end if;
  insert into public.finance_operation_requests values(v_actor, p_idempotency_key, 'archive_group', v_fp, 'group', p_group_id, now());
  if v_group.archived_at is null then
    update public.finance_groups set archived_at = now(), archived_by = v_actor where id = p_group_id;
    insert into public.finance_group_membership_history(group_id, user_id, joined_at, left_at)
      select group_id, user_id, joined_at, now() from public.finance_group_members where group_id = p_group_id and status = 'active';
    update public.finance_group_members set status = 'left', left_at = now() where group_id = p_group_id and status = 'active';
    update public.finance_group_invitations set status = 'cancelled', responded_at = now() where group_id = p_group_id and status = 'pending';
  end if;
  return jsonb_build_object('id', p_group_id, 'archived', true);
end;
$$;

-- RLS: finance tables are readable only through explicit relationships. All writes use RPCs.
alter table public.finance_groups enable row level security;
alter table public.finance_group_members enable row level security;
alter table public.finance_group_membership_history enable row level security;
alter table public.finance_group_invitations enable row level security;
alter table public.finance_expenses enable row level security;
alter table public.finance_expense_participants enable row level security;
alter table public.finance_settlements enable row level security;
alter table public.finance_operation_requests enable row level security;

create policy finance_groups_select on public.finance_groups for select to authenticated using (
  private.finance_is_current_member(id, auth.uid())
  or exists(select 1 from public.finance_group_invitations i where i.group_id = id and i.invited_user_id = auth.uid() and i.status = 'pending')
);
create policy finance_members_select on public.finance_group_members for select to authenticated using (
  private.finance_is_current_member(group_id, auth.uid()) or user_id = auth.uid()
);
create policy finance_invitations_select on public.finance_group_invitations for select to authenticated using (
  invited_user_id = auth.uid() or private.finance_is_owner(group_id, auth.uid())
);
create policy finance_expenses_select on public.finance_expenses for select to authenticated using (
  private.finance_can_access_expense(id, auth.uid())
);
create policy finance_participants_select on public.finance_expense_participants for select to authenticated using (
  private.finance_can_access_expense(expense_id, auth.uid())
);
create policy finance_settlements_select on public.finance_settlements for select to authenticated using (
  private.finance_can_access_settlement(id, auth.uid())
);
create policy finance_operations_select on public.finance_operation_requests for select to authenticated using (actor_id = auth.uid());

revoke all on public.finance_groups, public.finance_group_members, public.finance_group_membership_history, public.finance_group_invitations,
  public.finance_expenses, public.finance_expense_participants, public.finance_settlements,
  public.finance_operation_requests from anon;
revoke insert, update, delete, truncate, references, trigger on public.finance_groups, public.finance_group_members, public.finance_group_membership_history,
  public.finance_group_invitations, public.finance_expenses, public.finance_expense_participants,
  public.finance_settlements, public.finance_operation_requests from authenticated;
grant select on public.finance_groups, public.finance_group_members, public.finance_group_invitations,
  public.finance_expenses, public.finance_expense_participants, public.finance_settlements to authenticated;

revoke all on function private.finance_is_current_member(uuid, uuid) from public;
revoke all on function private.finance_is_owner(uuid, uuid) from public;
revoke all on function private.finance_can_access_expense(uuid, uuid) from public;
revoke all on function private.finance_can_access_settlement(uuid, uuid) from public;
revoke all on function private.finance_assert_expense_balanced(uuid) from public;
revoke all on function private.finance_balance_trigger() from public;
revoke all on function private.finance_expense_json(uuid) from public;
revoke all on function private.finance_settlement_json(uuid) from public;
revoke all on function private.finance_insert_expense(uuid, jsonb, uuid, integer, uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.finance_is_current_member(uuid, uuid) to authenticated;
grant execute on function private.finance_is_owner(uuid, uuid) to authenticated;
grant execute on function private.finance_can_access_expense(uuid, uuid) to authenticated;
grant execute on function private.finance_can_access_settlement(uuid, uuid) to authenticated;

revoke all on function public.finance_create_group(text, uuid) from public;
revoke all on function public.finance_list_groups() from public;
revoke all on function public.finance_list_invitations() from public;
revoke all on function public.finance_search_invite_candidates(uuid, text, integer) from public;
revoke all on function public.finance_invite_member(uuid, uuid, uuid) from public;
revoke all on function public.finance_respond_to_invitation(uuid, boolean, uuid) from public;
revoke all on function public.finance_create_expense(jsonb) from public;
revoke all on function public.finance_edit_expense(uuid, jsonb) from public;
revoke all on function public.finance_archive_expense(uuid, uuid) from public;
revoke all on function public.finance_get_expense(uuid) from public;
revoke all on function public.finance_list_expenses(text, date, uuid, text, date, timestamptz, uuid, integer) from public;
revoke all on function public.finance_get_group_balances(uuid) from public;
revoke all on function public.finance_record_settlement(uuid, uuid, text, date, text, uuid) from public;
revoke all on function public.finance_reverse_settlement(uuid, text, uuid) from public;
revoke all on function public.finance_get_group_roster(uuid) from public;
revoke all on function public.finance_remove_member(uuid, uuid, uuid) from public;
revoke all on function public.finance_archive_group(uuid, uuid) from public;

grant execute on function public.finance_create_group(text, uuid) to authenticated;
grant execute on function public.finance_list_groups() to authenticated;
grant execute on function public.finance_list_invitations() to authenticated;
grant execute on function public.finance_search_invite_candidates(uuid, text, integer) to authenticated;
grant execute on function public.finance_invite_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.finance_respond_to_invitation(uuid, boolean, uuid) to authenticated;
grant execute on function public.finance_create_expense(jsonb) to authenticated;
grant execute on function public.finance_edit_expense(uuid, jsonb) to authenticated;
grant execute on function public.finance_archive_expense(uuid, uuid) to authenticated;
grant execute on function public.finance_get_expense(uuid) to authenticated;
grant execute on function public.finance_list_expenses(text, date, uuid, text, date, timestamptz, uuid, integer) to authenticated;
grant execute on function public.finance_get_group_balances(uuid) to authenticated;
grant execute on function public.finance_record_settlement(uuid, uuid, text, date, text, uuid) to authenticated;
grant execute on function public.finance_reverse_settlement(uuid, text, uuid) to authenticated;
grant execute on function public.finance_get_group_roster(uuid) to authenticated;
grant execute on function public.finance_remove_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.finance_archive_group(uuid, uuid) to authenticated;

commit;
