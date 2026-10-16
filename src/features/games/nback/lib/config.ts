import { isObject } from "@/lib/records";
import { isIntInRange } from "@/lib/validation";
import { domainSize } from "./stimuli";
import {
  DEFAULT_CONFIG,
  LIMITS,
  MIN_GAP_MS,
  MIN_SCOREABLE,
  STREAMS,
  STREAM_LABEL,
  defaultTrialCount,
  type NBackConfig,
  type StreamId,
  type StreamMode,
} from "./types";

export const activeStreams = (config: Pick<NBackConfig, "streams">): StreamId[] => STREAMS.filter((s) => config.streams[s]);

export const streamMode = (config: Pick<NBackConfig, "streams">): StreamMode => (["single", "dual", "triple"] as const)[Math.max(0, activeStreams(config).length - 1)];

/** The fewest trials a session of this n can have: the first n are not scored, and at least `MIN_SCOREABLE` must be. */
export const minTrials = (n: number): number => n + MIN_SCOREABLE;

/** Trials that count: all but the first n. */
export const scoreableTrials = (config: Pick<NBackConfig, "n" | "trials">): number => Math.max(0, config.trials - config.n);

/** The config with a new n. When the trial count follows n it is moved too, and a count that is now too low is raised. */
export function withN(config: NBackConfig, n: number): NBackConfig {
  const next = Math.min(LIMITS.n.max, Math.max(LIMITS.n.min, Math.round(n)));
  const trials = config.autoTrials ? defaultTrialCount(next) : Math.min(LIMITS.trials.max, Math.max(config.trials, minTrials(next)));
  return { ...config, n: next, trials };
}

export interface ConfigIssue {
  field: "streams" | "n" | "grid" | "colors" | "letters" | "trials" | "stimulusMs" | "trialMs";
  message: string;
}

/**
 * Checks a config. `errors` make it unplayable (the setup screen disables Start); `warnings` are playable but
 * will feel off, such as a tiny colour set at a high n where look-alike repeats cannot be avoided.
 */
export function validateConfig(config: NBackConfig): { errors: ConfigIssue[]; warnings: ConfigIssue[] } {
  const errors: ConfigIssue[] = [];
  const warnings: ConfigIssue[] = [];
  const bad = (field: ConfigIssue["field"], message: string) => errors.push({ field, message });

  if (activeStreams(config).length === 0) bad("streams", "Turn on at least one stream: Position, Color or Letter.");
  if (!isIntInRange(config.n, LIMITS.n.min, LIMITS.n.max)) bad("n", `n must be between ${LIMITS.n.min} and ${LIMITS.n.max}.`);
  if (!isIntInRange(config.grid, LIMITS.grid.min, LIMITS.grid.max)) bad("grid", `The board must be ${LIMITS.grid.min}x${LIMITS.grid.min} to ${LIMITS.grid.max}x${LIMITS.grid.max}.`);
  if (!isIntInRange(config.colors, LIMITS.colors.min, LIMITS.colors.max)) bad("colors", `Use ${LIMITS.colors.min} to ${LIMITS.colors.max} colors.`);
  if (!isIntInRange(config.letters, LIMITS.letters.min, LIMITS.letters.max)) bad("letters", `Use ${LIMITS.letters.min} to ${LIMITS.letters.max} letters.`);

  const floor = minTrials(isIntInRange(config.n, LIMITS.n.min, LIMITS.n.max) ? config.n : LIMITS.n.min);
  if (!isIntInRange(config.trials, floor, LIMITS.trials.max)) {
    bad("trials", `At n = ${config.n} a session needs ${floor} to ${LIMITS.trials.max} trials, so at least ${MIN_SCOREABLE} can be scored after the first ${config.n}.`);
  }
  if (!isIntInRange(config.stimulusMs, LIMITS.stimulusMs.min, LIMITS.stimulusMs.max)) bad("stimulusMs", `The stimulus must show for ${LIMITS.stimulusMs.min} to ${LIMITS.stimulusMs.max} ms.`);
  if (!isIntInRange(config.trialMs, LIMITS.trialMs.min, LIMITS.trialMs.max)) bad("trialMs", `Time per trial must be ${LIMITS.trialMs.min} to ${LIMITS.trialMs.max} ms.`);
  else if (config.trialMs < config.stimulusMs + MIN_GAP_MS) bad("trialMs", `Time per trial must be at least ${config.stimulusMs + MIN_GAP_MS} ms: the stimulus (${config.stimulusMs} ms) plus a ${MIN_GAP_MS} ms gap.`);

  if (errors.length === 0) {
    for (const stream of activeStreams(config)) {
      const size = domainSize(stream, config);
      // With few values and a long look-back, a non-match can hardly avoid equalling a neighbour of the matching trial.
      if (size <= 4 && config.n >= 4) {
        warnings.push({
          field: stream === "position" ? "grid" : stream === "color" ? "colors" : "letters",
          message: `${STREAM_LABEL[stream]} has only ${size} values at n = ${config.n}: look-alike repeats near the real match will be common. More values make it fairer.`,
        });
      }
    }
  }
  return { errors, warnings };
}

