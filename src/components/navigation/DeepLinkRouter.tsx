import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';

export function DeepLinkRouter() {
  const router = useRouter();
  const handle = useCallback((url: string | null) => {
    if (!url?.startsWith('lifeaholic://')) return;
    const parsed = Linking.parse(url);
    const host = parsed.hostname ?? '';
    const path = parsed.path ?? '';
    if (host === 'finance' && path === 'add-expense') {
      router.replace({ pathname: '/(tabs)/finance', params: { compose: 'expense' } });
    } else if (host === 'matrix') {
      const taskId = typeof parsed.queryParams?.taskId === 'string' ? parsed.queryParams.taskId : undefined;
      router.replace({ pathname: '/(tabs)/matrix', params: taskId ? { taskId } : {} });
    } else if (host === 'focus' && path === 'analytics') {
      router.replace('/focus-analytics');
    } else if (host === 'focus') {
      const startSubjectId = typeof parsed.queryParams?.startSubjectId === 'string' ? parsed.queryParams.startSubjectId : undefined;
      router.replace({ pathname: '/(tabs)/focus', params: startSubjectId ? { startSubjectId } : {} });
    } else if (host === 'calendar') {
      router.replace('/(tabs)/calendar');
    } else if (host === 'home') {
      const compose = parsed.queryParams?.compose === 'd-day' ? 'd-day' : undefined;
      const taskId = typeof parsed.queryParams?.taskId === 'string' ? parsed.queryParams.taskId : undefined;
      router.replace({ pathname: '/(tabs)/home', params: { ...(compose ? { compose } : {}), ...(taskId ? { taskId } : {}) } });
    }
  }, [router]);

  useEffect(() => {
    void Linking.getInitialURL().then(handle).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => subscription.remove();
  }, [handle]);

  return null;
}
