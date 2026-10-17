import { ALERT_MS, EXTEND_MS, GRACE_MS, MAX_MINUTES, MIN_MINUTES, type MachineState, type TimerEffect, type TimerEvent, type TimerView } from "./types";

/**
 * The study timer's rules as pure functions of (state, event, now). Nothing here reads a clock or touches storage, so
 * the controller can drive it with a real or a fake clock. Time only ever enters as `now`, and the only thing kept is the
 * absolute end time, which is why a refresh or a throttled background tab cannot make the timer drift.
 */

export const OFF: MachineState = { timer: null, activity: null };

/** Does the current activity make the alert wait? Idle, paused, or an endless one past its grace period do not. */
function blocks(state: MachineState, endsAt: number, now: number): boolean {
  const activity = state.activity;
  if (!activity || activity.paused) return false;
  return !activity.endless || now < endsAt + GRACE_MS;
}

/** Fires the alert once: past zero, not yet alerted, and nothing in front of the user that has to finish first. */
function settle(state: MachineState, now: number): { state: MachineState; effects: TimerEffect[] } {
  const timer = state.timer;
  if (timer && timer.alertedAt === null && now >= timer.endsAt && !blocks(state, timer.endsAt, now)) {
    return { state: { ...state, timer: { ...timer, alertedAt: now } }, effects: [{ kind: "alert" }] };
  }
  return { state, effects: [] };
}

export function step(state: MachineState, event: TimerEvent, now: number): { state: MachineState; effects: TimerEffect[] } {
  let next = state;
  switch (event.kind) {
    case "start":
      if (!Number.isInteger(event.minutes) || event.minutes < MIN_MINUTES || event.minutes > MAX_MINUTES) return { state, effects: [] };
      next = { ...state, timer: { endsAt: now + event.minutes * 60 * 1000, alertedAt: null } };
      break;
    case "extend":
      // Only before the alert: afterwards it would be a snooze.
      if (!state.timer || state.timer.alertedAt !== null) return { state, effects: [] };
      next = { ...state, timer: { ...state.timer, endsAt: state.timer.endsAt + EXTEND_MS } };
      break;
    case "stop":
      next = { ...state, timer: null };
      break;
    case "activity":
      next = { ...state, activity: event.activity };
      break;
    case "load":
      next = { ...state, timer: event.timer };
      break;
    case "tick":
      break;
  }
  return settle(next, now);
}

/** What to show at `now`. */
export function viewOf(state: MachineState, now: number): TimerView {
  const timer = state.timer;
  if (!timer) return { phase: "off", remainingMs: 0, overMs: 0, bannerLeftMs: 0 };
  if (now < timer.endsAt) return { phase: "running", remainingMs: timer.endsAt - now, overMs: 0, bannerLeftMs: 0 };
  const overMs = now - timer.endsAt;
  if (timer.alertedAt === null) return { phase: "waiting", remainingMs: 0, overMs, bannerLeftMs: 0 };
  const bannerLeftMs = timer.alertedAt + ALERT_MS - now;
  return bannerLeftMs > 0 ? { phase: "alerting", remainingMs: 0, overMs, bannerLeftMs } : { phase: "overrun", remainingMs: 0, overMs, bannerLeftMs: 0 };
}

/** The next moment the state can change by itself (a tick is needed then), or null when only an event can change it. */
export function nextDeadline(state: MachineState, now: number): number | null {
  const timer = state.timer;
  if (!timer || timer.alertedAt !== null) return null;
  if (now < timer.endsAt) return timer.endsAt;
  // Past zero and waiting: only an endless activity's grace period runs out by itself.
  const graceEnd = timer.endsAt + GRACE_MS;
  return state.activity && !state.activity.paused && state.activity.endless && now < graceEnd ? graceEnd : null;
}