export const isPlayable = (config: NBackConfig): boolean => validateConfig(config).errors.length === 0;

type ParsedConfig = { ok: true; config: NBackConfig } | { ok: false; error: string };

/** A strictly validated config from untrusted data (an upload, or a stored session). Nothing is repaired. */
export function parseConfig(raw: unknown): ParsedConfig {
  if (!isObject(raw)) return { ok: false, error: "The settings must be an object." };
  const { streams, n, adaptive, grid, colors, letters, trials, autoTrials, stimulusMs, trialMs, feedback } = raw;
  if (!isObject(streams) || !STREAMS.every((s) => typeof streams[s] === "boolean")) return { ok: false, error: "Invalid streams." };
  if (typeof adaptive !== "boolean" || typeof autoTrials !== "boolean" || typeof feedback !== "boolean") return { ok: false, error: "Invalid switch setting." };
  for (const [name, value] of Object.entries({ n, grid, colors, letters, trials, stimulusMs, trialMs })) {
    if (!Number.isInteger(value)) return { ok: false, error: `Invalid ${name}.` };
  }
  const config: NBackConfig = {
    streams: { position: streams.position as boolean, color: streams.color as boolean, letter: streams.letter as boolean },
    n: n as number,
    adaptive,
    grid: grid as number,
    colors: colors as number,
    letters: letters as number,
    trials: trials as number,
    autoTrials,
    stimulusMs: stimulusMs as number,
    trialMs: trialMs as number,
    feedback,
  };
  const { errors } = validateConfig(config);
  return errors.length === 0 ? { ok: true, config } : { ok: false, error: errors[0].message };
}

/**
 * Saved settings read back from this device: every field that is missing or wrong falls back to its default, and a
 * result that still cannot be played (for example timings that no longer agree) becomes the defaults entirely.
 */
export function readSettings(raw: unknown): NBackConfig {
  if (!isObject(raw)) return DEFAULT_CONFIG;
  const int = (value: unknown, min: number, max: number, fallback: number) => (isIntInRange(value, min, max) ? value : fallback);
  const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
  const saved = isObject(raw.streams) ? raw.streams : {};
  const streams = { position: flag(saved.position, DEFAULT_CONFIG.streams.position), color: flag(saved.color, DEFAULT_CONFIG.streams.color), letter: flag(saved.letter, DEFAULT_CONFIG.streams.letter) };
  const n = int(raw.n, LIMITS.n.min, LIMITS.n.max, DEFAULT_CONFIG.n);
  const autoTrials = flag(raw.autoTrials, true);
  const config: NBackConfig = {
    streams,
    n,
    adaptive: flag(raw.adaptive, DEFAULT_CONFIG.adaptive),
    grid: int(raw.grid, LIMITS.grid.min, LIMITS.grid.max, DEFAULT_CONFIG.grid),
    colors: int(raw.colors, LIMITS.colors.min, LIMITS.colors.max, DEFAULT_CONFIG.colors),
    letters: int(raw.letters, LIMITS.letters.min, LIMITS.letters.max, DEFAULT_CONFIG.letters),
    autoTrials,
    trials: autoTrials ? defaultTrialCount(n) : int(raw.trials, minTrials(n), LIMITS.trials.max, defaultTrialCount(n)),
    stimulusMs: int(raw.stimulusMs, LIMITS.stimulusMs.min, LIMITS.stimulusMs.max, DEFAULT_CONFIG.stimulusMs),
    trialMs: int(raw.trialMs, LIMITS.trialMs.min, LIMITS.trialMs.max, DEFAULT_CONFIG.trialMs),
    feedback: flag(raw.feedback, DEFAULT_CONFIG.feedback),
  };
  return isPlayable(config) ? config : DEFAULT_CONFIG;
}
