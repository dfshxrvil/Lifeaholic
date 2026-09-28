import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/** Back when possible; direct links and reloads safely return to Home. */
export function useSafeBack() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  }, [router]);
}
