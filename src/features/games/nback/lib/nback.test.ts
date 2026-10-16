import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadActivityDays } from "@/features/offline/lib/activity-days";
import { GUEST_STORE, type LocalStore } from "@/features/offline/lib/guest/api";
import { localActivityDays } from "@/features/progress/lib/local-activity";
import { ECONOMY } from "@/features/rewards/lib/economy";
import { balanceOf } from "@/features/rewards/lib/ledger";
import { loadWallet } from "@/features/rewards/lib/wallet-store";
import { setsBestN, suggestNextN } from "./adaptive";
import { analyze } from "./analysis";
import { activeStreams, isPlayable, minTrials, parseConfig, readSettings, scoreableTrials, streamMode, validateConfig, withN } from "./config";
import { difficultyLoad, difficultyOf } from "./difficulty";
import { MATCH_TOLERANCE, generateSequence, longestRun, nearMissCount, paramsFromConfig, type GenerateParams } from "./generator";
import { BOARD_PADDING, MIN_CELL, MIN_VIEWPORT, PHONE_GUTTER, cellGap, cellSize, letterSize } from "./geometry";
import { STREAM_KEY, streamForKey } from "./keys";
import { MAX_SEED, parseSessionData } from "./records";
import { sessionGrants } from "./rewards";
import { POINTS, evaluateTrial, livesAfter, scoreSession, sessionPoints } from "./scoring";
import { LETTER_ORDER, STIMULUS_COLORS, contrastRatio, describeStimulus, fixedCell, stimulusFor } from "./stimuli";
import { computeStats, hubSummary, progressPoints } from "./stats";
import { loadHistory, loadSettings, markTutorialSeen, saveSession, saveSettings, tutorialSeen } from "./storage";
import {
  ADAPT_DOWN_PERCENT,
  ADAPT_UP_PERCENT,
  DEFAULT_CONFIG,
  GENERATOR_VERSION,
  LIMITS,
  LIVES,
  MATCH_RATE,
  MIN_SCOREABLE,
  STREAMS,
  STREAM_BIT,
  defaultTrialCount,
  type NBackConfig,
  type SessionData,
  type StreamId,
  type Trial,
} from "./types";

const cfg = (overrides: Partial<NBackConfig> = {}): NBackConfig => ({ ...DEFAULT_CONFIG, ...overrides });
const withStreams = (...on: StreamId[]): NBackConfig["streams"] => ({ position: on.includes("position"), color: on.includes("color"), letter: on.includes("letter") });
const all3 = withStreams("position", "color", "letter");

const generate = (config: NBackConfig, seed: number) => generateSequence(paramsFromConfig(config, seed));

/** The responses of a player who marks every real match and nothing else. */
const perfect = (config: NBackConfig, trials: readonly Trial[]): number[] => trials.map((t) => STREAMS.reduce((mask, s) => (config.streams[s] && t.matches[s] ? mask | STREAM_BIT[s] : mask), 0));

/** A hand-made sequence: positions given, everything else fixed. Matches are read from the positions. */
function handmade(positions: number[], n: number): Trial[] {
  return positions.map((p, t) => ({
    values: { position: p, color: 0, letter: 0 },
    matches: { position: t >= n && p === positions[t - n], color: false, letter: false },
  }));
}

class MemoryStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Sequence generation
// ---------------------------------------------------------------------------

