create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique check (username is null or char_length(username) between 3 and 40),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text,
  date date not null,
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index tasks_user_date_idx on public.tasks(user_id, date);
create index subtasks_task_idx on public.subtasks(task_id);

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "tasks_select_own" on public.tasks for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks for delete using (auth.uid() = user_id);
create policy "subtasks_select_own" on public.subtasks for select using (
  exists (select 1 from public.tasks where tasks.id = subtasks.task_id and tasks.user_id = auth.uid())
);
create policy "subtasks_insert_own" on public.subtasks for insert with check (
  exists (select 1 from public.tasks where tasks.id = subtasks.task_id and tasks.user_id = auth.uid())
);
create policy "subtasks_update_own" on public.subtasks for update using (
  exists (select 1 from public.tasks where tasks.id = subtasks.task_id and tasks.user_id = auth.uid())
) with check (
  exists (select 1 from public.tasks where tasks.id = subtasks.task_id and tasks.user_id = auth.uid())
);
create policy "subtasks_delete_own" on public.subtasks for delete using (
  exists (select 1 from public.tasks where tasks.id = subtasks.task_id and tasks.user_id = auth.uid())
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, nullif(new.raw_user_meta_data ->> 'username', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
