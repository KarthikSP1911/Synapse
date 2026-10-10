import { DEFAULT_BASE_RANGE, MAX_OPERAND, MAX_SQUARE, MIN_OPERAND, SQUARE_PRESETS, parseConfig } from "@/lib/skills/pools";
import { MAX_BASE } from "@/lib/skills/ids";
import type { Difficulty, PracticeConfig, Skill } from "@/lib/skills/types";
import { DIFFICULTIES } from "@/lib/skills/types";
import type { Settings } from "@/lib/settings";

/**
 * What the practice setup screen edits. Numbers that are typed live as strings so a half-typed
 * value is never silently replaced; `configFromState` is what turns them into a real configuration.
 */
export interface SetupState {
  multiplication: { left: number[]; right: number[] };
  percentage: { exerciseTypes: string[]; difficulty: Difficulty; baseMin: string; baseMax: string };
  fraction: { exerciseTypes: string[]; difficulty: Difficulty };
  square: { exerciseTypes: string[]; rangeMin: string; rangeMax: string };
}

const allNumbers = Array.from({ length: MAX_OPERAND }, (_, i) => i + MIN_OPERAND);

export function initialSetupState(settings: Settings): SetupState {
  const { difficulty } = settings;
  return {
    multiplication: { left: allNumbers, right: allNumbers },
    percentage: {
      exerciseTypes: settings.enabledExercises.percentage,
      difficulty,
      baseMin: String(DEFAULT_BASE_RANGE[difficulty].baseMin),
      baseMax: String(DEFAULT_BASE_RANGE[difficulty].baseMax),
    },
    fraction: { exerciseTypes: settings.enabledExercises.fraction, difficulty },
    square: {
      exerciseTypes: settings.enabledExercises.square,
      rangeMin: String(SQUARE_PRESETS[difficulty].rangeMin),
      rangeMax: String(SQUARE_PRESETS[difficulty].rangeMax),
    },
  };
}

export type ConfigFromState = { ok: true; config: PracticeConfig } | { ok: false; error: string };

const toInt = (text: string) => (/^\d+$/.test(text) ? Number(text) : NaN);

export function configFromState(skill: Skill, state: SetupState): ConfigFromState {
  switch (skill) {
    case "multiplication":
      if (state.multiplication.left.length === 0 || state.multiplication.right.length === 0) {
        return { ok: false, error: "Select at least one number on each side to begin." };
      }
      return parseConfig({ skill, left: state.multiplication.left, right: state.multiplication.right });
    case "percentage": {
      const { baseMin, baseMax } = state.percentage;
      const min = toInt(baseMin);
      const max = toInt(baseMax);
      if (!(min >= 1 && max <= MAX_BASE && min <= max)) {
        return { ok: false, error: `Enter a number range between 1 and ${MAX_BASE}, lowest first.` };
      }
      return parseConfig({ skill, ...state.percentage, baseMin: min, baseMax: max });
    }
    case "fraction":
      return parseConfig({ skill, ...state.fraction });
    case "square": {
      const min = toInt(state.square.rangeMin);
      const max = toInt(state.square.rangeMax);
      if (!(min >= 1 && max <= MAX_SQUARE && min <= max)) {
        return { ok: false, error: `Enter a range between 1 and ${MAX_SQUARE}, lowest first.` };
      }
      return parseConfig({ skill, exerciseTypes: state.square.exerciseTypes, rangeMin: min, rangeMax: max });
    }
  }
}

export const isDifficulty = (value: string): value is Difficulty => DIFFICULTIES.includes(value as Difficulty);
