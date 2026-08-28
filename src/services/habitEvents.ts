type HabitCompletionChange = { habitId: string; date: string; completed: boolean };

const completionListeners = new Set<(change: HabitCompletionChange) => void>();

export function notifyHabitCompletionChanged(change: HabitCompletionChange) {
  completionListeners.forEach((listener) => listener(change));
}

export function subscribeHabitCompletionChanged(listener: (change: HabitCompletionChange) => void) {
  completionListeners.add(listener);
  return () => { completionListeners.delete(listener); };
}