describe("sequence generation", () => {
  const CONFIGS: NBackConfig[] = [
    cfg(),
    cfg({ n: 1, streams: withStreams("position") }),
    cfg({ n: 3, streams: withStreams("color", "letter"), colors: 5, letters: 7 }),
    cfg({ n: 5, streams: all3, grid: 5, colors: 8, letters: 10, trials: 60, autoTrials: false }),
    cfg({ n: 9, streams: withStreams("letter"), letters: 10, trials: 80, autoTrials: false }),
    cfg({ n: 2, streams: all3, grid: 3, colors: 3, letters: 4, trials: minTrials(2), autoTrials: false }),
  ];

  it("gives the same sequence for the same seed and settings, and a different one for another seed", () => {
    for (const config of CONFIGS) {
      assert.deepEqual(generate(config, 12345), generate(config, 12345));
      assert.notDeepEqual(generate(config, 12345), generate(config, 12346));
    }
  });

  it("never makes a match in the first n trials, and the flags are the real comparison with n back", () => {
    for (const config of CONFIGS) {
      for (let seed = 1; seed <= 40; seed++) {
        const trials = generate(config, seed);
        assert.equal(trials.length, config.trials);
        trials.forEach((trial, t) => {
          for (const stream of STREAMS) {
            if (t < config.n) assert.equal(trial.matches[stream], false, `trial ${t} ${stream}`);
            else assert.equal(trial.matches[stream], config.streams[stream] && trial.values[stream] === trials[t - config.n].values[stream], `trial ${t} ${stream}`);
          }
        });
      }
    }
  });

  it("keeps the share of matches within tolerance of 25% in every active stream", () => {
    assert.equal(MATCH_RATE, 0.25);
    let total = 0;
    let count = 0;
    for (const config of CONFIGS) {
      for (let seed = 1; seed <= 60; seed++) {
        const trials = generate(config, seed);
        const scoreable = config.trials - config.n;
        for (const stream of activeStreams(config)) {
          const matches = trials.filter((t) => t.matches[stream]).length;
          assert.ok(matches / scoreable >= MATCH_TOLERANCE.min - 1e-9 && matches / scoreable <= MATCH_TOLERANCE.max + 1e-9, `${stream}: ${matches}/${scoreable} (n=${config.n}, seed ${seed})`);
          total += matches / scoreable;
          count++;
        }
      }
    }
    assert.ok(Math.abs(total / count - MATCH_RATE) < 0.03, `the average is ${(total / count).toFixed(3)}`);
  });

  it("does not vary or evaluate a stream that is off", () => {
    const config = cfg({ streams: withStreams("color"), grid: 4 });
    for (let seed = 1; seed <= 20; seed++) {
      const trials = generate(config, seed);
      assert.ok(trials.every((t) => t.values.position === fixedCell(4) && t.values.letter === 0));
      assert.ok(trials.every((t) => !t.matches.position && !t.matches.letter));
      assert.ok(new Set(trials.map((t) => t.values.color)).size > 1, "the stream that is on does vary");
    }
    assert.equal(fixedCell(3), 4, "the middle of a 3 x 3 board");
    assert.equal(fixedCell(6), 21);
  });

  it("generates each stream on its own, so turning another one on does not change it", () => {
    const single = generate(cfg({ streams: withStreams("color"), colors: 5 }), 99);
    const triple = generate(cfg({ streams: all3, colors: 5 }), 99);
    assert.deepEqual(single.map((t) => t.values.color), triple.map((t) => t.values.color));
  });

  it("keeps every value inside its range", () => {
    for (const config of CONFIGS) {
      for (let seed = 1; seed <= 20; seed++) {
        for (const trial of generate(config, seed)) {
          assert.ok(Number.isInteger(trial.values.position) && trial.values.position >= 0 && trial.values.position < config.grid * config.grid);
          if (config.streams.color) assert.ok(trial.values.color >= 0 && trial.values.color < config.colors);
          if (config.streams.letter) assert.ok(trial.values.letter >= 0 && trial.values.letter < config.letters);
        }
      }
    }
  });

  it("avoids degenerate sequences: no run of three, and a stream neither never nor always matches", () => {
    for (const config of CONFIGS) {
      for (let seed = 1; seed <= 80; seed++) {
        const trials = generate(config, seed);
        for (const stream of activeStreams(config)) {
          assert.ok(longestRun(trials.map((t) => t.values[stream])) <= 2, `${stream} run (n=${config.n}, seed ${seed})`);
          const matches = trials.filter((t) => t.matches[stream]).length;
          assert.ok(matches >= 1 && matches < config.trials - config.n, `${stream} has ${matches} matches`);
        }
      }
    }
  });

  it("keeps near misses (the n - 1 and n + 1 look-alikes) rare when there are enough values", () => {
    let near = 0;
    let nonMatches = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const config = cfg({ n: 3, streams: withStreams("position"), grid: 4, trials: 40, autoTrials: false });
      const values = generate(config, seed).map((t) => t.values.position);
      near += nearMissCount(values, config.n);
      nonMatches += values.filter((v, t) => t >= config.n && v !== values[t - config.n]).length;
    }
    assert.ok(near / nonMatches < 0.01, `${near} of ${nonMatches} non-matches were near misses`);
    // The same cannot be promised with three values, but the generator must still work.
    const tiny = generate(cfg({ n: 4, streams: withStreams("color"), colors: 3, trials: 30, autoTrials: false }), 5);
    assert.equal(tiny.length, 30);
  });

  it("counts runs and near misses correctly", () => {
    assert.equal(longestRun([1, 1, 2, 2, 2, 3]), 3);
    assert.equal(longestRun([]), 0);
    // n = 2: trial 4 equals trial 1 (n + 1 back) and is not a match.
    assert.equal(nearMissCount([0, 1, 2, 3, 1], 2), 1);
    assert.equal(nearMissCount([0, 1, 0, 1, 0], 2), 0, "those are matches, not near misses");
  });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe("settings", () => {
  it("starts from a playable default whose trial count is 20 + n", () => {
    assert.equal(isPlayable(DEFAULT_CONFIG), true);
    assert.equal(DEFAULT_CONFIG.n, 2);
    assert.equal(DEFAULT_CONFIG.trials, 22);
    assert.equal(defaultTrialCount(5), 25);
    assert.equal(scoreableTrials(DEFAULT_CONFIG), 20);
  });

  it("requires at least one stream and lists every other problem", () => {
    const none = validateConfig(cfg({ streams: withStreams() }));
    assert.equal(none.errors[0].field, "streams");
    assert.equal(validateConfig(cfg({ streams: withStreams("letter") })).errors.length, 0);
    assert.ok(validateConfig(cfg({ n: 0 })).errors.some((e) => e.field === "n"));
    assert.ok(validateConfig(cfg({ n: 10 })).errors.some((e) => e.field === "n"));
    assert.ok(validateConfig(cfg({ grid: 7 })).errors.some((e) => e.field === "grid"));
    assert.ok(validateConfig(cfg({ colors: 2 })).errors.some((e) => e.field === "colors"));
    assert.ok(validateConfig(cfg({ colors: 9 })).errors.some((e) => e.field === "colors"));
    assert.ok(validateConfig(cfg({ letters: 3 })).errors.some((e) => e.field === "letters"));
    assert.ok(validateConfig(cfg({ trials: 5, autoTrials: false })).errors.some((e) => e.field === "trials"));
  });

  it("needs enough trials beyond the first n to score a match rate", () => {
    assert.equal(minTrials(2), 2 + MIN_SCOREABLE);
    assert.ok(validateConfig(cfg({ n: 6, trials: 15, autoTrials: false })).errors.some((e) => e.field === "trials"));
    assert.equal(validateConfig(cfg({ n: 6, trials: 16, autoTrials: false })).errors.length, 0);
  });

  it("never lets the stimulus outlast the trial", () => {
    assert.ok(validateConfig(cfg({ stimulusMs: 1000, trialMs: 1000 })).errors.some((e) => e.field === "trialMs"));
    assert.ok(validateConfig(cfg({ stimulusMs: 1900, trialMs: 2000 })).errors.some((e) => e.field === "trialMs"));
    assert.equal(validateConfig(cfg({ stimulusMs: 1800, trialMs: 2000 })).errors.length, 0);
    assert.ok(validateConfig(cfg({ stimulusMs: 100 })).errors.some((e) => e.field === "stimulusMs"));
  });

  it("warns, without blocking, when a stream has too few values for a long look-back", () => {
    const sparse = validateConfig(cfg({ n: 5, streams: withStreams("color"), colors: 3 }));
    assert.equal(sparse.errors.length, 0);
    assert.equal(sparse.warnings.length, 1);
    assert.equal(validateConfig(cfg({ n: 5, streams: withStreams("color"), colors: 3 })).warnings[0].field, "colors");
    assert.equal(validateConfig(cfg({ n: 5, colors: 3 })).warnings.length, 0, "an unused stream is not checked");
  });

  it("follows n for the trial count while it is on, and raises a count that is now too low", () => {
    assert.equal(withN(cfg(), 6).trials, 26);
    assert.equal(withN(cfg({ trials: 30, autoTrials: false }), 6).trials, 30);
    assert.equal(withN(cfg({ trials: 12, autoTrials: false }), 6).trials, minTrials(6));
    assert.equal(withN(cfg(), 0).n, 1);
    assert.equal(withN(cfg(), 12).n, 9);
  });

  it("names the mode by how many streams are on", () => {
    assert.equal(streamMode(cfg({ streams: withStreams("letter") })), "single");
    assert.equal(streamMode(cfg({ streams: withStreams("position", "letter") })), "dual");
    assert.equal(streamMode(cfg({ streams: all3 })), "triple");
  });

  it("parses stored settings strictly and repairs saved ones field by field", () => {
    assert.equal(parseConfig(DEFAULT_CONFIG).ok, true);
    assert.equal(parseConfig({ ...DEFAULT_CONFIG, n: 99 }).ok, false);
    assert.equal(parseConfig({ ...DEFAULT_CONFIG, streams: { position: false, color: false, letter: false } }).ok, false);
    assert.equal(parseConfig({ ...DEFAULT_CONFIG, feedback: "yes" }).ok, false);
    assert.equal(parseConfig(null).ok, false);
    assert.deepEqual(readSettings({ n: 4, grid: 99, colors: "x", streams: { position: false, letter: true } }), { ...DEFAULT_CONFIG, n: 4, trials: 24, streams: { position: false, color: false, letter: true } });
    assert.deepEqual(readSettings("garbage"), DEFAULT_CONFIG);
    assert.deepEqual(readSettings({ stimulusMs: 1500, trialMs: 1000 }), DEFAULT_CONFIG, "timings that disagree fall back to the defaults");
  });
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

describe("scoring a trial", () => {
  const hit = STREAM_BIT.position;
  // Position matches in trial 2 (n = 2); colour and letter match in trial 3.
  const trials: Trial[] = [
    { values: { position: 0, color: 0, letter: 0 }, matches: { position: false, color: false, letter: false } },
    { values: { position: 1, color: 1, letter: 1 }, matches: { position: false, color: false, letter: false } },
    { values: { position: 0, color: 2, letter: 2 }, matches: { position: true, color: false, letter: false } },
    { values: { position: 3, color: 1, letter: 1 }, matches: { position: false, color: true, letter: true } },
  ];
  const config = { n: 2, streams: all3 };

  it("classifies hit, miss, false alarm and correct rejection", () => {
    const hitTrial = evaluateTrial(2, trials[2], hit, config);
    assert.equal(hitTrial.results.position?.outcome, "hit");
    assert.equal(hitTrial.results.color?.outcome, "correctRejection");
    assert.equal(hitTrial.error, false);
    assert.equal(evaluateTrial(2, trials[2], 0, config).results.position?.outcome, "miss");
    assert.equal(evaluateTrial(2, trials[2], STREAM_BIT.color, config).results.color?.outcome, "falseAlarm");
    assert.equal(evaluateTrial(2, trials[2], STREAM_BIT.color, config).error, true);
  });

  it("does not score the first n trials, whatever was pressed", () => {
    for (const mask of [0, 7]) {
      const first = evaluateTrial(0, trials[0], mask, config);
      assert.equal(first.scoreable, false);
      assert.deepEqual(first.results, {});
      assert.equal(first.error, false);
    }
    assert.equal(evaluateTrial(1, trials[1], 7, config).error, false);
    assert.equal(evaluateTrial(2, trials[2], 0, { n: 2, streams: all3 }).scoreable, true);
  });

  it("handles matches in several streams at once, and ignores presses on streams that are off", () => {
    const both = evaluateTrial(3, trials[3], STREAM_BIT.color | STREAM_BIT.letter, config);
    assert.equal(both.results.color?.outcome, "hit");
    assert.equal(both.results.letter?.outcome, "hit");
    assert.equal(both.results.position?.outcome, "correctRejection");
    assert.equal(both.error, false);
    const onlyOne = evaluateTrial(3, trials[3], STREAM_BIT.color, config);
    assert.equal(onlyOne.results.letter?.outcome, "miss");
    // Letter is off: it is not evaluated even though it "matches" and the player pressed it.
    const colourOnly = evaluateTrial(3, trials[3], STREAM_BIT.color | STREAM_BIT.letter, { n: 2, streams: withStreams("color") });
    assert.deepEqual(Object.keys(colourOnly.results), ["color"]);
    assert.equal(colourOnly.error, false);
  });
});

describe("scoring a session", () => {
  const positions = [0, 1, 0, 2, 0, 3, 2, 3, 3, 1, 0, 1];
  const config = cfg({ n: 2, streams: withStreams("position"), trials: positions.length, autoTrials: false });
  const trials = handmade(positions, 2);
  const truth = perfect(config, trials);
  const bit = STREAM_BIT.position;

  it("counts a perfect player as 100% with no lives lost", () => {
    const result = scoreSession({ config, trials, responses: truth });
    assert.equal(result.outcome, "completed");
    assert.equal(result.livesRemaining, LIVES);
    assert.equal(result.trialsPlayed, positions.length);
    assert.equal(result.overall.accuracy, 100);
    const s = result.perStream.position!;
    assert.equal(s.scoreable, positions.length - 2);
    assert.equal(s.hits, s.matches);
    assert.equal(s.misses + s.falseAlarms, 0);
    assert.equal(s.detection, 100);
  });

  it("computes per-stream and overall accuracy as (hits + correct rejections) / scored trials", () => {
    // The matches are at trials 2, 4, 7 and 11 (0-based). Miss the first, and press on trial 3, which is not one.
    const matchTrials = truth.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
    const responses = [...truth];
    responses[matchTrials[0]] = 0;
    const falseAt = trials.findIndex((t, i) => i >= 2 && !t.matches.position);
    responses[falseAt] = bit;
    const result = scoreSession({ config, trials, responses });
    const s = result.perStream.position!;
    assert.equal(s.misses, 1);
    assert.equal(s.falseAlarms, 1);
    assert.equal(s.hits + s.correctRejections, s.scoreable - 2);
    assert.equal(s.accuracy, ((s.scoreable - 2) * 100) / s.scoreable);
    assert.equal(result.overall.accuracy, s.accuracy);
    assert.equal(s.detection, ((s.matches - 1) * 100) / s.matches);
  });

  it("pools the decisions of all active streams for the overall accuracy", () => {
    const two = cfg({ n: 1, streams: withStreams("position", "letter"), trials: 4, autoTrials: false });
    const t: Trial[] = [
      { values: { position: 0, color: 0, letter: 0 }, matches: { position: false, color: false, letter: false } },
      { values: { position: 0, color: 0, letter: 1 }, matches: { position: true, color: false, letter: false } },
      { values: { position: 1, color: 0, letter: 1 }, matches: { position: false, color: false, letter: true } },
      { values: { position: 2, color: 0, letter: 2 }, matches: { position: false, color: false, letter: false } },
    ];
    // Position: right, right, right. Letter: right, wrong (missed), right.
    const result = scoreSession({ config: two, trials: t, responses: [0, STREAM_BIT.position, 0, 0] });
    assert.equal(result.perStream.position?.accuracy, 100);
    assert.equal(result.perStream.letter?.accuracy, (2 * 100) / 3);
    assert.deepEqual(result.overall, { correct: 5, total: 6, accuracy: (5 * 100) / 6 });
  });

  it("gives points for decisions, times n, and never below zero", () => {
    const result = scoreSession({ config, trials, responses: truth });
    const s = result.perStream.position!;
    assert.equal(sessionPoints(result, 2), (s.hits * POINTS.hit + s.correctRejections * POINTS.correctRejection) * 2);
    const hopeless = scoreSession({ config, trials, responses: truth.map((m) => (m ? 0 : bit)) });
    assert.equal(sessionPoints(hopeless, 2), 0);
  });
});

// ---------------------------------------------------------------------------
// Lives and game over
// ---------------------------------------------------------------------------

describe("lives and game over", () => {
  const bit = STREAM_BIT.position;
  /** n = 1, position only: trial t is a match when its position equals the previous one. Alternating 0,1 never matches. */
  const quiet = (length: number) => handmade(Array.from({ length }, (_, i) => i % 2), 1);
  const config1 = cfg({ n: 1, streams: withStreams("position"), trials: 30, autoTrials: false });

  it("starts every session with exactly 5 lives", () => {
    assert.equal(LIVES, 5);
    assert.equal(livesAfter([]), 5);
    assert.equal(scoreSession({ config: config1, trials: quiet(30), responses: [] }).livesRemaining, 5);
  });

  it("loses one life for a trial with one error", () => {
    const result = scoreSession({ config: config1, trials: quiet(30), responses: [0, bit, 0, 0] });
    assert.equal(result.livesRemaining, 4);
    assert.deepEqual(result.livesLostAt, [2]);
  });

  it("loses only one life for a trial with errors in several streams", () => {
    const config = cfg({ n: 1, streams: all3, trials: 30, autoTrials: false });
    const t: Trial[] = [
      { values: { position: 0, color: 0, letter: 0 }, matches: { position: false, color: false, letter: false } },
      { values: { position: 1, color: 1, letter: 1 }, matches: { position: false, color: false, letter: false } },
    ];
    const result = scoreSession({ config, trials: t, responses: [0, 7] });
    assert.equal(Object.values(result.evaluations[1].results).filter((r) => !r.correct).length, 3);
    assert.equal(result.livesRemaining, 4);
  });

  it("never costs a life in the first n trials", () => {
    const config = cfg({ n: 3, streams: all3, trials: 30, autoTrials: false });
    const t = generate(config, 7);
    const result = scoreSession({ config, trials: t, responses: [7, 7, 7] });
    assert.equal(result.livesRemaining, LIVES);
    assert.deepEqual(result.livesLostAt, []);
  });

  it("does not change lives for hits and correct rejections, and never restores them", () => {
    const t = generate(config1, 3);
    const truth = perfect(config1, t);
    assert.equal(scoreSession({ config: config1, trials: t, responses: truth }).livesRemaining, LIVES);
    // Two mistakes, then a long run of perfect play: the two lives stay lost.
    const responses = [...truth];
    const wrong = [2, 5].map((i) => i);
    for (const i of wrong) responses[i] = truth[i] ^ bit;
    const result = scoreSession({ config: config1, trials: t, responses });
    assert.equal(result.livesRemaining, 3);
    assert.ok(result.evaluations.slice(6).every((e) => !e.error), "the rest was perfect");
  });

  it("ends the session right after the trial that costs the fifth life, and ignores anything after it", () => {
    const t = quiet(30);
    const responses = Array.from({ length: 30 }, (_, i) => (i >= 1 ? bit : 0)); // every scoreable trial is a false alarm
    const result = scoreSession({ config: config1, trials: t, responses });
    assert.equal(result.outcome, "gameover");
    assert.equal(result.livesRemaining, 0);
    // Trial 1 is the free first-n trial; trials 2 to 6 each cost a life, and the sixth is the last one played.
    assert.equal(result.trialsPlayed, 6);
    assert.equal(result.gameOverTrial, 6);
    assert.deepEqual(result.livesLostAt, [2, 3, 4, 5, 6]);
    assert.equal(result.evaluations.length, 6);
  });

  it("cannot cost a life twice for the same trial: lives come from one evaluation per trial", () => {
    const t = quiet(30);
    const once = scoreSession({ config: config1, trials: t, responses: [0, bit] });
    const evaluation = once.evaluations[1];
    assert.equal(livesAfter([evaluation]), 4);
    assert.equal(livesAfter([evaluation, { ...evaluation, index: 2, error: false }]), 4);
  });
});

// ---------------------------------------------------------------------------
// Adaptive n
// ---------------------------------------------------------------------------

describe("adaptive n", () => {
  const next = (n: number, accuracy: number, outcome: "completed" | "gameover" = "completed") => suggestNextN({ n, accuracy, outcome });

  it("uses the documented thresholds", () => {
    assert.equal(ADAPT_UP_PERCENT, 80);
    assert.equal(ADAPT_DOWN_PERCENT, 50);
  });

  it("goes up at 80% and above, down below 50%, and holds in between, including the exact boundaries", () => {
    assert.equal(next(3, 80), 4);
    assert.equal(next(3, 79.999), 3);
    assert.equal(next(3, 100), 4);
    assert.equal(next(3, 50), 3);
    assert.equal(next(3, 49.999), 2);
    assert.equal(next(3, 0), 2);
    assert.equal(next(3, 65), 3);
  });

  it("never goes below 1 or above 9", () => {
    assert.equal(next(1, 10), 1);
    assert.equal(next(1, 10, "gameover"), 1);
    assert.equal(next(9, 100), 9);
    assert.equal(next(LIMITS.n.max, 99), LIMITS.n.max);
  });

  it("counts a Game Over as failed whatever the accuracy was", () => {
    assert.equal(next(4, 100, "gameover"), 3);
    assert.equal(next(4, 90, "gameover"), 3);
    assert.equal(next(4, 0, "gameover"), 3);
  });

  it("only a completed session at 80% or better sets a best n", () => {
    assert.equal(setsBestN({ outcome: "completed", accuracy: 80 }), true);
    assert.equal(setsBestN({ outcome: "completed", accuracy: 79.9 }), false);
    assert.equal(setsBestN({ outcome: "gameover", accuracy: 100 }), false);
  });

  it("suggests from the exact accuracy, not the rounded one", () => {
    // 199 of 250 decisions is 79.6%: it displays as 80% but is below the line.
    const accuracy = (199 * 100) / 250;
    assert.equal(Math.round(accuracy), 80);
    assert.equal(next(2, accuracy), 2);
    assert.equal(next(2, (200 * 100) / 250), 3);
  });
});

// ---------------------------------------------------------------------------
// Difficulty and rewards
// ---------------------------------------------------------------------------

describe("difficulty", () => {
  it("rises with n, streams, a big board and fast trials, and maps onto the shared reward tiers", () => {
    assert.equal(difficultyOf(DEFAULT_CONFIG), "easy");
    assert.equal(difficultyOf(cfg({ n: 3 })), "easy");
    assert.equal(difficultyOf(cfg({ n: 4 })), "medium");
    assert.equal(difficultyOf(cfg({ n: 2, streams: withStreams("position", "color") })), "medium");
    assert.equal(difficultyOf(cfg({ n: 3, streams: all3 })), "hard");
    assert.equal(difficultyOf(cfg({ n: 6, streams: all3, trialMs: 1500 })), "expert");
    assert.ok(difficultyLoad(cfg({ trialMs: 1500 })) > difficultyLoad(cfg({ trialMs: 2500 })));
    assert.ok(difficultyLoad(cfg({ grid: 5 })) > difficultyLoad(cfg({ grid: 4 })));
    assert.equal(difficultyLoad(cfg({ grid: 6, streams: withStreams("letter") })), difficultyLoad(cfg({ grid: 3, streams: withStreams("letter") })), "the board only matters when Position is in play");
  });
});

// ---------------------------------------------------------------------------
// Records, rewards, history and streaks
// ---------------------------------------------------------------------------

describe("saved sessions", () => {
  const realNow = Date.now;
  let storage: MemoryStorage;
  const T0 = Date.parse("2026-10-13T12:00:00Z");
  beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as { localStorage?: unknown }).localStorage = storage;
  });
  afterEach(() => {
    Date.now = realNow;
  });

  const guest = GUEST_STORE;
  const account: LocalStore = { key: "mathz:user:v1:7", syncable: true };

  /** A finished record for `config`, played by someone who marks `respond(trial)`. */
  function record(id: string, config: NBackConfig, respond: (truth: number[]) => number[], at = T0, seed = 1234): SessionData {
    const trials = generate(config, seed);
    const result = scoreSession({ config, trials, responses: respond(perfect(config, trials)) });
    const played = result.trialsPlayed;
    const durationMs = played * config.trialMs;
    return {
      clientId: id,
      startedAt: at - durationMs - 5000,
      endedAt: at,
      outcome: result.outcome === "gameover" ? "gameover" : "completed",
      config,
      seed,
      generator: GENERATOR_VERSION,
      responses: respond(perfect(config, trials)).slice(0, played),
      durationMs,
    };
  }

  const config = cfg({ n: 2, streams: withStreams("position", "letter") });
  /** Marks every active stream on every trial: false alarms until the lives run out. */
  const spam = (truth: number[]) => truth.map(() => STREAM_BIT.position | STREAM_BIT.letter);
  const completed = (id: string, at = T0, c = config) => record(id, c, (t) => t, at);
  const lost = (id: string, at = T0, c = config) => record(id, c, spam, at);

  it("builds a completed and a Game Over record that pass the strict check, replayed", () => {
    const a = completed("session-aaaa-0001");
    const b = lost("session-bbbb-0002");
    assert.equal(a.outcome, "completed");
    assert.equal(b.outcome, "gameover");
    assert.ok(b.responses.length < config.trials);
    for (const data of [a, b]) {
      const parsed = parseSessionData(data, { now: T0 + 1000, verify: true });
      assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.reason);
    }
  });

  it("rejects records that claim more than their responses earn or that cannot be real", () => {
    const good = completed("session-cccc-0003");
    const bad = (change: Partial<SessionData>) => parseSessionData({ ...good, ...change }, { now: T0 + 1000, verify: true });
    assert.equal(bad({ outcome: "gameover" }).ok, false, "a completed session cannot be relabelled Game Over");
    const over = lost("session-dddd-0004");
    assert.equal(parseSessionData({ ...over, outcome: "completed" }, { verify: true }).ok, false, "a Game Over cannot be relabelled completed");
    assert.equal(bad({ responses: good.responses.slice(0, -3) }).ok, false, "a completed session plays every trial");
    assert.equal(bad({ responses: good.responses.map((r) => r | STREAM_BIT.color) }).ok, false, "a stream that is off cannot be marked");
    assert.equal(bad({ responses: [...good.responses.slice(0, -1), 99] }).ok, false);
    assert.equal(bad({ seed: -1 }).ok, false);
    assert.equal(bad({ seed: MAX_SEED + 1 }).ok, false);
    assert.equal(bad({ generator: GENERATOR_VERSION + 1 }).ok, false);
    assert.equal(bad({ durationMs: 5000 }).ok, false, "the time must match the trials played");
    assert.equal(bad({ startedAt: good.endedAt - 1000 }).ok, false, "more time played than the session lasted");
    assert.equal(bad({ endedAt: T0 + 10 * 60 * 1000 }).ok, false, "ends in the future");
    assert.equal(bad({ config: { ...good.config, n: 99 } }).ok, false);
    assert.equal(parseSessionData(null).ok, false);
    // A Game Over that kept going after the last life is not a valid record: the replay would end sooner.
    const longer = { ...over, responses: [...over.responses, 7], durationMs: over.durationMs + config.trialMs };
    assert.equal(parseSessionData(longer, { verify: true }).ok, false);
  });

  it("pays the difficulty's coins for a completed session and nothing for Game Over", () => {
    const grants = sessionGrants(completed("session-eeee-0005"));
    assert.equal(grants.length, 1);
    assert.equal(grants[0].amount, ECONOMY.puzzle[difficultyOf(config)]);
    assert.equal(grants[0].key, "nback:session-eeee-0005");
    assert.deepEqual(sessionGrants(lost("session-ffff-0006")), []);
  });

  it("pays once however often a session is saved, synced or reloaded, for a guest and an account", () => {
    const data = completed("session-gggg-0007");
    const coins = ECONOMY.puzzle[difficultyOf(config)];
    for (const store of [guest, account]) {
      for (let i = 0; i < 3; i++) assert.equal(saveSession(store, data), true);
      assert.equal(loadHistory(store).length, 1);
      assert.equal(balanceOf(loadWallet(store)), coins, `${store.key} was paid once`);
    }
    assert.equal(loadHistory(account)[0].synced, false, "an account's copy waits for upload");
    assert.equal(loadHistory(guest)[0].synced, undefined);
    assert.deepEqual(loadHistory(guest)[0].responses, data.responses, "read back from storage, intact");
  });

  it("records no streak day and no coins for Game Over, and keeps the session in history", () => {
    const data = lost("session-hhhh-0008");
    saveSession(guest, data);
    assert.equal(balanceOf(loadWallet(guest)), 0);
    assert.deepEqual(loadActivityDays(guest.key), []);
    assert.deepEqual([...localActivityDays(guest, "UTC")], []);
    const [saved] = loadHistory(guest);
    assert.equal(saved.outcome, "gameover");
    assert.equal(analyze(saved).result.livesRemaining, 0);
  });

  it("counts a completed session as a day of activity on the device, once", () => {
    const data = completed("session-iiii-0009");
    saveSession(account, data);
    saveSession(account, data);
    assert.deepEqual([...localActivityDays(account, "UTC")], ["2026-10-13"]);
    // A guest's day is also noted as it is saved, because their history is trimmed.
    saveSession(guest, data);
    saveSession(guest, data);
    assert.equal(loadActivityDays(guest.key).length, 1);
    assert.deepEqual([...localActivityDays(guest, "UTC")], ["2026-10-13"]);
  });

  it("is never created by quitting: only sessions that ended are ever saved", () => {
    // The app only saves when the runner reports an end; with nothing saved there is no history, reward or streak.
    assert.deepEqual(loadHistory(guest), []);
    assert.equal(balanceOf(loadWallet(guest)), 0);
    assert.deepEqual(loadActivityDays(guest.key), []);
  });

  it("remembers the last-used settings, falls back to the defaults when storage is bad, and forgets nothing else", () => {
    assert.deepEqual(loadSettings(), DEFAULT_CONFIG);
    const mine = cfg({ n: 5, adaptive: true, streams: all3, grid: 4, colors: 6, letters: 8, trials: 40, autoTrials: false, stimulusMs: 700, trialMs: 3000, feedback: false });
    saveSettings(mine);
    assert.deepEqual(loadSettings(), mine);
    storage.setItem("mathz:nback:settings", "{not json");
    assert.deepEqual(loadSettings(), DEFAULT_CONFIG);
    assert.equal(tutorialSeen(), false);
    markTutorialSeen();
    assert.equal(tutorialSeen(), true);
  });

  it("works out stats, best n per mode and progress points from the history", () => {
    const single = cfg({ n: 3, streams: withStreams("position") });
    const dual = cfg({ n: 4, streams: withStreams("position", "color") });
    const sessions = [
      completed("session-jjjj-0010", T0, single),
      completed("session-kkkk-0011", T0 + 60_000, cfg({ n: 5, streams: withStreams("position") })),
      lost("session-llll-0012", T0 + 120_000, dual),
      completed("session-mmmm-0013", T0 + 180_000, dual),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.all.sessions, 4);
    assert.equal(stats.all.gameOvers, 1);
    assert.equal(stats.byMode.single.bestN, 5);
    assert.equal(stats.byMode.dual.bestN, 4);
    assert.equal(stats.byMode.triple.sessions, 0);
    assert.equal(stats.byMode.dual.gameOvers, 1, "a Game Over is counted but sets no best n");
    assert.equal(hubSummary(stats), "Best n 5 · single");
    assert.equal(hubSummary(computeStats([])), null);
    assert.equal(hubSummary(computeStats([lost("session-nnnn-0014")])), "No best n yet");
    const points = progressPoints(sessions);
    assert.deepEqual(points.map((p) => p.n), [3, 5, 4, 4]);
    assert.deepEqual(points.map((p) => p.outcome), ["completed", "completed", "gameover", "completed"]);
    assert.deepEqual(progressPoints(sessions, "dual").map((p) => p.index), [1, 2]);
  });

  it("does not count a Game Over towards a personal best even at high n and high accuracy before it", () => {
    const hard = cfg({ n: 7, streams: withStreams("position") });
    const over = lost("session-oooo-0015", T0, hard);
    assert.equal(analyze(over).setsBestN, false);
    assert.equal(computeStats([over]).byMode.single.bestN, 0);
  });
});

