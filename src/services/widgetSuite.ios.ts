import type {
  LifeaholicWidgetSnapshot,
  WidgetFocusState,
} from '../../widgets/LifeaholicSharedData';
import type { WidgetSuiteContent } from '@/services/widgetSuite';
import { NativeModules } from 'react-native';

let hasReportedUnavailableWidget = false;
const emptyWidgetFocus: WidgetFocusState = { mode: 'idle', accumulatedSeconds: 0 };

type NativeWidgetModule = {
  readWidgetSnapshot(): Promise<LifeaholicWidgetSnapshot | null>;
  updateWidgetSnapshot(snapshot: LifeaholicWidgetSnapshot): Promise<void>;
};

function nativeWidgetModule(): NativeWidgetModule {
  const widgetModule = NativeModules.WidgetModule as NativeWidgetModule | undefined;
  if (!widgetModule?.readWidgetSnapshot || !widgetModule?.updateWidgetSnapshot) {
    throw new Error('WidgetModule is missing from this native build.');
  }
  return widgetModule;
}

function safeSnapshot(value: LifeaholicWidgetSnapshot | undefined): LifeaholicWidgetSnapshot {
  return {
    version: 1,
    updatedAt: Number.isFinite(value?.updatedAt) ? value!.updatedAt : Date.now() / 1000,
    tasks: Array.isArray(value?.tasks) ? value.tasks.slice(0, 32) : [],
    dDay: value?.dDay,
    events: Array.isArray(value?.events) ? value.events.slice(0, 16) : [],
    subjects: Array.isArray(value?.subjects) ? value.subjects.slice(0, 12) : [],
    focus: value?.focus ?? emptyWidgetFocus,
    analytics: Array.isArray(value?.analytics) ? value.analytics.slice(0, 12) : [],
    pendingActions: Array.isArray(value?.pendingActions) ? value.pendingActions.slice(-64) : [],
  };
}

async function reportUnavailable(cause: unknown) {
  if (__DEV__ && !hasReportedUnavailableWidget) {
    hasReportedUnavailableWidget = true;
    console.info('Lifeaholic widget suite is unavailable in this native build.', cause);
  }
}

export async function readWidgetSnapshot(): Promise<LifeaholicWidgetSnapshot | null> {
  try {
    const snapshot = await nativeWidgetModule().readWidgetSnapshot();
    return snapshot ? safeSnapshot(snapshot) : null;
  } catch (cause) {
    await reportUnavailable(cause);
    return null;
  }
}

async function write(snapshot: LifeaholicWidgetSnapshot) {
  await nativeWidgetModule().updateWidgetSnapshot(
    safeSnapshot({ ...snapshot, updatedAt: Date.now() / 1000 }),
  );
}

export async function updateWidgetContent(content: WidgetSuiteContent): Promise<void> {
  try {
    const current = safeSnapshot((await readWidgetSnapshot()) ?? undefined);
    await write({ ...current, ...content, pendingActions: current.pendingActions, focus: current.focus });
  } catch (cause) {
    await reportUnavailable(cause);
  }
}

export async function updateWidgetFocus(focus: WidgetFocusState): Promise<void> {
  try {
    const current = safeSnapshot((await readWidgetSnapshot()) ?? undefined);
    await write({ ...current, focus, pendingActions: current.pendingActions });
  } catch (cause) {
    await reportUnavailable(cause);
  }
}

export async function acknowledgeWidgetActions(actionIds: readonly string[]): Promise<void> {
  if (!actionIds.length) return;
  try {
    const current = await readWidgetSnapshot();
    if (!current) return;
    const acknowledged = new Set(actionIds);
    await write({ ...current, pendingActions: current.pendingActions.filter((action) => !acknowledged.has(action.id)) });
  } catch (cause) {
    await reportUnavailable(cause);
  }
}
