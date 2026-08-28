create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 200),
  amount numeric(10, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  paid_by uuid not null references public.profiles(id),
  split_type text not null check (split_type in (
    'personal', 'split_equally', 'you_owed_full', 'other_owed_full', 'custom'
  )),
  created_at timestamptz not null default now(),
  check (
    (group_id is null and split_type = 'personal') or
    (group_id is not null and split_type <> 'personal')
  )
);

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_owed numeric(10, 2) not null check (amount_owed >= 0),
  is_settled boolean not null default false,
  unique (expense_id, user_id)
);

create index if not exists groups_created_by_idx on public.groups(created_by);
create index if not exists group_members_user_idx on public.group_members(user_id);
create index if not exists expenses_created_date_idx on public.expenses(created_by, expense_date desc);
create index if not exists expenses_group_date_idx on public.expenses(group_id, expense_date desc);
create index if not exists expense_splits_expense_idx on public.expense_splits(expense_id);
create index if not exists expense_splits_user_idx on public.expense_splits(user_id, is_settled);

-- These helpers bypass table RLS only to answer membership/access questions. Keeping
-- them in functions avoids recursive group_members policies.
create or replace function public.is_group_member(target_group_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = target_user_id
  );
$$;

create or replace function public.is_group_creator(target_group_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups
    where id = target_group_id and created_by = target_user_id
  );
$$;

create or replace function public.can_access_expense(target_expense_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    where e.id = target_expense_id
      and (e.created_by = target_user_id or public.is_group_member(e.group_id, target_user_id))
  );
$$;

revoke all on function public.is_group_member(uuid, uuid) from public;
revoke all on function public.is_group_creator(uuid, uuid) from public;
revoke all on function public.can_access_expense(uuid, uuid) from public;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.is_group_creator(uuid, uuid) to authenticated;
grant execute on function public.can_access_expense(uuid, uuid) to authenticated;

create or replace function public.add_group_creator_as_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.group_members (group_id, user_id) values (new.id, new.created_by)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists add_group_creator_as_member on public.groups;
create trigger add_group_creator_as_member
after insert on public.groups for each row execute procedure public.add_group_creator_as_member();

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;

create policy "groups_select_member" on public.groups for select to authenticated
using (created_by = auth.uid() or public.is_group_member(id));
create policy "groups_insert_own" on public.groups for insert to authenticated
with check (created_by = auth.uid());
create policy "groups_update_member" on public.groups for update to authenticated
using (created_by = auth.uid() or public.is_group_member(id))
with check (created_by = auth.uid() or public.is_group_member(id));
create policy "groups_delete_creator" on public.groups for delete to authenticated
using (created_by = auth.uid());

create policy "group_members_select_member" on public.group_members for select to authenticated
using (public.is_group_creator(group_id) or public.is_group_member(group_id));
create policy "group_members_insert_creator" on public.group_members for insert to authenticated
with check (public.is_group_creator(group_id));
create policy "group_members_delete_creator_or_self" on public.group_members for delete to authenticated
using (public.is_group_creator(group_id) or user_id = auth.uid());

create policy "expenses_select_accessible" on public.expenses for select to authenticated
using (created_by = auth.uid() or public.is_group_member(group_id));
create policy "expenses_insert_accessible" on public.expenses for insert to authenticated
with check (
  created_by = auth.uid()
  and (group_id is null or public.is_group_member(group_id))
  and (
    (group_id is null and paid_by = auth.uid())
    or (group_id is not null and public.is_group_member(group_id, paid_by))
  )
);
create policy "expenses_update_accessible" on public.expenses for update to authenticated
using (created_by = auth.uid() or public.is_group_member(group_id))
with check (
  (created_by = auth.uid() or public.is_group_member(group_id))
  and (
    (group_id is null and created_by = auth.uid() and paid_by = auth.uid())
    or (group_id is not null and public.is_group_member(group_id, paid_by))
  )
);
create policy "expenses_delete_accessible" on public.expenses for delete to authenticated
using (created_by = auth.uid() or public.is_group_member(group_id));

create policy "expense_splits_select_accessible" on public.expense_splits for select to authenticated
using (public.can_access_expense(expense_id));
create policy "expense_splits_insert_accessible" on public.expense_splits for insert to authenticated
with check (
  public.can_access_expense(expense_id)
  and exists (
    select 1 from public.expenses e
    where e.id = expense_id
      and (e.group_id is null and user_id = e.created_by or public.is_group_member(e.group_id, user_id))
  )
);
create policy "expense_splits_update_accessible" on public.expense_splits for update to authenticated
using (public.can_access_expense(expense_id)) with check (
  public.can_access_expense(expense_id)
  and exists (
    select 1 from public.expenses e
    where e.id = expense_id
      and (e.group_id is null and user_id = e.created_by or public.is_group_member(e.group_id, user_id))
  )
);
create policy "expense_splits_delete_accessible" on public.expense_splits for delete to authenticated
using (public.can_access_expense(expense_id));

-- Profile discovery is required for invitations. Email is copied from auth.users,
-- while account ownership remains enforced by the existing profile update policy.
alter table public.profiles add column if not exists email text;
create index if not exists profiles_username_lower_idx on public.profiles(lower(username));
create index if not exists profiles_email_lower_idx on public.profiles(lower(email));
update public.profiles p set email = u.email from auth.users u where p.id = u.id and p.email is null;

create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (true);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, email)
  values (new.id, nullif(new.raw_user_meta_data ->> 'username', ''), new.email);
  return new;
end;
$$;
