import { Text } from '@expo/ui/swift-ui';
import { createWidget } from 'expo-widgets';

export type WidgetTaskItem = {
  id: string;
  title: string;
  priority: 'red' | 'yellow' | 'blue' | 'green';
  isCompleted: boolean;
};

export type WidgetDDayItem = { title: string; eventDate: string; daysRemaining: number };
export type WidgetEventItem = { id: string; title: string; startAt: number; endAt: number };
export type WidgetSubjectItem = { id: string; name: string; todaySeconds: number };
export type WidgetFocusState = {
  mode: 'idle' | 'focus' | 'paused' | 'break';
  subjectId?: string;
  subjectName?: string;
  startedAt?: number;
  accumulatedSeconds: number;
};
export type WidgetAnalyticsItem = { id: string; name: string; seconds: number; colorHex: string };
export type WidgetPendingAction = {
  id: string;
  type: 'completeTask' | 'saveFocusSession';
  taskId?: string;
  subjectId?: string;
  startedAt?: number;
  endedAt?: number;
  createdAt: number;
};

export type LifeaholicWidgetSnapshot = {
  version: 1;
  updatedAt: number;
  tasks: WidgetTaskItem[];
  dDay?: WidgetDDayItem;
  events: WidgetEventItem[];
  subjects: WidgetSubjectItem[];
  focus: WidgetFocusState;
  analytics: WidgetAnalyticsItem[];
  pendingActions: WidgetPendingAction[];
};

const SharedDataView = () => {
  'widget';
  // This widget is a storage bridge only and is intentionally not registered
  // in the WidgetBundle. Native WidgetKit views consume its App Group timeline.
  return <Text>Lifeaholic</Text>;
};

export const LifeaholicSharedData = createWidget<LifeaholicWidgetSnapshot>(
  'LifeaholicSharedData',
  SharedDataView,
);