// ---------------------------------------------------------------------------
// Input, stimulus and geometry
// ---------------------------------------------------------------------------

describe("keys", () => {
  it("maps A, S and L to the three streams in either case, and nothing else", () => {
    assert.deepEqual(STREAM_KEY, { position: "A", color: "S", letter: "L" });
    assert.equal(streamForKey("a"), "position");
    assert.equal(streamForKey("A"), "position");
    assert.equal(streamForKey("s"), "color");
    assert.equal(streamForKey("l"), "letter");
    for (const other of ["d", "Escape", " ", "Enter", "ArrowLeft", "", "1"]) assert.equal(streamForKey(other), null);
  });
});

describe("what is on screen", () => {
  it("shows a letter and a colour only for streams that are on", () => {
    const trial: Trial = { values: { position: 5, color: 2, letter: 3 }, matches: { position: false, color: false, letter: false } };
    const full = stimulusFor(trial, { streams: all3 });
    assert.deepEqual([full.cell, full.color?.name, full.letter], [5, "Green", LETTER_ORDER[3]]);
    const bare = stimulusFor(trial, { streams: withStreams("position") });
    assert.deepEqual([bare.color, bare.letter], [null, null]);
    assert.equal(describeStimulus(full, 3), `Row 2, column 3, Green, letter ${LETTER_ORDER[3]}`);
  });

  it("keeps the letters apart and gives every colour a readable letter", () => {
    assert.equal(new Set(LETTER_ORDER).size, LETTER_ORDER.length);
    assert.ok(LETTER_ORDER.length >= LIMITS.letters.max);
    assert.ok(!LETTER_ORDER.some((l) => "IO01B8".includes(l)), "no look-alikes of digits");
    assert.equal(STIMULUS_COLORS.length, LIMITS.colors.max);
    assert.equal(new Set(STIMULUS_COLORS.map((c) => c.fill)).size, STIMULUS_COLORS.length);
    for (const color of STIMULUS_COLORS) assert.ok(contrastRatio(color.fill, color.ink) >= 4.5, `${color.name}: ${contrastRatio(color.fill, color.ink).toFixed(2)}`);
    // The neutral accent the board uses when Color is off.
    assert.ok(contrastRatio("#F0ABFC", "#111111") >= 4.5);
  });
});

