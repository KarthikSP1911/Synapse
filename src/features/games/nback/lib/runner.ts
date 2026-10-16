import { TrialClock } from "./clock";
import { livesAfter, evaluateTrial } from "./scoring";
import { MIN_SCOREABLE, STREAM_BIT, type NBackConfig, type SessionOutcome, type StreamId, type Trial, type TrialEvaluation } from "./types";

/**
 * Runs the trials of one session: lights each stimulus on schedule, takes the player's responses, evaluates each
 * trial when its window closes and ends the session when the trials run out or the last life is lost. It knows
 * nothing about React. The browser supplies the host (clock and timers); the tests supply a fake one.
 *
 * Timing: every event has an absolute time on the trial clock (`clock.ts`), and a timer only wakes the runner up;
 * what is due is decided by comparing the clock, so a timer that fires late runs several events in order and never
 * pushes later ones back. A response is placed in a trial by its own timestamp, not by the moment it was handled.
 *
 * A trial is evaluated exactly once, when its window closes. A response for a trial that has been evaluated is
 * refused, so a trial can never cost a life twice and a late press can never count for the next trial.
 */

export interface RunnerHost {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** The real clock and timers. `performance.now()` is monotonic and shares its origin with event timestamps. */
export const browserHost: RunnerHost = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** What the board should show: which trial is current and whether its stimulus is lit right now. */
export interface TrialView {
  trial: number | null;
  stimulusVisible: boolean;
}

export type ResponseStatus = "recorded" | "duplicate" | "late" | "ignored";

export interface RunnerResult {
  outcome: SessionOutcome;
  /** One mask per trial played. */
  responses: number[];
  /** Active time spent in trials: the length of the trials played, pauses excluded. */
  durationMs: number;
}

export interface RunnerListener {
  onView?(view: TrialView): void;
  /** A response was recorded. `offsetMs` is how far into the trial's window it came. */
  onResponse?(info: { trial: number; stream: StreamId; offsetMs: number }): void;
  /** A trial's window closed. `livesRemaining` already includes any life it cost. */
  onEvaluated?(evaluation: TrialEvaluation, livesRemaining: number): void;
  onFinish?(result: RunnerResult): void;
}

export type RunnerState = "idle" | "running" | "paused" | "finished" | "quit";

const EVENTS_PER_TRIAL = 3; // stimulus on, stimulus off, window closes

/** A response timestamp more than this far from the host's clock is not from the same clock; the moment it was handled is used instead. */
const MAX_TIMESTAMP_SKEW_MS = 2000;

export class SessionRunner {
  readonly clock: TrialClock;
  private state: RunnerState = "idle";
  private cursor = 0;
  private timer: unknown = null;
  private readonly masks: number[];
  private readonly evaluations: TrialEvaluation[] = [];
  private readonly log: { trial: number; stream: StreamId; offsetMs: number }[] = [];
  private view: TrialView = { trial: null, stimulusVisible: false };

  constructor(
    private readonly config: Pick<NBackConfig, "n" | "streams" | "stimulusMs" | "trialMs">,
    private readonly trials: readonly Trial[],
    private readonly host: RunnerHost,
    private readonly listener: RunnerListener = {}
  ) {
    this.clock = new TrialClock(config.trialMs, config.stimulusMs, trials.length);
    this.masks = trials.map(() => 0);
  }

  get status(): RunnerState {
    return this.state;
  }
  get livesRemaining(): number {
    return livesAfter(this.evaluations);
  }
  get evaluated(): readonly TrialEvaluation[] {
    return this.evaluations;
  }
  get responseLog(): readonly { trial: number; stream: StreamId; offsetMs: number }[] {
    return this.log;
  }
  /** The mask of streams marked so far in trial `index`. */
  maskOf(index: number): number {
    return this.masks[index] ?? 0;
  }
  get currentView(): TrialView {
    return this.view;
  }

  /** The first stimulus is lit now. */
  start(): void {
    if (this.state !== "idle") return;
    this.state = "running";
    this.clock.start(this.host.now());
    this.advance();
  }

  pause(): void {
    if (this.state !== "running") return;
    // Anything due before the pause still happens before it, so a trial that had already closed is evaluated.
    this.runDueEvents();
    if (this.state !== "running") return;
    this.state = "paused";
    this.clock.pause(this.host.now());
    this.cancelTimer();
    this.setView({ trial: this.view.trial, stimulusVisible: false });
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.state = "running";
    this.clock.resume(this.host.now());
    const elapsed = this.clock.elapsedAt(this.host.now());
    if (elapsed !== null) this.setView({ trial: this.clock.trialAt(elapsed), stimulusVisible: this.clock.stimulusVisibleAt(elapsed) });
    this.advance();
  }

