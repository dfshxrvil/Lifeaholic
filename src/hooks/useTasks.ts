import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeTasksChanged } from '@/services/taskEvents';
import * as tasksService from '@/services/tasks';
import type { TaskPriority, TaskWithSubtasks } from '@/types/database';
import { toDateKey } from '@/utils/dates';

const rolledOverFor = new Set<string>();

export function useTasks(date: string, options: { refreshOnMount?: boolean } = {}) {
  const { refreshOnMount = true } = options;
  const { user } = useAuth(); const [tasks, setTasks] = useState<TaskWithSubtasks[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async (showLoading = true) => { if (!user) { setTasks([]); return; } if (showLoading) setLoading(true); setError(null); const today = toDateKey(new Date()); const rolloverKey = `${user.id}:${today}`; try { if (!rolledOverFor.has(rolloverKey)) { rolledOverFor.add(rolloverKey); try { await tasksService.rolloverOverdueTasks(today); } catch (cause) { rolledOverFor.delete(rolloverKey); throw cause; } } setTasks(await tasksService.listTasks(user.id, date)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load tasks.'); } finally { if (showLoading) setLoading(false); } }, [user, date]);
  useEffect(() => { if (refreshOnMount) void refresh(); return subscribeTasksChanged(() => void refresh(false)); }, [refresh, refreshOnMount]);
  const setTaskCompletion = async (task: TaskWithSubtasks, isCompleted: boolean) => {
    const completedAt = isCompleted ? new Date().toISOString() : null;
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, is_completed: isCompleted, completed_at: completedAt } : item));
    try {
      await tasksService.setTaskCompleted(task.id, isCompleted);
    } catch (cause) {
      setTasks((current) => current.map((item) => item.id === task.id ? task : item));
      throw cause;
    }
  };
  return {
    tasks, loading, error, refresh,
    addTask: async (title: string, description: string | undefined, priority: TaskPriority) => { if (!user) return; const task = await tasksService.createTask({ user_id: user.id, title, description, date, priority }); setTasks((current) => [...current, task]); },
    setTaskCompletion,
    toggleTask: async (task: TaskWithSubtasks) => setTaskCompletion(task, !task.is_completed),
    renameTask: async (task: TaskWithSubtasks, title: string) => { const nextTitle = title.trim(); if (!nextTitle || nextTitle === task.title) return; setTasks((current) => current.map((item) => item.id === task.id ? { ...item, title: nextTitle } : item)); try { await tasksService.setTaskTitle(task.id, nextTitle); } catch (cause) { setTasks((current) => current.map((item) => item.id === task.id ? task : item)); throw cause; } },
    changePriority: async (task: TaskWithSubtasks, priority: TaskPriority) => { setTasks((current) => current.map((item) => item.id === task.id ? { ...item, priority } : item)); try { await tasksService.setTaskPriority(task.id, priority); } catch (cause) { await refresh(); throw cause; } },
  };
}
