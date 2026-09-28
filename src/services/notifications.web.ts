import type { Reminder, ReminderAlertType, Task } from '@/types/database';
import type { ScheduledAlert } from '@/types/scheduledAlert';
import { scheduledAlertDate } from '@/utils/scheduledAlertDate';
import { taskTriggerDate } from '@/utils/taskScheduling';

export const REMINDER_CHANNELS: Record<ReminderAlertType, string> = {
  silent: 'reminder-silent',
  standard: 'reminder-standard',
  alarm: 'reminder-alarm',
};
export const TASK_REMINDER_CHANNEL = 'task-reminders';

const STORAGE_KEY = 'lifeaholic.web-notifications.v1';
const MAX_TIMEOUT_MS = 2_147_000_000;

type WebNotificationRecord = {
  id: string;
  title: string;
  body: string;
  triggerAt: number;
  silent: boolean;
  audibleAlarm: boolean;
  tag: string;
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let audioContext: AudioContext | null = null;
let initialized = false;

function readRecords(): WebNotificationRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is WebNotificationRecord => {
      const item = value as Partial<WebNotificationRecord>;
      return typeof item.id === 'string'
        && typeof item.title === 'string'
        && typeof item.body === 'string'
        && typeof item.triggerAt === 'number'
        && typeof item.silent === 'boolean'
        && typeof item.audibleAlarm === 'boolean'
        && typeof item.tag === 'string';
    });
  } catch {
    return [];
  }
}

function writeRecords(records: WebNotificationRecord[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
  catch { /* Timers still work when browser storage is unavailable. */ }
}

function removeRecord(id: string) {
  writeRecords(readRecords().filter((record) => record.id !== id));
}

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

function prepareAlarmAudio() {
  const context = getAudioContext();
  if (context?.state === 'suspended') void context.resume().catch(() => undefined);
}

function playAlarmSound() {
  const context = getAudioContext();
  if (!context) return;
  void context.resume().then(() => {
    const start = context.currentTime;
    [0, 0.38, 0.76, 1.14].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(index % 2 ? 740 : 880, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.28);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.3);
    });
  }).catch(() => undefined);
}

function fire(record: WebNotificationRecord) {
  timers.delete(record.id);
  removeRecord(record.id);
  if (record.audibleAlarm) playAlarmSound();
  try {
    const notification = new window.Notification(record.title, {
      body: record.body,
      tag: record.tag,
      silent: record.silent,
      requireInteraction: record.audibleAlarm,
    });
    notification.onclick = () => { window.focus(); notification.close(); };
  } catch { /* Permission can be revoked after scheduling. */ }
}

function arm(record: WebNotificationRecord) {
  const existing = timers.get(record.id);
  if (existing) clearTimeout(existing);
  const remaining = record.triggerAt - Date.now();
  if (remaining <= 0) { removeRecord(record.id); return; }
  const timer = setTimeout(() => {
    if (record.triggerAt - Date.now() > 0) arm(record);
    else fire(record);
  }, Math.min(remaining, MAX_TIMEOUT_MS));
  timers.set(record.id, timer);
}

async function requireBrowserPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    throw new Error('This browser does not support notifications.');
  }
  let permission = window.Notification.permission;
  if (permission === 'default') permission = await window.Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Allow browser notifications to schedule this alert.');
}

function newIdentifier() {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web:${id}`;
}

async function scheduleWebNotification(input: Omit<WebNotificationRecord, 'id'>) {
  if (input.audibleAlarm) prepareAlarmAudio();
  if (input.triggerAt <= Date.now()) throw new Error('Choose a time in the future.');
  await requireBrowserPermission();
  const record: WebNotificationRecord = { ...input, id: newIdentifier() };
  const records = readRecords().filter((item) => item.id !== record.id);
  writeRecords([...records, record]);
  arm(record);
  return record.id;
}

export function installNotificationHandler() {
  // Native foreground handlers are unnecessary for the browser Notification API.
}

export async function initializeNotifications() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const now = Date.now();
  const pending = readRecords().filter((record) => record.triggerAt > now);
  writeRecords(pending);
  pending.forEach(arm);
}

type SchedulableReminder = Pick<Reminder, 'id' | 'title' | 'target_date' | 'target_time' | 'alert_type'>;

export async function scheduleReminderNotification(reminder: SchedulableReminder) {
  const trigger = scheduledAlertDate(reminder.target_date, reminder.target_time.slice(0, 5));
  if (!trigger) throw new Error('Choose a valid reminder date and time.');
  return scheduleWebNotification({
    title: reminder.alert_type === 'alarm' ? `Reminder alarm · ${reminder.title}` : reminder.title,
    body: reminder.alert_type === 'alarm' ? 'This important Lifeaholic reminder is due now.' : 'Lifeaholic reminder',
    triggerAt: trigger.getTime(),
    silent: reminder.alert_type === 'silent',
    audibleAlarm: reminder.alert_type === 'alarm',
    tag: `reminder:${reminder.id}`,
  });
}

export async function cancelReminderNotification(notificationId: string | null | undefined) {
  if (!notificationId) return;
  const timer = timers.get(notificationId);
  if (timer) clearTimeout(timer);
  timers.delete(notificationId);
  removeRecord(notificationId);
}

type SchedulableTask = Pick<Task, 'id' | 'title' | 'date' | 'task_time' | 'reminder_offset'>;

export async function scheduleTaskNotification(task: SchedulableTask) {
  if (!task.task_time || task.reminder_offset === null) return null;
  const trigger = taskTriggerDate(task.date, task.task_time, task.reminder_offset);
  if (!trigger) throw new Error('Choose a valid task time and reminder.');
  const body = task.reminder_offset === 0
    ? 'This task is due now.'
    : `This task starts in ${task.reminder_offset < 60 ? `${task.reminder_offset} minutes` : task.reminder_offset === 60 ? '1 hour' : `${task.reminder_offset / 60} hours`}.`;
  return scheduleWebNotification({ title: task.title, body, triggerAt: trigger.getTime(), silent: false, audibleAlarm: false, tag: `task:${task.id}` });
}

export async function cancelTaskNotification(notificationId: string | null | undefined) {
  await cancelReminderNotification(notificationId);
}

type SchedulableAlert = Pick<ScheduledAlert, 'id' | 'kind' | 'title' | 'date' | 'time' | 'deliveryMode'>;

export async function scheduleScheduledAlertNotification(alert: SchedulableAlert) {
  const trigger = scheduledAlertDate(alert.date, alert.time);
  if (!trigger) throw new Error('Use a valid date and 24-hour time.');
  const alarm = alert.kind === 'alarm' || alert.deliveryMode === 'alarm';
  return scheduleWebNotification({
    title: alert.kind === 'alarm' ? `Alarm · ${alert.title}` : alert.title,
    body: alert.kind === 'alarm' ? 'Your Lifeaholic alarm is going off.' : 'Lifeaholic reminder',
    triggerAt: trigger.getTime(),
    silent: alert.deliveryMode === 'silent',
    audibleAlarm: alarm,
    tag: `${alert.kind}:${alert.id}`,
  });
}

export async function cancelScheduledAlertNotification(notificationId: string | null | undefined) {
  await cancelReminderNotification(notificationId);
}

void initializeNotifications();
