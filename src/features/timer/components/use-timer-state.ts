"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Snapshot } from "@/features/timer/lib/controller";
import { viewOf } from "@/features/timer/lib/machine";
import { studyTimer } from "@/features/timer/lib/store";
import type { TimerView } from "@/features/timer/lib/types";

const EMPTY: Snapshot = { timer: null, activity: null };

/** The shared timer and the activity in front of the user. The server renders it as "no timer". */
export function useTimerSnapshot(): Snapshot {
  return useSyncExternalStore(
    (listener) => studyTimer().subscribe(listener),
    () => studyTimer().getSnapshot(),
    () => EMPTY
  );
}

/** What to draw right now. Re-reads the clock four times a second while a timer exists; the state itself only changes on events. */
export function useTimerView(snapshot: Snapshot): TimerView {
  const [now, setNow] = useState(() => Date.now());
  const running = snapshot.timer !== null;

  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [running]);

  // A render can land a moment before the next tick; never show a time earlier than the alert it follows.
  const at = Math.max(now, snapshot.timer?.alertedAt ?? 0);
  return viewOf(snapshot, at);
}
