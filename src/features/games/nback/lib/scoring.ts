import { activeStreams } from "./config";
import { LIVES, STREAMS, STREAM_BIT, type NBackConfig, type Outcome, type SessionOutcome, type StreamId, type StreamResult, type StreamTally, type Trial, type TrialEvaluation } from "./types";

/**
 * Scoring. It works only from the generator's ground-truth flags and the recorded responses (a mask per trial), never
 * from anything on screen, so a replay of the same data always gives the same lives, outcome and accuracy.
 *
 * Accuracy of a stream = (hits + correct rejections) / scoreable trials played: every trial after the first n is one
 * decision, and it is right when the player marked a match exactly when there was one. Overall accuracy pools the
 * decisions of all active streams. The first n trials are never scoreable.
 */

export const OUTCOME_OF = (matched: boolean, responded: boolean): Outcome => (matched ? (responded ? "hit" : "miss") : responded ? "falseAlarm" : "correctRejection");

/** Evaluates one trial against the streams the player marked. Marks for streams that are off are ignored. */
export function evaluateTrial(index: number, trial: Trial, mask: number, config: Pick<NBackConfig, "n" | "streams">): TrialEvaluation {
  const scoreable = index >= config.n;
  const results: Partial<Record<StreamId, StreamResult>> = {};
  let error = false;
  if (scoreable) {
    for (const stream of activeStreams(config)) {
      const outcome = OUTCOME_OF(trial.matches[stream], (mask & STREAM_BIT[stream]) !== 0);
      const correct = outcome === "hit" || outcome === "correctRejection";
      results[stream] = { outcome, correct };
      if (!correct) error = true;
    }
  }
  return { index, scoreable, results, error };
}

/** Lives left after these evaluations: one is lost for every trial with an error, however many streams were wrong in it. */
export const livesAfter = (evaluations: readonly TrialEvaluation[]): number => Math.max(0, LIVES - evaluations.filter((e) => e.error).length);

export interface StreamSummary extends StreamTally {
  /** Decisions made: hits + misses + false alarms + correct rejections. */
  scoreable: number;
  /** Trials that were matches in this stream: hits + misses. */
  matches: number;
  /** Percent (0-100, not rounded) of decisions that were right; 100 when there were none. */
  accuracy: number;
  /** Percent of the real matches that were caught; null when there were no matches. */
  detection: number | null;
}

export interface SessionResult {
  evaluations: TrialEvaluation[];
  trialsPlayed: number;
  /** "incomplete" only while a session is still running (fewer responses than trials and lives left). */
  outcome: SessionOutcome | "incomplete";
  livesRemaining: number;
  /** 1-based numbers of the trials that cost a life, in order. */
  livesLostAt: number[];
  /** 1-based number of the trial that cost the last life; null unless the session ended in Game Over. */
  gameOverTrial: number | null;
  perStream: Partial<Record<StreamId, StreamSummary>>;
  overall: { correct: number; total: number; accuracy: number };
}

const percent = (part: number, whole: number): number => (whole === 0 ? 100 : (part * 100) / whole);

export function summarizeStream(tally: StreamTally): StreamSummary {
  const scoreable = tally.hits + tally.misses + tally.falseAlarms + tally.correctRejections;
  const matches = tally.hits + tally.misses;
  return { ...tally, scoreable, matches, accuracy: percent(tally.hits + tally.correctRejections, scoreable), detection: matches === 0 ? null : (tally.hits * 100) / matches };
}

/**
 * Replays a session. `responses[i]` is the mask of streams marked in trial i; the replay stops at the first trial that
 * costs the last life (anything after it never happened), or when the responses run out.
 */
export function scoreSession({ config, trials, responses }: { config: Pick<NBackConfig, "n" | "streams">; trials: readonly Trial[]; responses: readonly number[] }): SessionResult {
  const evaluations: TrialEvaluation[] = [];
  const livesLostAt: number[] = [];
  const tallies: Record<StreamId, StreamTally> = {
    position: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
    color: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
    letter: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
  };
  let lives = LIVES;
  let gameOverTrial: number | null = null;

  for (let i = 0; i < Math.min(trials.length, responses.length); i++) {
    const evaluation = evaluateTrial(i, trials[i], responses[i], config);
    evaluations.push(evaluation);
    for (const stream of STREAMS) {
      const result = evaluation.results[stream];
      if (!result) continue;
      const tally = tallies[stream];
      if (result.outcome === "hit") tally.hits++;
      else if (result.outcome === "miss") tally.misses++;
      else if (result.outcome === "falseAlarm") tally.falseAlarms++;
      else tally.correctRejections++;
    }
    if (evaluation.error) {
      lives -= 1;
      livesLostAt.push(i + 1);
      if (lives === 0) {
        gameOverTrial = i + 1;
        break;
      }
    }
  }

  const perStream: Partial<Record<StreamId, StreamSummary>> = {};
  let correct = 0;
  let total = 0;
  for (const stream of activeStreams(config)) {
    const summary = summarizeStream(tallies[stream]);
    perStream[stream] = summary;
    correct += summary.hits + summary.correctRejections;
    total += summary.scoreable;
  }
  const trialsPlayed = evaluations.length;
  const outcome: SessionResult["outcome"] = gameOverTrial !== null ? "gameover" : trialsPlayed === trials.length ? "completed" : "incomplete";
  return { evaluations, trialsPlayed, outcome, livesRemaining: lives, livesLostAt, gameOverTrial, perStream, overall: { correct, total, accuracy: percent(correct, total) } };
}

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

/** Points per decision. A caught match is worth the most, a false alarm costs more than a miss does. */
export const POINTS = { hit: 10, correctRejection: 2, falseAlarm: -5, miss: -3 } as const;

/** The session's points: decisions added up over all streams (never below zero), times n, since a higher n is a harder task. */
export function sessionPoints(result: Pick<SessionResult, "perStream">, n: number): number {
  let raw = 0;
  for (const summary of Object.values(result.perStream)) {
    raw += summary.hits * POINTS.hit + summary.correctRejections * POINTS.correctRejection + summary.falseAlarms * POINTS.falseAlarm + summary.misses * POINTS.miss;
  }
  return Math.max(0, raw) * n;
}
