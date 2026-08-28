import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef } from 'react';

const CHECKMARK_COMPLETION_MS = 180;

export function useCompletionFeedback() {
  const player = useAudioPlayer(require('../../assets/sounds/chime.wav'), { downloadFirst: true });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);
  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      void player.seekTo(0).then(() => player.play()).catch(() => undefined);
    }, CHECKMARK_COMPLETION_MS);
  }, [player]);
}
