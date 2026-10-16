import { LIMITS, OPERATIONS, OPERATION_SYMBOL, type Operation, type RoundConfig } from "./types";

/** Number of decimal places numbers may have in a round (0 when decimals are off). */
export const placesOf = (config: Pick<RoundConfig, "decimals" | "decimalPlaces">): number => (config.decimals ? config.decimalPlaces : 0);

/**
 * Largest size a running total may reach: keeps products and quotients within what can be held in the head
 * (and the generator from producing runaway values). Two digits of headroom beyond two numbers of full size.
 */
export const magnitudeCap = (digits: number): number => 10 ** (2 * digits + 2);

export const DEFAULT_ROUND: RoundConfig = {
  flashes: 5,
  digits: 2,
  operations: ["add", "subtract"],
  allowNegative: false,
  decimals: false,
  decimalPlaces: 1,
  displayMs: 1000,
  gapMs: 400,
};

export interface Preset {
  id: "easy" | "medium" | "hard" | "expert";
  label: string;
  description: string;
  round: RoundConfig;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "easy",
    label: "Easy",
    description: "Single digits, add and subtract, a relaxed pace.",
    round: { flashes: 4, digits: 1, operations: ["add", "subtract"], allowNegative: false, decimals: false, decimalPlaces: 1, displayMs: 1500, gapMs: 500 },
  },
  {
    id: "medium",
    label: "Medium",
    description: "Two-digit numbers with multiplication.",
    round: { flashes: 5, digits: 2, operations: ["add", "subtract", "multiply"], allowNegative: false, decimals: false, decimalPlaces: 1, displayMs: 1100, gapMs: 400 },
  },
  {
    id: "hard",
    label: "Hard",
    description: "All four operations, negatives, quick flashes.",
    round: { flashes: 6, digits: 2, operations: ["add", "subtract", "multiply", "divide"], allowNegative: true, decimals: false, decimalPlaces: 1, displayMs: 700, gapMs: 300 },
  },
  {
    id: "expert",
    label: "Expert",
    description: "Three digits, decimals, negatives and very fast flashes.",
    round: { flashes: 7, digits: 3, operations: ["add", "subtract", "multiply", "divide"], allowNegative: true, decimals: true, decimalPlaces: 1, displayMs: 500, gapMs: 200 },
  },
];

export const DEFAULT_ROUND_COUNT = 5;

/**
 * What the setup screen holds: one set of settings that every round of the session uses, and how many rounds there
 * are. (A saved session still records the settings of each round it played, so older history, which could mix
 * settings, keeps reading correctly.)
 */
export interface MindSprintSetup {
  config: RoundConfig;
  rounds: number;
}

export const copyRound = (config: RoundConfig): RoundConfig => ({ ...config, operations: [...config.operations] });

export const DEFAULT_SETUP: MindSprintSetup = { config: DEFAULT_ROUND, rounds: DEFAULT_ROUND_COUNT };

/** The rounds of a session started from this setup: the same settings, as many times as the player chose. */
export const roundsOf = (setup: MindSprintSetup): RoundConfig[] => Array.from({ length: setup.rounds }, () => copyRound(setup.config));

export type PresetId = Preset["id"];

const sameRound = (a: RoundConfig, b: RoundConfig): boolean =>
  a.flashes === b.flashes &&
  a.digits === b.digits &&
  a.allowNegative === b.allowNegative &&
  a.decimals === b.decimals &&
  a.decimalPlaces === b.decimalPlaces &&
  a.displayMs === b.displayMs &&
  a.gapMs === b.gapMs &&
  a.operations.length === b.operations.length &&
  a.operations.every((op) => b.operations.includes(op));

/** The preset these settings are exactly, or "custom" when they match none (any change to a preset makes it custom). */
export function presetOf(config: RoundConfig): PresetId | "custom" {
  return PRESETS.find((p) => sameRound(p.round, config))?.id ?? "custom";
}

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

/** What each operation adds to a round's difficulty when it is switched on. */
const OPERATION_WEIGHT: Record<Operation, number> = { add: 0, subtract: 0.1, multiply: 0.4, divide: 0.5 };

export const BASE_POINTS = 100;

/**
 * How much harder a round is than the easiest possible one (1.0). Longer sequences, bigger numbers, more and
 * harder operations, decimals, negatives and faster flashes each add to it. Points scale with it, so a hard
 * round is worth more than an easy one.
 */
