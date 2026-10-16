/**
 * Shared types and constants for N-Back. Nothing in `nback/lib` imports React, so the generator, the scorer, the
 * adaptive rule and the scheduler can all be tested without a browser.
 */

export const STREAMS = ["position", "color", "letter"] as const;
export type StreamId = (typeof STREAMS)[number];

export const STREAM_LABEL: Record<StreamId, string> = { position: "Position", color: "Color", letter: "Letter" };

/** Bit of a stream in a response or match mask: position 1, colour 2, letter 4. */
export const STREAM_BIT: Record<StreamId, number> = { position: 1, color: 2, letter: 4 };

/** Every session starts with this many lives. Not configurable. */
export const LIVES = 5;

/** Overall accuracy (percent) at or above which adaptive n goes up, and which also sets a personal best. */
export const ADAPT_UP_PERCENT = 80;
/** Overall accuracy (percent) below which adaptive n goes down. */
export const ADAPT_DOWN_PERCENT = 50;

/** Share of scoreable trials that are matches in each stream. Internal; not a setting. */
export const MATCH_RATE = 0.25;

export const LIMITS = {
  n: { min: 1, max: 9 },
  grid: { min: 3, max: 6 },
  colors: { min: 3, max: 8 },
  letters: { min: 4, max: 10 },
  /** Total trials; the first n of them cannot be scored, so the bound is `n + MIN_SCOREABLE` at the least. */
  trials: { min: 11, max: 200 },
  stimulusMs: { min: 200, max: 2000, step: 50 },
  trialMs: { min: 1000, max: 6000, step: 100 },
} as const;

/** A session needs at least this many scoreable trials, so a match rate of about 25% means something. */
export const MIN_SCOREABLE = 10;
/** The stimulus must be gone at least this long before the next trial begins. */
export const MIN_GAP_MS = 200;

/**
 * How many trials an unlimited session is generated with. It ends long before that unless the player is very good
 * (at the default timing it is over 40 minutes of play); reaching it counts as finishing.
 */
export const UNLIMITED_TRIALS = 1000;

/** Trials in a session unless the player picks a number: 20 beyond the first n. */
export const defaultTrialCount = (n: number): number => 20 + n;

export interface NBackConfig {
  streams: Record<StreamId, boolean>;
  /** The n of n-back: compare with the value shown this many trials earlier. */
  n: number;
  /** When on, the suggested n after a session becomes the next session's n. */
  adaptive: boolean;
  /** The board is `grid` x `grid` cells. */
  grid: number;
  colors: number;
  /** How many letters of the letter pool are in play. */
  letters: number;
  /** Total trials, the first n included. Not used while `unlimited` is on, but kept so turning it off brings the number back. */
  trials: number;
  /**
   * No fixed length: the session runs until the last life is lost (Game Over) or the player chooses to finish, which
   * they can do once `MIN_SCOREABLE` trials have been scored. A finished session counts as completed.
   */
  unlimited: boolean;
  /** When true, `trials` follows `20 + n` whenever n changes. */
  autoTrials: boolean;
  /** How long the stimulus stays lit. */
  stimulusMs: number;
  /** Stimulus plus gap: the time from one stimulus to the next, and the response window for a trial. */
  trialMs: number;
  /** Mark each stream right or wrong after every trial. The hearts update either way. */
  feedback: boolean;
}

/** One trial of a generated sequence: what is shown, and the ground truth for each stream. */
export interface Trial {
  /** Cell index (row-major), colour index and letter index. A stream that is off holds a fixed value. */
  values: Record<StreamId, number>;
  /** Whether each active stream matches the value n trials earlier. Always false for the first n trials and for streams that are off. */
  matches: Record<StreamId, boolean>;
}

export type Outcome = "hit" | "miss" | "falseAlarm" | "correctRejection";

/** What happened in one stream of one trial. */
export interface StreamResult {
  outcome: Outcome;
  correct: boolean;
}

/** The evaluation of one trial, made when its response window closed. */
export interface TrialEvaluation {
  /** 0-based index of the trial. */
  index: number;
  /** False for the first n trials, which are shown but never scored. */
  scoreable: boolean;
  /** Results for the active streams, only when the trial is scoreable. */
  results: Partial<Record<StreamId, StreamResult>>;
  /** At least one active stream was wrong (a miss or a false alarm). Costs exactly one life. */
  error: boolean;
}

export interface StreamTally {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
}

export type SessionOutcome = "completed" | "gameover";

export interface SessionData {
  clientId: string;
  startedAt: number;
  endedAt: number;
  outcome: SessionOutcome;
  config: NBackConfig;
  /** Seeds the sequence; with the config, the whole sequence and its ground truth can be rebuilt. */
  seed: number;
  /** Which sequence generator made it (see `GENERATOR_VERSION`). */
  generator: number;
  /** One entry per trial played: the streams the player marked as a match, as a `STREAM_BIT` mask. */
  responses: number[];
  /** Time spent in trials, pauses excluded. */
  durationMs: number;
}

/** Bump when the sequence generator changes in a way that changes its output, so old records are not rescored wrongly. */
export const GENERATOR_VERSION = 1;

export const DEFAULT_CONFIG: NBackConfig = {
  streams: { position: true, color: false, letter: false },
  n: 2,
  adaptive: false,
  grid: 3,
  colors: 4,
  letters: 6,
  trials: defaultTrialCount(2),
  autoTrials: true,
  unlimited: false,
  stimulusMs: 500,
  trialMs: 2500,
  feedback: true,
};

/** "single", "dual" or "triple" by how many streams are on. */
export type StreamMode = "single" | "dual" | "triple";
export const STREAM_MODES: readonly StreamMode[] = ["single", "dual", "triple"];
export const MODE_LABEL: Record<StreamMode, string> = { single: "Single", dual: "Dual", triple: "Triple" };
