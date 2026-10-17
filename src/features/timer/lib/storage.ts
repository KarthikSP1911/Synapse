import { isEpoch, isObject } from "@/lib/records";
import { MAX_MINUTES, MIN_MINUTES, type TimerRecord } from "./types";

/**
 * What the study timer keeps on this device (nothing goes to the server):
 *  - `mathz:timer:state`: the absolute end time and the moment of the alert, tagged with the viewer it belongs to;
 *  - `mathz:timer:last`: the length chosen last time;
 *  - `mathz:timer:ui`: which side of the widget is showing and which corner it sits in.
 * localStorage can be empty, blocked or edited by hand, so every read is checked and every failure is silent.
 */

export const TIMER_STATE_KEY = "mathz:timer:state";
export const TIMER_LAST_KEY = "mathz:timer:last";
export const TIMER_UI_KEY = "mathz:timer:ui";

/** The part of `Storage` used here, so tests can pass a plain object. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStore(): KeyValue | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson(store: KeyValue | null, key: string): unknown {
  try {
    const text = store?.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function write(store: KeyValue | null, key: string, value: unknown | null): void {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full: the timer still works in this tab, it only cannot survive a refresh.
  }
}

// ---------------------------------------------------------------------------
// The running timer
// ---------------------------------------------------------------------------

const STATE_VERSION = 1;
/** An end time further away than this cannot come from the app (the longest timer is 240 minutes, plus extensions). */
const MAX_AHEAD_MS = 24 * 60 * 60 * 1000;

export interface StoredTimer extends TimerRecord {
  v: typeof STATE_VERSION;
  /** Who set the timer: `guest` or `user:<id>`. Another person on the same device must not inherit it. */
  viewer: string;
}

export function parseStoredTimer(raw: unknown, now: number): StoredTimer | null {
  if (!isObject(raw) || raw.v !== STATE_VERSION || typeof raw.viewer !== "string" || raw.viewer === "") return null;
  const { endsAt, alertedAt } = raw;
  if (!isEpoch(endsAt) || endsAt > now + MAX_AHEAD_MS) return null;
  if (alertedAt !== null && !isEpoch(alertedAt)) return null;
  return { v: STATE_VERSION, viewer: raw.viewer, endsAt, alertedAt };
}

/** The saved timer if it belongs to `viewer`; a timer saved by someone else is ignored (and left alone until a new one replaces it). */
export function loadTimer(viewer: string, now: number, store: KeyValue | null = browserStore()): TimerRecord | null {
  const stored = parseStoredTimer(readJson(store, TIMER_STATE_KEY), now);
  return stored && stored.viewer === viewer ? { endsAt: stored.endsAt, alertedAt: stored.alertedAt } : null;
}

export function saveTimer(viewer: string, timer: TimerRecord | null, store: KeyValue | null = browserStore()): void {
  if (timer === null) {
    // Only remove what is ours: a stop in this tab must not erase another person's timer.
    const current = readJson(store, TIMER_STATE_KEY);
    if (isObject(current) && current.viewer !== viewer) return;
    write(store, TIMER_STATE_KEY, null);
    return;
  }
  write(store, TIMER_STATE_KEY, { v: STATE_VERSION, viewer, endsAt: timer.endsAt, alertedAt: timer.alertedAt } satisfies StoredTimer);
}

// ---------------------------------------------------------------------------
// Last length
// ---------------------------------------------------------------------------

export function loadLastMinutes(store: KeyValue | null = browserStore()): number | null {
  const raw = readJson(store, TIMER_LAST_KEY);
  return typeof raw === "number" && Number.isInteger(raw) && raw >= MIN_MINUTES && raw <= MAX_MINUTES ? raw : null;
}

export function saveLastMinutes(minutes: number, store: KeyValue | null = browserStore()): void {
  write(store, TIMER_LAST_KEY, minutes);
}

// ---------------------------------------------------------------------------
// Widget presentation
// ---------------------------------------------------------------------------

export type Side = "front" | "back";
export type Corner = "tl" | "tr" | "bl" | "br";
export interface WidgetPrefs {
  side: Side;
  corner: Corner;
}

export const DEFAULT_PREFS: WidgetPrefs = { side: "front", corner: "br" };
const CORNERS: readonly Corner[] = ["tl", "tr", "bl", "br"];

export function parsePrefs(raw: unknown): WidgetPrefs {
  if (!isObject(raw)) return DEFAULT_PREFS;
  return {
    side: raw.side === "back" ? "back" : "front",
    corner: CORNERS.includes(raw.corner as Corner) ? (raw.corner as Corner) : DEFAULT_PREFS.corner,
  };
}

export function loadPrefs(store: KeyValue | null = browserStore()): WidgetPrefs {
  return parsePrefs(readJson(store, TIMER_UI_KEY));
}

export function savePrefs(prefs: WidgetPrefs, store: KeyValue | null = browserStore()): void {
  write(store, TIMER_UI_KEY, prefs);
}
