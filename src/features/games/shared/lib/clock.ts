/**
 * The playing clock of a puzzle game, as data: time banked in `elapsedMs` plus the stretch since `resumedAt`.
 * Time while paused, or while the page was closed, is never counted. Pure, so it is testable without a browser.
 */

export interface Clocked {
  status: "playing" | "paused" | "completed";
  /** Playing time banked before `resumedAt`. */
  elapsedMs: number;
  /** When the clock last started running; null while paused or finished. */
  resumedAt: number | null;
}

export const elapsedAt = (state: Pick<Clocked, "elapsedMs" | "resumedAt">, now: number): number =>
  state.elapsedMs + (state.resumedAt === null ? 0 : Math.max(0, now - state.resumedAt));

export function pauseClock<T extends Clocked>(state: T, now: number): T {
  if (state.status !== "playing") return state;
  return { ...state, status: "paused", elapsedMs: elapsedAt(state, now), resumedAt: null };
}

export function resumeClock<T extends Clocked>(state: T, now: number): T {
  if (state.status !== "paused") return state;
  return { ...state, status: "playing", resumedAt: now };
}

/** The state as it should be written to storage: a running clock is banked and the game comes back paused. */
export const freezeClock = <T extends Clocked>(state: T, now: number): T => (state.status === "playing" ? pauseClock(state, now) : state);

/** Ends the clock for a finished game: banks the time and records when it ended. */
export function stopClock<T extends Clocked & { endedAt: number | null }>(state: T, now: number): T {
  return { ...state, status: "completed", elapsedMs: elapsedAt(state, now), resumedAt: null, endedAt: now };
}