  /** Trials evaluated so far that count towards the score (everything after the first n). */
  get scoredTrials(): number {
    return this.evaluations.filter((e) => e.scoreable).length;
  }

  /**
   * The player ends an unlimited session. It finishes as completed with the trials that have closed; the one in
   * progress is dropped, not scored. Refused (false) until `MIN_SCOREABLE` trials have been scored, so a session
   * that has said next to nothing cannot be saved or rewarded.
   */
  finishEarly(): boolean {
    if (this.state !== "running" && this.state !== "paused") return false;
    if (this.state === "running") this.runDueEvents();
    if (this.state !== "running" && this.state !== "paused") return false; // the last life went in the trials that were due
    if (this.scoredTrials < MIN_SCOREABLE) return false;
    this.finish("completed");
    return true;
  }

  /** Stops without a result. The caller discards the session. */
  quit(): void {
    if (this.state === "finished" || this.state === "quit") return;
    this.state = "quit";
    this.cancelTimer();
    this.setView({ trial: null, stimulusVisible: false });
  }

  /**
   * Records that the player marked a match in `stream`. `timestamp` is the input event's own time (same origin as
   * the host clock); without one, now is used. Only the first mark per stream per trial counts.
   */
  respond(stream: StreamId, timestamp?: number): ResponseStatus {
    if (this.state !== "running" || !this.config.streams[stream]) return "ignored";
    const now = this.host.now();
    const at = timestamp !== undefined && Number.isFinite(timestamp) && Math.abs(now - timestamp) <= MAX_TIMESTAMP_SKEW_MS ? Math.min(timestamp, now) : now;
    const elapsed = this.clock.elapsedAt(at);
    if (elapsed === null) return "ignored";
    const trial = this.clock.trialAt(elapsed);
    if (trial === null) return "ignored";
    if (trial < this.evaluations.length) return "late";
    if (this.masks[trial] & STREAM_BIT[stream]) return "duplicate";
    this.masks[trial] |= STREAM_BIT[stream];
    const entry = { trial, stream, offsetMs: elapsed - trial * this.clock.trialMs };
    this.log.push(entry);
    this.listener.onResponse?.(entry);
    return "recorded";
  }

  // ---- Schedule ----------------------------------------------------------

  private eventTime(k: number): number {
    const trial = Math.floor(k / EVENTS_PER_TRIAL);
    const part = k % EVENTS_PER_TRIAL;
    return trial * this.clock.trialMs + (part === 0 ? 0 : part === 1 ? this.clock.stimulusMs : this.clock.trialMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.host.clearTimeout(this.timer);
    this.timer = null;
  }

  /** Runs everything that is due, then sleeps until the next event. */
  private advance(): void {
    this.timer = null;
    this.runDueEvents();
    if (this.state !== "running") return;
    const elapsed = this.clock.elapsedAt(this.host.now());
    if (elapsed === null) return;
    this.timer = this.host.setTimeout(() => this.advance(), Math.max(0, this.eventTime(this.cursor) - elapsed));
  }

  private runDueEvents(): void {
    const elapsed = this.clock.elapsedAt(this.host.now());
    if (elapsed === null) return;
    while (this.state === "running" && this.cursor < this.trials.length * EVENTS_PER_TRIAL && this.eventTime(this.cursor) <= elapsed) {
      this.fire(this.cursor++);
    }
  }

  private fire(k: number): void {
    const trial = Math.floor(k / EVENTS_PER_TRIAL);
    const part = k % EVENTS_PER_TRIAL;
    if (part === 0) this.setView({ trial, stimulusVisible: true });
    else if (part === 1) this.setView({ trial, stimulusVisible: false });
    else this.closeWindow(trial);
  }

  private closeWindow(index: number): void {
    const evaluation = evaluateTrial(index, this.trials[index], this.masks[index], this.config);
    this.evaluations.push(evaluation);
    const lives = livesAfter(this.evaluations);
    this.listener.onEvaluated?.(evaluation, lives);
    if (lives <= 0 || index === this.trials.length - 1) this.finish(lives <= 0 ? "gameover" : "completed");
  }

  private finish(outcome: SessionOutcome): void {
    this.state = "finished";
    this.cancelTimer();
    this.setView({ trial: null, stimulusVisible: false });
    this.listener.onFinish?.({ outcome, responses: this.masks.slice(0, this.evaluations.length), durationMs: this.evaluations.length * this.clock.trialMs });
  }

  private setView(view: TrialView): void {
    if (view.trial === this.view.trial && view.stimulusVisible === this.view.stimulusVisible) return;
    this.view = view;
    this.listener.onView?.(view);
  }
}
