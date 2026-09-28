begin;

alter table public.tasks
  add column task_time time,
  add column reminder_offset integer,
  add column notification_id text;

alter table public.tasks
  add constraint tasks_reminder_requires_time_check
    check (reminder_offset is null or task_time is not null),
  add constraint tasks_reminder_offset_range_check
    check (reminder_offset is null or reminder_offset between 0 and 10080);

create index tasks_user_date_time_idx
  on public.tasks (user_id, date, task_time)
  where is_completed = false;

comment on column public.tasks.task_time is
  'Optional local wall-clock time. NULL means All Day.';
comment on column public.tasks.reminder_offset is
  'Optional number of minutes before task_time for a local device notification.';
comment on column public.tasks.notification_id is
  'Identifier of the locally scheduled notification on the device that last scheduled it.';

commit;
