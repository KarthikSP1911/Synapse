import { DIFFICULTIES, LIMITS, RECALL_MODES, type Difficulty, type RecallConfig, type RecallMode } from "./types";

/** The timing and length behind each difficulty. Pairs are harder to hold than digits, so their sequences are shorter. */
interface Preset {
  length: number;
  displayMs: number;
  gapMs: number;
  countdown: number;
}

const PRESETS: Record<RecallMode, Record<Exclude<Difficulty, "custom">, Preset>> = {
  single: {
    easy: { length: 4, displayMs: 1000, gapMs: 500, countdown: 3 },
    medium: { length: 6, displayMs: 700, gapMs: 400, countdown: 3 },
    hard: { length: 9, displayMs: 500, gapMs: 200, countdown: 3 },
  },
  pair: {
    easy: { length: 3, displayMs: 1200, gapMs: 600, countdown: 3 },
    medium: { length: 4, displayMs: 900, gapMs: 400, countdown: 3 },
    hard: { length: 6, displayMs: 600, gapMs: 300, countdown: 3 },
  },
};

export const DEFAULT_ROUNDS = 5;

/** A configuration for a mode and difficulty. "Custom" starts from the medium values. */
export function configFor(mode: RecallMode, difficulty: Difficulty, rest: Partial<Pick<RecallConfig, "rounds" | "progressive" | "partialCredit">> = {}): RecallConfig {
  const preset = PRESETS[mode][difficulty === "custom" ? "medium" : difficulty];
  return { mode, difficulty, rounds: DEFAULT_ROUNDS, progressive: false, partialCredit: true, ...rest, ...preset };
}

export const defaultConfig = (mode: RecallMode): RecallConfig => configFor(mode, "medium");

/** The difficulty a configuration amounts to: a preset's name when it matches one exactly, otherwise "custom". */
export function difficultyOf(config: Pick<RecallConfig, "mode" | "length" | "displayMs" | "gapMs" | "countdown">): Difficulty {
  for (const level of ["easy", "medium", "hard"] as const) {
    const p = PRESETS[config.mode][level];
    if (p.length === config.length && p.displayMs === config.displayMs && p.gapMs === config.gapMs && p.countdown === config.countdown) return level;
  }
  return "custom";
}

const inRange = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const onGrid = (v: unknown, { min, max, step }: { min: number; max: number; step: number }): v is number => inRange(v, min, max) && ((v as number) - min) % step === 0;

export type ParsedConfig = { ok: true; config: RecallConfig } | { ok: false; error: string };

/** Strictly checks an untrusted configuration (from storage or an upload) and returns a clean copy. */
export function parseConfig(raw: unknown): ParsedConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Settings must be an object." };
  const r = raw as Record<string, unknown>;
  if (!RECALL_MODES.includes(r.mode as RecallMode)) return { ok: false, error: "Unknown mode." };
  if (!DIFFICULTIES.includes(r.difficulty as Difficulty)) return { ok: false, error: "Unknown difficulty." };
  if (!inRange(r.rounds, LIMITS.rounds.min, LIMITS.rounds.max)) return { ok: false, error: `Rounds must be ${LIMITS.rounds.min} to ${LIMITS.rounds.max}.` };
  if (!inRange(r.length, LIMITS.length.min, LIMITS.length.max)) return { ok: false, error: `Length must be ${LIMITS.length.min} to ${LIMITS.length.max}.` };
  if (!onGrid(r.displayMs, LIMITS.displayMs)) return { ok: false, error: "Display time is out of range." };
  if (!onGrid(r.gapMs, LIMITS.gapMs)) return { ok: false, error: "Delay is out of range." };
  if (!inRange(r.countdown, LIMITS.countdown.min, LIMITS.countdown.max)) return { ok: false, error: "Countdown is out of range." };
  if (typeof r.progressive !== "boolean" || typeof r.partialCredit !== "boolean") return { ok: false, error: "Progressive and partial credit must be on or off." };
  return {
    ok: true,
    config: {
      mode: r.mode as RecallMode,
      difficulty: r.difficulty as Difficulty,
      rounds: r.rounds,
      length: r.length,
      displayMs: r.displayMs,
      gapMs: r.gapMs,
      countdown: r.countdown,
      progressive: r.progressive,
      partialCredit: r.partialCredit,
    },
  };
}
