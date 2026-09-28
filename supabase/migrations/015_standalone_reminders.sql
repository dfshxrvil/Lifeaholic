begin;

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  target_date date not null,
  target_time time not null,
  alert_type text not null default 'standard'
    check (alert_type in ('silent', 'standard', 'alarm')),
  is_completed boolean not null default false,
  notification_id text,
  created_at timestamptz not null default now()
);

create index reminders_user_incomplete_date_idx
  on public.reminders (user_id, target_date, target_time)
  where is_completed = false;

alter table public.reminders enable row level security;

create policy "reminders_select_own"
  on public.reminders for select
  using (auth.uid() = user_id);

create policy "reminders_insert_own"
  on public.reminders for insert
  with check (auth.uid() = user_id);

create policy "reminders_update_own"
  on public.reminders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "reminders_delete_own"
  on public.reminders for delete
  using (auth.uid() = user_id);

commit;
