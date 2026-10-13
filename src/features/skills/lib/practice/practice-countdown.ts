import { buildTimeline, runTimeline, type Timers, type TimelineEvent } from "@/features/games/mindsprint/lib/timeline";

/**
 * The countdown before a practice session: 3, 2, 1, then "GO". It is the MindSprint schedule (`COUNT_STEP_MS`,
 * `GO_MS`) with no flashes, so the "answer" event lands exactly when the signal has had its time on screen.
 */

export type CountdownStep = { kind: "count"; value: number } | { kind: "go" } | { kind: "done" };

export const countdownEvents = (): TimelineEvent[] => buildTimeline({ flashes: 0, displayMs: 0, gapMs: 0 });

/** How long the countdown and the signal last, in milliseconds. */
export const countdownLength = (): number => countdownEvents().at(-1)?.at ?? 0;

/**
 * Plays the countdown, reporting each step, and returns a function that cancels whatever has not fired yet.
 * The `done` step is the last; after cancelling, it never fires.
 */
export function runCountdown(onStep: (step: CountdownStep) => void, timers?: Timers): () => void {
  return runTimeline(
    countdownEvents(),
    (event) => {
      if (event.kind === "count") onStep({ kind: "count", value: event.value });
      else if (event.kind === "go") onStep({ kind: "go" });
      else if (event.kind === "answer") onStep({ kind: "done" });
    },
    timers
  );
}

/**
 * Counts down and only then calls `start`. Whatever `start` creates (a session) does not exist until the
 * countdown has finished, so cancelling at any point before that leaves nothing behind, and a timed session's
 * clock begins with the first question.
 */
export function startAfterCountdown(onStep: (step: CountdownStep) => void, start: () => void, timers?: Timers): () => void {
  return runCountdown((step) => {
    onStep(step);
    if (step.kind === "done") start();
  }, timers);
}
