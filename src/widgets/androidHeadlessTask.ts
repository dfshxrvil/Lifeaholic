import { AppRegistry, Platform } from 'react-native';
import { acknowledgeWidgetActions } from '@/services/widgetSuite';
import * as tasksService from '@/services/tasks';

type CompleteTaskPayload = { taskId?: string; actionId?: string };

if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('LifeaholicWidgetTaskSync', () => async (payload: CompleteTaskPayload) => {
    if (!payload.taskId || !payload.actionId) return;
    // Only acknowledge after Supabase accepts the mutation. If authentication
    // or networking is unavailable, foreground synchronization retries it.
    await tasksService.setTaskCompleted(payload.taskId, true);
    await acknowledgeWidgetActions([payload.actionId]);
  });
}
