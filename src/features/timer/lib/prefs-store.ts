import { DEFAULT_PREFS, loadPrefs, savePrefs, type WidgetPrefs } from "./storage";

/**
 * The widget's remembered presentation (side, corner, hidden) as one shared value, so the floating widget and the header
 * icon it collapses into always agree. Saved on every change; read from the device the first time it is needed in the browser.
 */

let current: WidgetPrefs | null = null;
const listeners = new Set<() => void>();

export function getPrefs(): WidgetPrefs {
  current ??= loadPrefs();
  return current;
}

export function setPrefs(next: WidgetPrefs): void {
  current = next;
  savePrefs(next);
  for (const listener of [...listeners]) listener();
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What the server renders. */
export const serverPrefs: WidgetPrefs = DEFAULT_PREFS;
