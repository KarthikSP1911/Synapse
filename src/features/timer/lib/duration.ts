import { MAX_MINUTES, MIN_MINUTES } from "./types";

export type MinutesResult = { ok: true; minutes: number } | { ok: false; reason: string };

/** A custom length typed by the user: whole minutes from 1 to 240. */
export function parseMinutes(text: string): MinutesResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, reason: "Enter a number of minutes." };
  if (!/^\d+$/.test(trimmed)) return { ok: false, reason: "Use whole minutes, like 25." };
  const minutes = Number(trimmed);
  if (minutes < MIN_MINUTES || minutes > MAX_MINUTES) return { ok: false, reason: `Choose between ${MIN_MINUTES} and ${MAX_MINUTES} minutes.` };
  return { ok: true, minutes };
}

const two = (n: number) => String(n).padStart(2, "0");

function clock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** Time left, rounded up so the display never reads 0:00 before the timer has actually expired. */
export const formatRemaining = (ms: number): string => clock(Math.max(0, Math.ceil(ms / 1000)));

/** Time past zero, as the front of the widget shows it: "+1:20 over". */
export const formatOver = (ms: number): string => `+${clock(Math.max(0, Math.floor(ms / 1000)))} over`;
