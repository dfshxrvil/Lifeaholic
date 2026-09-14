type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyFinanceChanged() {
  for (const listener of listeners) listener();
}

export function subscribeToFinanceChanges(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
