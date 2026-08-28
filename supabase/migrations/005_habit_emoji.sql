alter table public.habits
  add column if not exists emoji text;

comment on column public.habits.emoji is 'Optional emoji displayed with the habit in Lifeaholic and calendar sync.';
