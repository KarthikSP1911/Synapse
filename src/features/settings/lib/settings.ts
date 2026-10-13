import {
  ALLOWED_QUESTION_COUNTS,
  ALLOWED_DURATIONS,
  ALLOWED_QUESTION_TIME_LIMITS,
  DEFAULT_RECENT_WINDOW,
  DEFAULT_WEAK_FOCUS_PERCENT,
  MAX_RECENT_WINDOW,
  MAX_WEAK_FOCUS_PERCENT,
  isIntInRange,
} from "@/lib/validation";
import { DIFFICULTIES, EXERCISE_TYPES, type Difficulty } from "@/features/skills/lib/types";

/** Skills whose exercise types can be switched on and off. */
export type ConfigurableSkill = "percentage" | "fraction" | "square";
export const CONFIGURABLE_SKILLS: readonly ConfigurableSkill[] = ["percentage", "fraction", "square"];

export interface Settings {
  /** Share of questions drawn from the weakest items (0 turns it off). */
  weakFocusPercent: number;
  /** How many of the latest questions must not repeat. */
  recentWindow: number;
  /** Starting difficulty on the setup screen. */
  difficulty: Difficulty;
  /** Exercise types switched on by default, per skill. */
  enabledExercises: Record<ConfigurableSkill, string[]>;
  /** Starting session length on the setup screen: a question count, "endless" or "timed:<seconds>". */
  defaultSession: string;
  /** Seconds allowed per question; 0 means no limit. */
  questionTimeLimit: number;
  /** Show the worked explanation after a wrong answer. */
  showExplanations: boolean;
  /** Show the live correct / accuracy / streak bar while practising. */
  showLiveStats: boolean;
  /** Offer a hint button on the practice screen. */
  allowHints: boolean;
  /** Move on to the next question automatically after a correct answer; off waits for Continue or Enter. */
  autoAdvance: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  weakFocusPercent: DEFAULT_WEAK_FOCUS_PERCENT,
  recentWindow: DEFAULT_RECENT_WINDOW,
  difficulty: "beginner",
  enabledExercises: {
    percentage: [...EXERCISE_TYPES.percentage],
    fraction: [...EXERCISE_TYPES.fraction],
    // Cubes are opt-in: they stop at 20, so they cannot mix with a range that starts higher.
    square: ["value", "root", "missing"],
  },
  defaultSession: "20",
  questionTimeLimit: 0,
  showExplanations: true,
  showLiveStats: true,
  allowHints: true,
  autoAdvance: true,
};

const STORAGE_KEY = "math-trainer:settings";

export function isSessionChoice(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value === "endless") return true;
  if (value.startsWith("timed:")) return (ALLOWED_DURATIONS as readonly number[]).includes(Number(value.slice(6)));
  return (ALLOWED_QUESTION_COUNTS as readonly number[]).includes(Number(value));
}

/**
 * Turns whatever was stored into valid settings. Each field is checked on its own, so settings saved
 * by an earlier version (which only had the first two) keep their values and gain defaults for the rest.
 */
export function parseSettings(raw: unknown): Settings {
  const stored = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bool = (key: keyof Settings, fallback: boolean) => (typeof stored[key] === "boolean" ? (stored[key] as boolean) : fallback);

  const exercises = (stored.enabledExercises ?? {}) as Record<string, unknown>;
  const enabledExercises = { ...DEFAULT_SETTINGS.enabledExercises };
  for (const skill of CONFIGURABLE_SKILLS) {
    const allowed = EXERCISE_TYPES[skill] as readonly string[];
    const picked = Array.isArray(exercises[skill]) ? allowed.filter((t) => (exercises[skill] as unknown[]).includes(t)) : [];
    if (picked.length > 0) enabledExercises[skill] = picked;
  }

  return {
    weakFocusPercent: isIntInRange(stored.weakFocusPercent, 0, MAX_WEAK_FOCUS_PERCENT)
      ? stored.weakFocusPercent
      : DEFAULT_SETTINGS.weakFocusPercent,
    recentWindow: isIntInRange(stored.recentWindow, 0, MAX_RECENT_WINDOW) ? stored.recentWindow : DEFAULT_SETTINGS.recentWindow,
    difficulty: DIFFICULTIES.includes(stored.difficulty as Difficulty) ? (stored.difficulty as Difficulty) : DEFAULT_SETTINGS.difficulty,
    enabledExercises,
    defaultSession: isSessionChoice(stored.defaultSession) ? stored.defaultSession : DEFAULT_SETTINGS.defaultSession,
    questionTimeLimit: (ALLOWED_QUESTION_TIME_LIMITS as readonly unknown[]).includes(stored.questionTimeLimit)
      ? (stored.questionTimeLimit as number)
      : DEFAULT_SETTINGS.questionTimeLimit,
    showExplanations: bool("showExplanations", DEFAULT_SETTINGS.showExplanations),
    showLiveStats: bool("showLiveStats", DEFAULT_SETTINGS.showLiveStats),
    allowHints: bool("allowHints", DEFAULT_SETTINGS.allowHints),
    autoAdvance: bool("autoAdvance", DEFAULT_SETTINGS.autoAdvance),
  };
}

export function loadSettings(): Settings {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
