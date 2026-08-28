import { notifyTasksChanged } from '@/services/taskEvents';
import { supabase } from '@/services/supabase';
import { reloadAllWidgets } from '@/services/widgetReload';
import type { Subtask, Task, TaskPriority, TaskWithSubtasks } from '@/types/database';

const priorityOrder: Record<TaskPriority, number> = { red: 0, yellow: 1, blue: 2, green: 3 };
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
  return tasks.map((task) => ({ ...task, subtasks: (data as Subtask[]).filter((subtask) => subtask.task_id === task.id) }))
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.created_at.localeCompare(b.created_at));
}

export async function listTasks(userId: string, date: string) {
  const { data, error } = await supabase.from('tasks').select('*').eq('user_id', userId).eq('date', date).order('created_at');
  if (error) throw error;
  return attachSubtasks(data as Task[]);
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
export async function createTask(input: { user_id: string; title: string; description?: string; date: string; priority: TaskPriority }) {
  const { data, error } = await supabase.from('tasks').insert({ ...input, original_date: input.date }).select().single();
  if (error) throw error;
  notifyTaskMutation();
  return { ...(data as Task), subtasks: [] } as TaskWithSubtasks;
}
export async function setTaskCompleted(id: string, is_completed: boolean) {
  const { error } = await supabase.from('tasks').update({ is_completed, completed_at: is_completed ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw error;
  notifyTaskMutation();
}
export async function setTaskPriority(id: string, priority: TaskPriority) {
  const { error } = await supabase.from('tasks').update({ priority }).eq('id', id);
  if (error) throw error;
  notifyTaskMutation();
}
export async function setTaskTitle(id: string, title: string) { const { error } = await supabase.from('tasks').update({ title: title.trim() }).eq('id', id); if (error) throw error; notifyTaskMutation(); }
export async function deleteTask(id: string) { const { error } = await supabase.from('tasks').delete().eq('id', id); if (error) throw error; notifyTaskMutation(); }
export async function listSubtasks(taskId: string) { const { data, error } = await supabase.from('subtasks').select('*').eq('task_id', taskId).order('created_at'); if (error) throw error; return data as Subtask[]; }
export async function createSubtask(taskId: string, title: string) { const { data, error } = await supabase.from('subtasks').insert({ task_id: taskId, title }).select().single(); if (error) throw error; notifyTasksChanged(); return data as Subtask; }
export async function setSubtaskCompleted(id: string, is_completed: boolean) { const { error } = await supabase.from('subtasks').update({ is_completed }).eq('id', id); if (error) throw error; notifyTasksChanged(); }
