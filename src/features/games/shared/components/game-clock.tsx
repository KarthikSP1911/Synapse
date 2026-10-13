"use client";

import { useEffect, useState } from "react";
import { elapsedAt, type Clocked } from "@/features/games/shared/lib/clock";
import { formatTime } from "@/features/games/shared/lib/puzzle-session";

/** Re-renders once a second while `active`, returning the current time. Kept out of the board so it never repaints for a tick. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active]);
  return now;
}

/** The playing time of a game, ticking while it runs. */
export function Clock({ game }: { game: Clocked }) {
  const now = useNow(game.status === "playing");
  return <span className="font-mono tabular-nums">{formatTime(elapsedAt(game, now))}</span>;
}

/** True when the keyboard event came from a field the player is typing in. */
export const isTextEntry = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
};
