import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as remindersService from '@/services/reminders';
import type { Reminder, ReminderAlertType } from '@/types/database';
import { groupReminders, sortReminders } from '@/utils/reminderGrouping';

export { groupReminders } from '@/utils/reminderGrouping';

export function useReminders() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const activeUserId = useRef(user?.id);

  useEffect(() => { activeUserId.current = user?.id; }, [user?.id]);

  const refresh = useCallback(async (showLoading = true) => {
    if (!user) {
      setReminders([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (showLoading) setLoading(true);
    setError(null);
    const requestedUserId = user.id;
    try {
      const next = await remindersService.getReminders(requestedUserId);
      if (activeUserId.current !== requestedUserId) return;
      setReminders(next);
      setReferenceDate(new Date());
    } catch (cause) {
      if (activeUserId.current !== requestedUserId) return;
      setError(cause instanceof Error ? cause.message : 'Unable to load reminders.');
    } finally {
      if (showLoading && activeUserId.current === requestedUserId) setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const sections = useMemo(
    () => groupReminders(reminders, referenceDate),
    [reminders, referenceDate],
  );

  const addReminder = async (input: Omit<remindersService.CreateReminderInput, 'user_id'>) => {
    if (!user) throw new Error('Sign in to create a reminder.');
    const mutationUserId = user.id;
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: Reminder = {
      id: optimisticId,
      user_id: mutationUserId,
      title: input.title.trim(),
      target_date: input.target_date,
      target_time: input.target_time,
      alert_type: input.alert_type,
      is_completed: false,
      notification_id: null,
      created_at: new Date().toISOString(),
    };
    setError(null);
    setReminders((current) => sortReminders([...current, optimistic]));
    try {
      const created = await remindersService.createReminder({ ...input, user_id: mutationUserId });
      if (activeUserId.current === mutationUserId) setReminders((current) => sortReminders(current.map((item) => item.id === optimisticId ? created : item)));
      return created;
    } catch (cause) {
      if (activeUserId.current === mutationUserId) {
        setReminders((current) => current.filter((item) => item.id !== optimisticId));
        setError(cause instanceof Error ? cause.message : 'Unable to create the reminder.');
      }
      throw cause;
    }
  };

  const toggleCompletion = async (reminder: Reminder) => {
    setError(null);
    setReminders((current) => current.filter((item) => item.id !== reminder.id));
    try {
      await remindersService.completeReminder(reminder);
    } catch (cause) {
      if (activeUserId.current === reminder.user_id) {
        setReminders((current) => sortReminders([...current, reminder]));
        setError(cause instanceof Error ? cause.message : 'Unable to complete the reminder.');
      }
      throw cause;
    }
  };

  const deleteReminder = async (reminder: Reminder) => {
    setError(null);
    setReminders((current) => current.filter((item) => item.id !== reminder.id));
    try {
      await remindersService.deleteReminder(reminder);
    } catch (cause) {
      if (activeUserId.current === reminder.user_id) {
        setReminders((current) => sortReminders([...current, reminder]));
        setError(cause instanceof Error ? cause.message : 'Unable to delete the reminder.');
      }
      throw cause;
    }
  };

  return {
    reminders,
    sections,
    loading,
    error,
    refresh,
    addReminder,
    toggleCompletion,
    deleteReminder,
  };
}

export type AddReminderValues = {
  title: string;
  target_date: string;
  target_time: string;
  alert_type: ReminderAlertType;
};
