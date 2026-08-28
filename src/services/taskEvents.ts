const listeners = new Set<() => void>();
export function notifyTasksChanged() { listeners.forEach((listener) => listener()); }
export function subscribeTasksChanged(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
