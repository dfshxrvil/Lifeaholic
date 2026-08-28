-- Iteration 4: professional UI data model, task rollover, habits, richer notes/journal.

-- Preserve the first date a task was scheduled for while `date` remains the
-- active due date used by existing clients.
alter table public.tasks add column if not exists original_date date;
update public.tasks set original_date = date where original_date is null;
alter table public.tasks alter column original_date set not null;

create or replace function public.set_task_original_date()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.original_date is null then new.original_date = new.date; end if;
  return new;
end;
$$;
drop trigger if exists set_task_original_date on public.tasks;
create trigger set_task_original_date before insert on public.tasks
for each row execute procedure public.set_task_original_date();

create index if not exists tasks_user_incomplete_date_idx
on public.tasks(user_id, date) where is_completed = false;

create or replace function public.rollover_overdue_tasks(target_date date)
returns integer language plpgsql security invoker set search_path = public as $$
declare affected integer;
begin
  if target_date is null then raise exception 'target_date is required'; end if;
  update public.tasks
  set date = target_date
  where user_id = auth.uid() and is_completed = false and date < target_date;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
grant execute on function public.rollover_overdue_tasks(date) to authenticated;

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  days_of_week integer[] not null check (
    cardinality(days_of_week) between 1 and 7
    and days_of_week <@ array[0,1,2,3,4,5,6]
  ),
  time time,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  completed_date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, completed_date)
);

create index if not exists habits_user_active_idx on public.habits(user_id, is_archived);
create index if not exists habit_logs_habit_date_idx on public.habit_logs(habit_id, completed_date desc);
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
create policy "habits_all_own" on public.habits for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "habit_logs_all_own" on public.habit_logs for all to authenticated
using (exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()))
with check (exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));

-- Finance categories. Existing rows become Other and use their description as
-- the required explanatory note, so the new constraint is safe for old data.
alter table public.expenses add column if not exists category text;
alter table public.expenses add column if not exists custom_category_note text;
update public.expenses
set category = coalesce(category, 'Other'),
    custom_category_note = case
      when coalesce(category, 'Other') = 'Other' then coalesce(nullif(trim(custom_category_note), ''), description)
      else custom_category_note
    end;
alter table public.expenses alter column category set default 'Other';
alter table public.expenses alter column category set not null;
alter table public.expenses drop constraint if exists expenses_category_check;
alter table public.expenses add constraint expenses_category_check
check (category in ('Food', 'Online shopping', 'Other', 'Investments'));
alter table public.expenses drop constraint if exists expenses_other_category_note_check;
alter table public.expenses add constraint expenses_other_category_note_check
check (category <> 'Other' or nullif(trim(custom_category_note), '') is not null);
create index if not exists expenses_category_idx on public.expenses(created_by, category, expense_date desc);

-- Notes retain content_html during the transition. `content` becomes the source
-- of truth for the new editor and JSONB fields hold structured interactive data.
alter table public.notes add column if not exists content text not null default '';
alter table public.notes add column if not exists is_pinned boolean not null default false;
alter table public.notes add column if not exists checklist_data jsonb not null default '[]'::jsonb;
alter table public.notes add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.notes add column if not exists deleted_at timestamptz;
update public.notes set content = content_html where content = '' and content_html <> '';
create index if not exists notes_user_active_updated_idx
on public.notes(user_id, is_pinned desc, updated_at desc) where deleted_at is null;
create index if not exists notes_user_deleted_idx
on public.notes(user_id, deleted_at desc) where deleted_at is not null;

-- Multiple journal entries per day are required by the chronological feed.
alter table public.journal_entries add column if not exists body_text text not null default '';
alter table public.journal_entries add column if not exists media_urls text[] not null default '{}';
alter table public.journal_entries add column if not exists location jsonb;
alter table public.journal_entries add column if not exists voice_memo_url text;
alter table public.journal_entries add column if not exists is_bookmarked boolean not null default false;
alter table public.journal_entries add column if not exists prompt_category text;
alter table public.journal_entries add column if not exists mood text;
update public.journal_entries set body_text = content_html where body_text = '' and content_html <> '';
alter table public.journal_entries drop constraint if exists journal_entries_user_id_date_string_key;
create index if not exists journal_entries_user_date_created_idx
on public.journal_entries(user_id, date_string desc, created_at desc);
create index if not exists journal_entries_user_bookmarked_idx
on public.journal_entries(user_id, is_bookmarked) where is_bookmarked = true;

-- Two independently editable D-Day slots.
create table if not exists public.d_day_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot smallint not null check (slot between 1 and 2),
  title text not null check (char_length(trim(title)) between 1 and 100),
  event_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slot)
);
insert into public.d_day_events (user_id, slot, title, event_date)
select id, 1, coalesce(nullif(trim(d_day_event_title), ''), 'D-Day'), d_day_event_date
from public.profiles where d_day_event_date is not null
on conflict (user_id, slot) do nothing;
create index if not exists d_day_events_user_idx on public.d_day_events(user_id, slot);
alter table public.d_day_events enable row level security;
create policy "d_day_events_all_own" on public.d_day_events for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

update storage.buckets set allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/heic',
  'video/mp4','video/quicktime','video/webm',
  'audio/m4a','audio/mp4','audio/mpeg','audio/webm'
] where id = 'attachments';
