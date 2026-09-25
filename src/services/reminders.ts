import * as Crypto from 'expo-crypto';
import { cancelReminderNotification, scheduleReminderNotification } from '@/services/notifications';
import { supabase } from '@/services/supabase';
import type { Reminder, ReminderAlertType } from '@/types/database';

export type CreateReminderInput = {
  user_id: string;
  title: string;
  target_date: string;
  target_time: string;
  alert_type: ReminderAlertType;
};

export async function getReminders(userId: string) {
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', userId)
    .eq('is_completed', false)
    .order('target_date')
    .order('target_time')
    .order('created_at');
  if (error) throw error;
  return data as Reminder[];
}

export async function createReminder(input: CreateReminderInput) {
  const title = input.title.trim();
  if (!title) throw new Error('Name what this reminder is for.');

  const candidate: Reminder = {
    id: Crypto.randomUUID(),
    user_id: input.user_id,
    title,
    target_date: input.target_date,
    target_time: input.target_time,
    alert_type: input.alert_type,
    is_completed: false,
    notification_id: null,
    created_at: new Date().toISOString(),
  };
  const notificationId = await scheduleReminderNotification(candidate);
  const { data, error } = await supabase
    .from('reminders')
    .insert({ ...candidate, notification_id: notificationId })
    .select('*')
    .single();
  if (error) {
    await cancelReminderNotification(notificationId).catch(() => undefined);
    throw error;
  }
  return data as Reminder;
}

export async function completeReminder(reminder: Reminder) {
  const { error } = await supabase
    .from('reminders')
    .update({ is_completed: true, notification_id: null })
    .eq('id', reminder.id)
    .eq('user_id', reminder.user_id);
  if (error) throw error;
  await cancelReminderNotification(reminder.notification_id).catch(() => undefined);
}

export async function deleteReminder(reminder: Reminder) {
  const { error } = await supabase
    .from('reminders')
    .delete()
    .eq('id', reminder.id)
    .eq('user_id', reminder.user_id);
  if (error) throw error;
  await cancelReminderNotification(reminder.notification_id).catch(() => undefined);
}
