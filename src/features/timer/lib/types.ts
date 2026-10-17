/** Study timer: the shapes and limits shared by the state machine, the controller and the widget. */

/** Whole minutes only. */
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 240;
export const PRESET_MINUTES = [5, 10, 15, 30, 60] as const;
export const DEFAULT_MINUTES = 15;
/** What "+5 min" adds. */
export const EXTEND_MS = 5 * 60 * 1000;
/** Endless sessions and 2048 have no natural end: after expiry they get this long before the alert. */
export const GRACE_MS = 3 * 60 * 1000;
/** How long the "Time's up" banner stays before it dismisses itself and leaves the badge. */
export const ALERT_MS = 15 * 1000;

/** What is persisted: the absolute end time (so a refresh, a closed tab and a background tab cannot drift) and when the alert fired. */
export interface TimerRecord {
  endsAt: number;
  alertedAt: number | null;
}

/** What the screen in front of the user is doing, as far as the timer cares. `null` activity = idle. */
export interface ActivityInfo {
  /** No natural end (endless practice, 2048): gets the grace period. */
  endless: boolean;
  /** A paused session or puzzle is a safe point, so the alert may fire. */
  paused: boolean;
}

export interface MachineState {
  timer: TimerRecord | null;
  activity: ActivityInfo | null;
}

export type TimerEvent =
  | { kind: "start"; minutes: number }
  | { kind: "extend" }
  | { kind: "stop" }
  | { kind: "activity"; activity: ActivityInfo | null }
  | { kind: "tick" }
  /** A record read from this device (page load, or another tab changed it). */
  | { kind: "load"; timer: TimerRecord | null };

export type TimerEffect = { kind: "alert" };

/** `off`: no timer. `waiting`: past zero but a game is being finished first. `alerting`: the banner is up. `overrun`: banner gone, badge shown. */
export type Phase = "off" | "running" | "waiting" | "alerting" | "overrun";

export interface TimerView {
  phase: Phase;
  /** Time left; 0 once expired. */
  remainingMs: number;
  /** Time since expiry; 0 before. */
  overMs: number;
  /** Time left on the banner while `alerting`; 0 otherwise. */
  bannerLeftMs: number;
}