export function difficultyMultiplier(config: RoundConfig): number {
  let m = 1;
  m += 0.5 * (config.digits - 1);
  m += 0.1 * Math.max(0, config.flashes - 3);
  for (const op of config.operations) m += OPERATION_WEIGHT[op];
  if (config.decimals) m += 0.4 + 0.1 * (config.decimalPlaces - 1);
  if (config.allowNegative) m += 0.2;
  if (config.displayMs < 500) m += 0.6;
  else if (config.displayMs < 800) m += 0.4;
  else if (config.displayMs < 1200) m += 0.2;
  else if (config.displayMs < 2000) m += 0.1;
  return Math.round(m * 100) / 100;
}

export const DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard", "Expert"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export function difficultyLevel(config: RoundConfig): DifficultyLevel {
  const m = difficultyMultiplier(config);
  return m < 1.5 ? "Easy" : m < 2.5 ? "Medium" : m < 4 ? "Hard" : "Expert";
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const inRange = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** `step` keeps timings on the grid the controls use (200, 300 ... not 237). */
const onGrid = (v: unknown, { min, max, step }: { min: number; max: number; step: number }): v is number => inRange(v, min, max) && ((v as number) - min) % step === 0;

type ParsedRound = { ok: true; config: RoundConfig } | { ok: false; error: string };

/** Strictly checks an untrusted round configuration (from storage or an upload) and returns a clean copy. */
export function parseRoundConfig(raw: unknown): ParsedRound {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Round settings must be an object." };
  const r = raw as Record<string, unknown>;

  if (!inRange(r.flashes, LIMITS.flashes.min, LIMITS.flashes.max)) return { ok: false, error: `Flashes must be ${LIMITS.flashes.min} to ${LIMITS.flashes.max}.` };
  if (!inRange(r.digits, LIMITS.digits.min, LIMITS.digits.max)) return { ok: false, error: `Digits must be ${LIMITS.digits.min} to ${LIMITS.digits.max}.` };
  if (!Array.isArray(r.operations) || r.operations.length === 0 || !r.operations.every((o) => OPERATIONS.includes(o as Operation))) {
    return { ok: false, error: "Choose at least one operation." };
  }
  if (typeof r.allowNegative !== "boolean" || typeof r.decimals !== "boolean") return { ok: false, error: "Negative and decimal settings must be on or off." };
  if (!inRange(r.decimalPlaces, LIMITS.decimalPlaces.min, LIMITS.decimalPlaces.max)) {
    return { ok: false, error: `Decimal places must be ${LIMITS.decimalPlaces.min} to ${LIMITS.decimalPlaces.max}.` };
  }
  if (!onGrid(r.displayMs, LIMITS.displayMs)) return { ok: false, error: "Display time is out of range." };
  if (!onGrid(r.gapMs, LIMITS.gapMs)) return { ok: false, error: "Gap time is out of range." };

  return {
    ok: true,
    config: {
      flashes: r.flashes,
      digits: r.digits,
      // Canonical order and no repeats, whatever order they arrived in.
      operations: OPERATIONS.filter((o) => (r.operations as unknown[]).includes(o)),
      allowNegative: r.allowNegative,
      decimals: r.decimals,
      decimalPlaces: r.decimalPlaces,
      displayMs: r.displayMs,
      gapMs: r.gapMs,
    },
  };
}

/**
 * A remembered setup read back from storage, or null. Reads the current shape, and the older one (a list of rounds,
 * each with its own settings) by taking the first round's settings and the number of rounds.
 */
export function parseSetup(raw: unknown): MindSprintSetup | null {
  if (Array.isArray(raw)) {
    if (raw.length < LIMITS.rounds.min || raw.length > LIMITS.rounds.max) return null;
    const first = parseRoundConfig(raw[0]);
    return first.ok ? { config: first.config, rounds: raw.length } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const { config, rounds } = raw as Record<string, unknown>;
  const parsed = parseRoundConfig(config);
  return parsed.ok && inRange(rounds, LIMITS.rounds.min, LIMITS.rounds.max) ? { config: parsed.config, rounds } : null;
}

/** One-line description of a round for lists: "5 × 2-digit · + − × · 1.0s". */
export function describeRound(config: RoundConfig): string {
  const parts = [`${config.flashes} numbers`, `${config.digits}-digit`, config.operations.map((o) => OPERATION_SYMBOL[o]).join(" ")];
  if (config.decimals) parts.push(`${config.decimalPlaces} dp`);
  if (config.allowNegative) parts.push("negatives");
  parts.push(`${(config.displayMs / 1000).toFixed(1)}s flash`);
  return parts.join(" · ");
}
