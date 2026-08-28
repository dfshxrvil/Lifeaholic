import type { LifeaholicWidgetSnapshot, WidgetFocusState } from '../../widgets/LifeaholicSharedData';

export type WidgetSuiteContent = Pick<
  LifeaholicWidgetSnapshot,
  'tasks' | 'dDay' | 'events' | 'subjects' | 'analytics'
>;

export const emptyWidgetFocus: WidgetFocusState = { mode: 'idle', accumulatedSeconds: 0 };

export async function readWidgetSnapshot(): Promise<LifeaholicWidgetSnapshot | null> {
  return null;
}

export async function updateWidgetContent(_content: WidgetSuiteContent): Promise<void> {}
export async function updateWidgetFocus(_focus: WidgetFocusState): Promise<void> {}
export async function acknowledgeWidgetActions(_actionIds: readonly string[]): Promise<void> {}
