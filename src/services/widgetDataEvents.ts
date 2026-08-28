type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyWidgetDataChanged() {
  for (const listener of listeners) listener();
}

export function subscribeWidgetDataChanged(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
