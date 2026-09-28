import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  cancelScheduledAlertNotification,
  scheduleScheduledAlertNotification,
} from '@/services/notifications';
import type {
  ScheduledAlert,
  ScheduledAlertDraft,
  ScheduledAlertKind,
} from '@/types/scheduledAlert';
import { scheduledAlertTimestamp } from '@/utils/scheduledAlertDate';

const STORAGE_PREFIX = 'lifeaholic.scheduled-alerts.v1';
const storageKey = (userId: string) => `${STORAGE_PREFIX}:${userId}`;
const schedule = scheduleScheduledAlertNotification;
const cancel = (identifier: string | null | undefined) => cancelScheduledAlertNotification(identifier).catch(() => undefined);

function isAlert(value: unknown): value is ScheduledAlert {
  if (!value || typeof value !== 'object') return false;
  const alert = value as Partial<ScheduledAlert>;
  return typeof alert.id === 'string'
    && typeof alert.userId === 'string'
    && (alert.kind === 'reminder' || alert.kind === 'alarm')
    && typeof alert.title === 'string'
    && typeof alert.date === 'string'
    && typeof alert.time === 'string'
    && (alert.deliveryMode === 'silent' || alert.deliveryMode === 'notification' || alert.deliveryMode === 'alarm')
    && typeof alert.enabled === 'boolean';
}

async function readAll(userId: string): Promise<ScheduledAlert[]> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isAlert) : [];
  } catch {
    return [];
  }
}

async function writeAll(userId: string, alerts: ScheduledAlert[]) {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(alerts));
}

export async function listScheduledAlerts(userId: string, kind: ScheduledAlertKind) {
  return (await readAll(userId))
    .filter((alert) => alert.kind === kind)
    .sort((left, right) => scheduledAlertTimestamp(left) - scheduledAlertTimestamp(right));
}

export async function saveScheduledAlert(userId: string, draft: ScheduledAlertDraft, existing?: ScheduledAlert | null) {
  const title = draft.title.trim();
  if (!title) throw new Error(`Name what this ${draft.kind} is for.`);
  const now = new Date().toISOString();
  const id = existing?.id ?? Crypto.randomUUID();
  const candidate: ScheduledAlert = {
    id,
    userId,
    kind: draft.kind,
    title,
    date: draft.date.trim(),
    time: draft.time.trim(),
    deliveryMode: draft.kind === 'alarm' ? 'alarm' : draft.deliveryMode,
    enabled: true,
    notificationIdentifier: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  candidate.notificationIdentifier = await schedule(candidate);
  const alerts = await readAll(userId);
  const next = existing
    ? alerts.map((item) => item.id === existing.id ? candidate : item)
    : [...alerts, candidate];
  try {
    await writeAll(userId, next);
    await cancel(existing?.notificationIdentifier);
    return candidate;
  } catch (cause) {
    await cancel(candidate.notificationIdentifier);
    throw cause;
  }
}

export async function setScheduledAlertEnabled(userId: string, alert: ScheduledAlert, enabled: boolean) {
  const alerts = await readAll(userId);
  let notificationIdentifier: string | null = null;
  if (enabled) notificationIdentifier = await schedule(alert);
  else await cancel(alert.notificationIdentifier);
  const updated = { ...alert, enabled, notificationIdentifier, updatedAt: new Date().toISOString() };
  try {
    await writeAll(userId, alerts.map((item) => item.id === alert.id ? updated : item));
    return updated;
  } catch (cause) {
    if (enabled) await cancel(notificationIdentifier);
    throw cause;
  }
}

export async function deleteScheduledAlert(userId: string, alert: ScheduledAlert) {
  await cancel(alert.notificationIdentifier);
  const alerts = await readAll(userId);
  await writeAll(userId, alerts.filter((item) => item.id !== alert.id));
}

export async function disableScheduledAlertsForUser(userId: string) {
  const alerts = await readAll(userId);
  await Promise.all(alerts.map((alert) => cancel(alert.notificationIdentifier)));
  await writeAll(userId, alerts.map((alert) => ({
    ...alert,
    enabled: false,
    notificationIdentifier: null,
    updatedAt: new Date().toISOString(),
  })));
}
