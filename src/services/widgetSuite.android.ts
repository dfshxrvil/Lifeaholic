import { NativeModules } from 'react-native';
import type {
  LifeaholicWidgetSnapshot,
  WidgetFocusState,
} from '../../widgets/LifeaholicSharedData';
import type { WidgetSuiteContent } from '@/services/widgetSuite';

type AndroidWidgetModuleContract = {
  readSnapshot: () => Promise<string>;
  writeSnapshot: (snapshotJson: string) => Promise<void>;
  acknowledgeActions: (actionIdsJson: string) => Promise<void>;
};

const nativeModule = NativeModules.AndroidWidgetModule as AndroidWidgetModuleContract | undefined;
const emptyWidgetFocus: WidgetFocusState = { mode: 'idle', accumulatedSeconds: 0 };

function safeSnapshot(value?: Partial<LifeaholicWidgetSnapshot>): LifeaholicWidgetSnapshot {
  return {
    version: 1,
    updatedAt: Number.isFinite(value?.updatedAt) ? value!.updatedAt! : Date.now() / 1000,
    tasks: Array.isArray(value?.tasks) ? value.tasks.slice(0, 32) : [],
    dDay: value?.dDay,
    events: Array.isArray(value?.events) ? value.events.slice(0, 16) : [],
    subjects: Array.isArray(value?.subjects) ? value.subjects.slice(0, 12) : [],
    focus: value?.focus ?? emptyWidgetFocus,
    analytics: Array.isArray(value?.analytics) ? value.analytics.slice(0, 12) : [],
    pendingActions: Array.isArray(value?.pendingActions) ? value.pendingActions.slice(-64) : [],
  };
}

export async function readWidgetSnapshot(): Promise<LifeaholicWidgetSnapshot | null> {
  if (!nativeModule) return null;
  try {
    return safeSnapshot(JSON.parse(await nativeModule.readSnapshot()) as LifeaholicWidgetSnapshot);
  } catch {
    return null;
  }
}

async function write(snapshot: LifeaholicWidgetSnapshot) {
  if (!nativeModule) return;
  await nativeModule.writeSnapshot(JSON.stringify(safeSnapshot({ ...snapshot, updatedAt: Date.now() / 1000 })));
}

export async function updateWidgetContent(content: WidgetSuiteContent): Promise<void> {
  const current = safeSnapshot((await readWidgetSnapshot()) ?? undefined);
  await write({ ...current, ...content, focus: current.focus, pendingActions: current.pendingActions });
}

export async function updateWidgetFocus(focus: WidgetFocusState): Promise<void> {
  const current = safeSnapshot((await readWidgetSnapshot()) ?? undefined);
  await write({ ...current, focus, pendingActions: current.pendingActions });
}

export async function acknowledgeWidgetActions(actionIds: readonly string[]): Promise<void> {
  if (!actionIds.length || !nativeModule) return;
  await nativeModule.acknowledgeActions(JSON.stringify(actionIds));
}
