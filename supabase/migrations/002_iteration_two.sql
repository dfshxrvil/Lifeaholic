do $$ begin
  create type public.task_priority as enum ('red', 'yellow', 'blue', 'green');
exception when duplicate_object then null;
end $$;

alter table public.tasks
  add column if not exists priority public.task_priority not null default 'green',
  add column if not exists completed_at timestamptz;

update public.tasks set completed_at = coalesce(completed_at, created_at)
where is_completed = true and completed_at is null;

create or replace function public.sync_task_completed_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_completed = true and (old.is_completed = false or new.completed_at is null) then
    new.completed_at = now();
  elsif new.is_completed = false then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_task_completed_at on public.tasks;
create trigger sync_task_completed_at before update of is_completed on public.tasks
for each row execute procedure public.sync_task_completed_at();

alter table public.profiles
  add column if not exists d_day_event_title text,
  add column if not exists d_day_event_date date,
  add column if not exists theme_preference jsonb not null default '{"mode":"highContrast"}'::jsonb;

create table if not exists public.focus_subjects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100), created_at timestamptz not null default now(),
  unique (user_id, name)
);
create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.focus_subjects(id) on delete cascade, start_time timestamptz not null,
  end_time timestamptz not null, duration_seconds integer not null check (duration_seconds >= 0), check (end_time >= start_time)
);
create table if not exists public.focus_breaks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null check (activity_type in ('stare_at_wall','sports','socialize','snacks','washroom','other')),
  custom_note text, start_time timestamptz not null, end_time timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0), check (end_time >= start_time),
  check (activity_type <> 'other' or nullif(trim(custom_note), '') is not null)
);
create table if not exists public.note_folders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100), created_at timestamptz not null default now(),
  unique (user_id, name)
);
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.note_folders(id) on delete set null, title text not null check (char_length(trim(title)) between 1 and 200),
  content_html text not null default '', is_locked boolean not null default false, pin_hash text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((is_locked = false) or pin_hash is not null)
);
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  date_string date not null, title text not null default '', content_html text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, date_string)
);

create index if not exists focus_subjects_user_idx on public.focus_subjects(user_id);
create index if not exists focus_sessions_user_start_idx on public.focus_sessions(user_id, start_time);
create index if not exists focus_breaks_user_start_idx on public.focus_breaks(user_id, start_time);
create index if not exists note_folders_user_idx on public.note_folders(user_id);
create index if not exists notes_user_folder_idx on public.notes(user_id, folder_id);
create index if not exists journal_entries_user_date_idx on public.journal_entries(user_id, date_string);
create index if not exists tasks_user_date_priority_idx on public.tasks(user_id, date, priority);

alter table public.focus_subjects enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.focus_breaks enable row level security;
alter table public.note_folders enable row level security;
alter table public.notes enable row level security;
alter table public.journal_entries enable row level security;

create policy "focus_subjects_all_own" on public.focus_subjects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "focus_sessions_all_own" on public.focus_sessions for all using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (select 1 from public.focus_subjects where focus_subjects.id = subject_id and focus_subjects.user_id = auth.uid())
);
create policy "focus_breaks_all_own" on public.focus_breaks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "note_folders_all_own" on public.note_folders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notes_all_own" on public.notes for all using (auth.uid() = user_id) with check (
  auth.uid() = user_id and (folder_id is null or exists (select 1 from public.note_folders where note_folders.id = folder_id and note_folders.user_id = auth.uid()))
);
create policy "journal_entries_all_own" on public.journal_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 26214400,
  array['image/jpeg','image/png','image/webp','image/heic','audio/m4a','audio/mp4','audio/mpeg','audio/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
allowed_mime_types = excluded.allowed_mime_types;

create policy "attachments_select_own" on storage.objects for select to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_update_own" on storage.objects for update to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
