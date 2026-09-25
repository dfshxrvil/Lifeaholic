import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Reminder, ReminderAlertType, Task } from '@/types/database';
import type { ReminderDeliveryMode, ScheduledAlert } from '@/types/scheduledAlert';
import { scheduledAlertDate } from '@/utils/scheduledAlertDate';
import { taskTriggerDate } from '@/utils/taskScheduling';

export const REMINDER_CHANNELS: Record<ReminderAlertType, string> = {
  silent: 'reminder-silent',
  standard: 'reminder-standard',
  alarm: 'reminder-alarm',
};
export const TASK_REMINDER_CHANNEL = 'task-reminders';

let initialization: Promise<void> | null = null;

export function installNotificationHandler() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const alertType = notification.request.content.data?.alertType;
      const legacyMode = notification.request.content.data?.deliveryMode;
      const silent = alertType === 'silent' || legacyMode === 'silent';
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: !silent,
        shouldSetBadge: false,
      };
    },
  });
}

export async function initializeNotifications() {
  if (Platform.OS === 'web') return;
  if (initialization) return initialization;
  initialization = (async () => {
    installNotificationHandler();
    if (Platform.OS !== 'android') return;
    await Promise.all([
      Notifications.setNotificationChannelAsync(REMINDER_CHANNELS.silent, {
        name: 'Silent reminders',
        description: 'Lifeaholic reminders without sound or vibration.',
        importance: Notifications.AndroidImportance.MIN,
        sound: null,
        enableVibrate: false,
        vibrationPattern: null,
        showBadge: false,
      }),
      Notifications.setNotificationChannelAsync(REMINDER_CHANNELS.standard, {
        name: 'Standard reminders',
        description: 'Lifeaholic reminders with the normal notification sound.',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
        enableVibrate: true,
      }),
      Notifications.setNotificationChannelAsync(REMINDER_CHANNELS.alarm, {
        name: 'Alarm reminders',
        description: 'Lifeaholic reminders that need immediate attention.',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        enableVibrate: true,
        vibrationPattern: [0, 500, 200, 500],
        bypassDnd: true,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.ALARM,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      }),
      Notifications.setNotificationChannelAsync(TASK_REMINDER_CHANNEL, {
        name: 'Task reminders',
        description: 'Alerts before timed Lifeaholic tasks.',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        enableVibrate: true,
        vibrationPattern: [0, 250, 180, 250],
      }),
    ]);
  })().catch((cause) => {
    initialization = null;
    throw cause;
  });
  return initialization;
}

async function requireNotificationPermission() {
  if (Platform.OS === 'web') {
    throw new Error('Scheduled reminders are available in the iOS and Android apps.');
  }
  await initializeNotifications();
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    permission = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
  }
  if (!permission.granted) {
    throw new Error('Allow notifications in device settings to schedule this reminder.');
  }
  return permission;
}

type SchedulableReminder = Pick<
  Reminder,
  'id' | 'title' | 'target_date' | 'target_time' | 'alert_type'
>;

