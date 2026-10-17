"use client";

import { useSyncExternalStore } from "react";
import { getPrefs, serverPrefs, setPrefs, subscribePrefs } from "@/features/timer/lib/prefs-store";
import type { WidgetPrefs } from "@/features/timer/lib/storage";

/** The widget's remembered side, corner and hidden state, shared with the header icon. */
export function useWidgetPrefs(): [WidgetPrefs, (next: WidgetPrefs) => void] {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, () => serverPrefs);
  return [prefs, setPrefs];
}
