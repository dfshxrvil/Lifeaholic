import type { TaskWithSubtasks } from '@/types/database';
import { scheduledAlertDate } from '@/utils/scheduledAlertDate';

export function taskTriggerDate(date: string, taskTime: string, reminderOffset: number) {
  const taskDate = scheduledAlertDate(date, taskTime.slice(0, 5));
  if (!taskDate || !Number.isInteger(reminderOffset) || reminderOffset < 0) return null;
  return new Date(taskDate.getTime() - reminderOffset * 60_000);
}

export function sortTasksForDate(tasks: TaskWithSubtasks[], selectedDate: string, now: Date) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const timedRank = (task: TaskWithSubtasks) => {
    if (!task.task_time) return [2, 0] as const;
    const [hour = 0, minute = 0] = task.task_time.split(':').map(Number);
    const minutes = hour * 60 + minute;
    if (selectedDate === today && minutes < currentMinutes) return [1, minutes] as const;
    return [0, minutes] as const;
  };
  return [...tasks].sort((left, right) => {
    const leftRank = timedRank(left);
    const rightRank = timedRank(right);
    return leftRank[0] - rightRank[0]
      || leftRank[1] - rightRank[1]
      || left.created_at.localeCompare(right.created_at);
  });
}

export function formatTaskTime(taskTime: string) {
  const [hour = 0, minute = 0] = taskTime.split(':').map(Number);
  const value = new Date(2000, 0, 1, hour, minute);
  return value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
