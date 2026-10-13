/**
 * The schedule of one round, as data. Countdown ticks, the start signal, every flash and the answer box all
 * come from the same list of times, so the numbers on screen and the sounds cannot drift apart.
 */

export const COUNTDOWN_FROM = 3;
export const COUNT_STEP_MS = 1000;
/** How long the "GO" signal shows before the first number. */
export const GO_MS = 600;

export type TimelineEvent =
  | { at: number; kind: "count"; value: number }
  | { at: number; kind: "go" }
  | { at: number; kind: "show"; index: number }
  | { at: number; kind: "hide"; index: number }
  | { at: number; kind: "answer" };

/** How long a round shows its items: how many, for how long each, and the gap between them. */
export interface TimelineShape {
  flashes: number;
  displayMs: number;
  gapMs: number;
}

/**
 * Times are milliseconds from the moment the round starts. `flashes` is how many items are shown; Number Recall
 * and the practice countdown reuse this schedule with their own countdown length.
 */
export function buildTimeline(config: TimelineShape, countdownFrom: number = COUNTDOWN_FROM): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (let i = 0; i < countdownFrom; i++) events.push({ at: i * COUNT_STEP_MS, kind: "count", value: countdownFrom - i });
  const goAt = countdownFrom * COUNT_STEP_MS;
  events.push({ at: goAt, kind: "go" });

  const firstShow = goAt + GO_MS;
  let hideAt = firstShow;
  for (let i = 0; i < config.flashes; i++) {
    const showAt = firstShow + i * (config.displayMs + config.gapMs);
    hideAt = showAt + config.displayMs;
    events.push({ at: showAt, kind: "show", index: i });
    events.push({ at: hideAt, kind: "hide", index: i });
  }
  // The answer box opens as the last number disappears, and never before.
  events.push({ at: hideAt, kind: "answer" });
  return events;
}

/** Total length of the countdown, the signal and the flashes. */
export const timelineLength = (events: readonly TimelineEvent[]): number => events[events.length - 1]?.at ?? 0;

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const browserTimers = (): Timers => ({
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});

/**
 * Plays the events at their times and returns a function that cancels whatever has not fired yet. Every event is
 * scheduled up front against the same start, rather than each one scheduling the next, so a late timer delays
 * only itself and the lateness never accumulates.
 */
export function runTimeline(events: readonly TimelineEvent[], onEvent: (event: TimelineEvent) => void, timers: Timers = browserTimers()): () => void {
  // One delay per event, all measured from now: events that share a time get the same delay, which timers fire in the order they were set.
  const handles = events.map((event) => timers.setTimeout(() => onEvent(event), event.at));
  return () => handles.forEach((handle) => timers.clearTimeout(handle));
}