describe("board geometry", () => {
  it("keeps cells legible on the narrowest phone, 6 x 6 included", () => {
    const board = MIN_VIEWPORT - 2 * PHONE_GUTTER;
    for (let grid = 3; grid <= 6; grid++) {
      const cell = cellSize(board, grid);
      assert.ok(cell >= MIN_CELL, `${grid}x${grid} cell is ${cell.toFixed(1)}px`);
      assert.ok(letterSize(cell) >= 20, "the letter stays readable");
      assert.ok(cell * grid + cellGap(grid) * (grid - 1) + 2 * BOARD_PADDING <= board + 1e-9, "the cells fit the board");
    }
    assert.ok(cellSize(360 - 2 * PHONE_GUTTER, 6) > cellSize(board, 6));
  });

  it("agrees with the stylesheet", () => {
    const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
    const board = css.slice(css.indexOf(".nb-board {"));
    assert.ok(/padding: 6px;/.test(board.slice(0, 200)), "board padding");
    assert.equal(BOARD_PADDING, 6);
    assert.ok(board.includes("gap: var(--nb-gap)"));
  });
});

describe("motion", () => {
  const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const section = css.slice(css.indexOf(".nb-board {"), css.indexOf("/* End of N-Back. */"));

  it("switches off every N-Back animation for people who prefer reduced motion", () => {
    const reduced = section.slice(section.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    const animated = [...section.matchAll(/([^{}@]+)\{([^}]*)\banimation:/g)].map((m) => m[1].trim().split("\n").pop()!.trim());
    assert.ok(animated.length >= 1, "found the animated rules");
    for (const selector of animated) assert.ok(reduced.includes(selector), `${selector} still animates with reduced motion`);
    // The shared rule also zeroes every animation and transition for the rest of the page.
    assert.ok(/prefers-reduced-motion: reduce\)\s*\{\s*\*, \*::before, \*::after \{[^}]*animation-duration: 0\.01ms/.test(css));
  });

  it("never animates or transitions the stimulus itself", () => {
    for (const rule of [".nb-cell {", ".nb-cell[data-lit] {", ".nb-letter {", ".nb-grid {"]) {
      const body = section.slice(section.indexOf(rule), section.indexOf("}", section.indexOf(rule)));
      assert.ok(!/transition|animation/.test(body), `${rule} must not animate`);
    }
  });
});

describe("defaults", () => {
  it("has a trial count that follows n and bounds that make sense", () => {
    assert.ok(LIMITS.stimulusMs.max <= LIMITS.trialMs.max);
    assert.ok(LIMITS.trials.min > MIN_SCOREABLE);
    assert.equal(generate(DEFAULT_CONFIG, 1).length, 22);
    const params: GenerateParams = paramsFromConfig(DEFAULT_CONFIG, 3);
    assert.equal(params.trials, 22);
  });
});
