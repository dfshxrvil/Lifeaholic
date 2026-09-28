import * as Crypto from 'expo-crypto';
import { cancelTaskNotification, scheduleTaskNotification } from '@/services/notifications';
import { notifyTasksChanged } from '@/services/taskEvents';
import { supabase } from '@/services/supabase';
import { reloadAllWidgets } from '@/services/widgetReload';
import type { Subtask, Task, TaskPriority, TaskWithSubtasks } from '@/types/database';
import { sortTasksForDate, taskTriggerDate } from '@/utils/taskScheduling';

function notifyTaskMutation() {
  // Reload immediately after the database commit. WidgetSyncProvider then
  // writes the canonical App Group snapshot and performs a second reload.
  reloadAllWidgets();
  notifyTasksChanged();
}
async function attachSubtasks(tasks: Task[]): Promise<TaskWithSubtasks[]> {
  if (!tasks.length) return [];
  const { data, error } = await supabase.from('subtasks').select('*').in('task_id', tasks.map((task) => task.id)).order('created_at');
  if (error) throw error;
  return tasks.map((task) => ({ ...task, subtasks: (data as Subtask[]).filter((subtask) => subtask.task_id === task.id) }));
}

export async function listTasks(userId: string, date: string) {
  const { data, error } = await supabase.from('tasks').select('*').eq('user_id', userId).eq('date', date).order('created_at');
  if (error) throw error;
  return sortTasksForDate(await attachSubtasks(data as Task[]), date, new Date());
}
export async function rolloverOverdueTasks(targetDate: string) {
  const { data, error } = await supabase.rpc('rollover_overdue_tasks', { target_date: targetDate });
  if (error) throw error;
  if (Number(data) > 0) notifyTaskMutation();
  return Number(data ?? 0);
}
export async function listTasksInRange(userId: string, start: string, end: string) {
  const { data, error } = await supabase.from('tasks').select('*').eq('user_id', userId).gte('date', start).lte('date', end).order('date');
  if (error) throw error;
  return data as Task[];
}
export type TaskWriteInput = { user_id: string; title: string; description?: string; date: string; priority: TaskPriority; task_time: string | null; reminder_offset: number | null };

export async function createTask(input: TaskWriteInput) {
  const candidate: Task = {
    id: Crypto.randomUUID(), user_id: input.user_id, title: input.title.trim(), description: input.description?.trim() || null,
    date: input.date, original_date: input.date, task_time: input.task_time, reminder_offset: input.task_time ? input.reminder_offset : null,
    notification_id: null, is_completed: false, priority: input.priority, completed_at: null, created_at: new Date().toISOString(),
  };
  const notificationId = await scheduleTaskNotification(candidate);
  const { data, error } = await supabase.from('tasks').insert({ ...candidate, notification_id: notificationId }).select().single();
  if (error) {
    await cancelTaskNotification(notificationId).catch(() => undefined);
    throw error;
  }
  notifyTaskMutation();
  return { ...(data as Task), subtasks: [] } as TaskWithSubtasks;
}
export async function setTaskCompleted(taskOrId: Task | string, is_completed: boolean) {
  let task: Task;
  if (typeof taskOrId === 'string') {
    const { data, error } = await supabase.from('tasks').select('*').eq('id', taskOrId).single();
    if (error) throw error;
    task = data as Task;
  } else task = taskOrId;
  let notificationId: string | null = null;
  if (!is_completed && task.task_time && task.reminder_offset !== null) {
    const trigger = taskTriggerDate(task.date, task.task_time, task.reminder_offset);
    if (trigger && trigger.getTime() > Date.now()) notificationId = await scheduleTaskNotification(task).catch(() => null);
  }
  const { error } = await supabase.from('tasks').update({
    is_completed,
    completed_at: is_completed ? new Date().toISOString() : null,
    notification_id: is_completed ? null : notificationId,
  }).eq('id', task.id);
  if (error) {
    await cancelTaskNotification(notificationId).catch(() => undefined);
    throw error;
  }
  if (is_completed) await cancelTaskNotification(task.notification_id).catch(() => undefined);
  notifyTaskMutation();
  return notificationId;
}
export async function setTaskPriority(id: string, priority: TaskPriority) {
  const { error } = await supabase.from('tasks').update({ priority }).eq('id', id);
  if (error) throw error;
  notifyTaskMutation();
}
export async function updateTask(task: Task, values: Omit<TaskWriteInput, 'user_id'>) {
  const candidate = { ...task, ...values, title: values.title.trim(), description: values.description?.trim() || null, reminder_offset: values.task_time ? values.reminder_offset : null };
  const notificationId = candidate.is_completed ? null : await scheduleTaskNotification(candidate);
  const { data, error } = await supabase.from('tasks').update({
    title: candidate.title, description: candidate.description, priority: candidate.priority, date: candidate.date,
    task_time: candidate.task_time, reminder_offset: candidate.reminder_offset, notification_id: notificationId,
  }).eq('id', task.id).select('*').single();
  if (error) {
    await cancelTaskNotification(notificationId).catch(() => undefined);
    throw error;
  }
  await cancelTaskNotification(task.notification_id).catch(() => undefined);
  notifyTaskMutation();
  return data as Task;
}
export async function setTaskTitle(task: Task, title: string) {
  const nextTitle = title.trim();
  let notificationId: string | null = task.notification_id;
  if (task.notification_id && task.task_time && task.reminder_offset !== null) {
    const trigger = taskTriggerDate(task.date, task.task_time, task.reminder_offset);
    notificationId = trigger && trigger.getTime() > Date.now()
      ? await scheduleTaskNotification({ ...task, title: nextTitle })
      : null;
  }
  const { error } = await supabase.from('tasks').update({ title: nextTitle, notification_id: notificationId }).eq('id', task.id);
  if (error) {
    if (notificationId !== task.notification_id) await cancelTaskNotification(notificationId).catch(() => undefined);
    throw error;
  }
  if (notificationId !== task.notification_id) await cancelTaskNotification(task.notification_id).catch(() => undefined);
  notifyTaskMutation();
}
export async function deleteTask(task: Task) {
  const { error } = await supabase.from('tasks').delete().eq('id', task.id);
  if (error) throw error;
  await cancelTaskNotification(task.notification_id).catch(() => undefined);
  notifyTaskMutation();
}
export async function listSubtasks(taskId: string) { const { data, error } = await supabase.from('subtasks').select('*').eq('task_id', taskId).order('created_at'); if (error) throw error; return data as Subtask[]; }
export async function createSubtask(taskId: string, title: string) { const { data, error } = await supabase.from('subtasks').insert({ task_id: taskId, title }).select().single(); if (error) throw error; notifyTasksChanged(); return data as Subtask; }
export async function setSubtaskCompleted(id: string, is_completed: boolean) { const { error } = await supabase.from('subtasks').update({ is_completed }).eq('id', id); if (error) throw error; notifyTasksChanged(); }