export async function scheduleReminderNotification(reminder: SchedulableReminder) {
  const triggerDate = scheduledAlertDate(reminder.target_date, reminder.target_time.slice(0, 5));
  if (!triggerDate) throw new Error('Choose a valid reminder date and time.');
  if (triggerDate.getTime() <= Date.now()) throw new Error('Choose a reminder time in the future.');

  const permission = await requireNotificationPermission();
  const canUseCriticalAlerts = permission.ios?.allowsCriticalAlerts === true;
  const alarmInterruption = canUseCriticalAlerts ? 'critical' : 'timeSensitive';

  return Notifications.scheduleNotificationAsync({
    content: {
      title: reminder.alert_type === 'alarm' ? `Reminder alarm · ${reminder.title}` : reminder.title,
      body: reminder.alert_type === 'alarm'
        ? 'This important Lifeaholic reminder is due now.'
        : 'Lifeaholic reminder',
      sound: reminder.alert_type === 'silent' ? false : 'default',
      interruptionLevel: reminder.alert_type === 'silent'
        ? 'passive'
        : reminder.alert_type === 'alarm'
          ? alarmInterruption
          : 'active',
      priority: reminder.alert_type === 'alarm'
        ? Notifications.AndroidNotificationPriority.MAX
        : reminder.alert_type === 'silent'
          ? Notifications.AndroidNotificationPriority.MIN
          : Notifications.AndroidNotificationPriority.DEFAULT,
      data: {
        reminderId: reminder.id,
        alertType: reminder.alert_type,
        route: '/reminders',
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: REMINDER_CHANNELS[reminder.alert_type],
    },
  });
}

export async function cancelReminderNotification(notificationId: string | null | undefined) {
  if (!notificationId || Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

type SchedulableTask = Pick<Task, 'id' | 'title' | 'date' | 'task_time' | 'reminder_offset'>;

export async function scheduleTaskNotification(task: SchedulableTask) {
  if (!task.task_time || task.reminder_offset === null) return null;
  const triggerDate = taskTriggerDate(task.date, task.task_time, task.reminder_offset);
  if (!triggerDate) throw new Error('Choose a valid task time and reminder.');
  if (triggerDate.getTime() <= Date.now()) {
    throw new Error('That reminder time has already passed. Choose a later task time or a shorter reminder.');
  }
  await requireNotificationPermission();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: task.title,
      body: task.reminder_offset === 0
        ? 'This task is due now.'
        : `This task starts in ${task.reminder_offset < 60 ? `${task.reminder_offset} minutes` : task.reminder_offset === 60 ? '1 hour' : `${task.reminder_offset / 60} hours`}.`,
      sound: 'default',
      interruptionLevel: 'timeSensitive',
      priority: Notifications.AndroidNotificationPriority.HIGH,
      data: { taskId: task.id, route: '/(tabs)/home', notificationType: 'task-reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: TASK_REMINDER_CHANNEL,
    },
  });
}

export async function cancelTaskNotification(notificationId: string | null | undefined) {
  await cancelReminderNotification(notificationId);
}

type SchedulableAlert = Pick<ScheduledAlert, 'id' | 'kind' | 'title' | 'date' | 'time' | 'deliveryMode'>;

export async function scheduleScheduledAlertNotification(alert: SchedulableAlert) {
  const triggerDate = scheduledAlertDate(alert.date, alert.time);
  if (!triggerDate) throw new Error('Use a valid date and 24-hour time.');
  if (triggerDate.getTime() <= Date.now()) throw new Error('Choose a time in the future.');
  const deliveryMode: ReminderDeliveryMode = alert.kind === 'alarm' ? 'alarm' : alert.deliveryMode;
  await requireNotificationPermission();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: alert.kind === 'alarm' ? `Alarm · ${alert.title}` : alert.title,
      body: alert.kind === 'alarm' ? 'Your Lifeaholic alarm is going off.' : 'Lifeaholic reminder',
      sound: deliveryMode === 'silent' ? false : 'default',
      interruptionLevel: deliveryMode === 'silent' ? 'passive' : deliveryMode === 'alarm' ? 'timeSensitive' : 'active',
      priority: deliveryMode === 'alarm'
        ? Notifications.AndroidNotificationPriority.MAX
        : deliveryMode === 'silent'
          ? Notifications.AndroidNotificationPriority.LOW
          : Notifications.AndroidNotificationPriority.HIGH,
      data: { scheduledAlertId: alert.id, kind: alert.kind, deliveryMode },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: REMINDER_CHANNELS[deliveryMode === 'notification' ? 'standard' : deliveryMode],
    },
  });
}

export async function cancelScheduledAlertNotification(notificationId: string | null | undefined) {
  await cancelReminderNotification(notificationId);
}

installNotificationHandler();
void initializeNotifications().catch(() => undefined);
