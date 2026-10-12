"use client";

import { EXERCISE_META, EXPONENT_EXAMPLES, EXPONENT_LEVEL_META, EXPONENT_MODE_META } from "@/lib/skills/meta";
import { EXERCISE_TYPES, EXPONENT_LEVELS, EXPONENT_MODES } from "@/lib/skills/types";
import { EXPONENT_BASE_MAX, EXPONENT_BASE_MIN, EXPONENT_LIMIT, EXPONENT_RESULT_CHOICES } from "@/lib/skills/exponents";
import { typeBlockReason } from "@/lib/skills/exponents-pool";
import { chooseExponentsLevel, chooseExponentsMode, editExponents, type ExponentsSetup } from "@/lib/setup-state";
import { Chip, ExercisePicker, NumberField, Section } from "@/components/setup/controls";

const KINDS = [
  { key: "allowPositive", label: "Positive", example: "2^3" },
  { key: "allowZero", label: "Zero", example: "2^0" },
  { key: "allowNegative", label: "Negative", example: "2^-3" },
] as const;

/** The Exponents page: answer mode, difficulty level, exercise types and the ranges and limits behind them. */
export function ExponentsConfig({ state, onChange }: { state: ExponentsSetup; onChange: (next: ExponentsSetup) => void }) {
  const baseMin = Number(state.baseMin);
  const baseMax = Number(state.baseMax);
  const invalidBases = !(
    /^\d+$/.test(state.baseMin) &&
    /^\d+$/.test(state.baseMax) &&
    baseMin >= EXPONENT_BASE_MIN &&
    baseMax <= EXPONENT_BASE_MAX &&
    baseMin <= baseMax
  );
  const expMin = Number(state.expMin);
  const expMax = Number(state.expMax);
  const invalidExponents = !(
    /^-?\d+$/.test(state.expMin) &&
    /^-?\d+$/.test(state.expMax) &&
    expMin >= -EXPONENT_LIMIT &&
    expMax <= EXPONENT_LIMIT &&
    expMin <= expMax
  );
  const power = state.answerMode === "power";

  const options = EXERCISE_TYPES.exponents.map((value) => ({
    value,
    label: EXERCISE_META.exponents[value].label,
    description: EXPONENT_EXAMPLES[value][state.answerMode] || EXERCISE_META.exponents[value].description,
    disabledReason: typeBlockReason(value, state.answerMode, state),
  }));

  // At least one kind of exponent has to stay on, or there would be nothing to ask.
  const toggleKind = (key: (typeof KINDS)[number]["key"]) => {
    const next = { ...state, [key]: !state[key] };
    if (next.allowPositive || next.allowZero || next.allowNegative) onChange(editExponents(state, { [key]: !state[key] }));
  };

  return (
    <div className="grid gap-6">
      <Section title="Answer mode" description="What you type for each question.">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Answer mode">
          {EXPONENT_MODES.map((mode) => (
            <Chip
              key={mode}
              active={state.answerMode === mode}
              onClick={() => onChange(chooseExponentsMode(state, mode))}
              className="h-auto min-h-11 flex-col gap-0.5 px-2 py-2 pointer-coarse:h-auto"
            >
              {EXPONENT_MODE_META[mode].label}
              <span className="font-mono text-xs opacity-70">{EXPONENT_MODE_META[mode].example}</span>
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{EXPONENT_MODE_META[state.answerMode].description}</p>
      </Section>

      <Section title="Difficulty">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Difficulty">
          {EXPONENT_LEVELS.map((level) => (
            <Chip key={level} active={state.level === level} onClick={() => onChange(chooseExponentsLevel(state, level))}>
              {EXPONENT_LEVEL_META[level].label}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{EXPONENT_LEVEL_META[state.level].description}</p>
      </Section>

      <Section
        title="Exercises"
        description={power ? "Practise one type, or switch several on for a mix. Types that need Final Value mode are unavailable here." : "Practise one type, or switch several on for a mix."}
      >
        <ExercisePicker options={options} selected={state.exerciseTypes} onChange={(exerciseTypes) => onChange(editExponents(state, { exerciseTypes }))} />
      </Section>

      <Section title="Bases" description={`The size of the base, from ${EXPONENT_BASE_MIN} to ${EXPONENT_BASE_MAX}.`}>
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <NumberField
            id="exp-base-min"
            label="From"
            value={state.baseMin}
            min={EXPONENT_BASE_MIN}
            max={EXPONENT_BASE_MAX}
            invalid={invalidBases}
            onChange={(value) => onChange(editExponents(state, { baseMin: value }))}
          />
          <NumberField
            id="exp-base-max"
            label="To"
            value={state.baseMax}
            min={EXPONENT_BASE_MIN}
            max={EXPONENT_BASE_MAX}
            invalid={invalidBases}
            onChange={(value) => onChange(editExponents(state, { baseMax: value }))}
          />
        </div>
        <div className="mt-4 grid max-w-md grid-cols-2 gap-2" role="group" aria-label="Negative bases">
          <Chip active={!state.negativeBases} onClick={() => onChange(editExponents(state, { negativeBases: false }))}>
            Positive bases
          </Chip>
          <Chip active={state.negativeBases} onClick={() => onChange(editExponents(state, { negativeBases: true }))}>
            Include negative bases
          </Chip>
        </div>
      </Section>

      <Section title="Exponents" description={`The exponents written in a question, from ${-EXPONENT_LIMIT} to ${EXPONENT_LIMIT}. Answers follow the same kinds.`}>
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <NumberField
            id="exp-min"
            label="From"
            value={state.expMin}
            min={-EXPONENT_LIMIT}
            max={EXPONENT_LIMIT}
            signed
            invalid={invalidExponents}
            onChange={(value) => onChange(editExponents(state, { expMin: value }))}
          />
          <NumberField
            id="exp-max"
            label="To"
            value={state.expMax}
            min={-EXPONENT_LIMIT}
            max={EXPONENT_LIMIT}
            signed
            invalid={invalidExponents}
            onChange={(value) => onChange(editExponents(state, { expMax: value }))}
          />
        </div>
        <div className="mt-4 grid max-w-md grid-cols-3 gap-2" role="group" aria-label="Kinds of exponent">
          {KINDS.map(({ key, label, example }) => (
            <Chip key={key} active={state[key]} onClick={() => toggleKind(key)} className="h-auto min-h-9 flex-col gap-0 py-1.5 pointer-coarse:h-auto">
              {label}
              <span className="font-mono text-[11px] opacity-70">{example}</span>
            </Chip>
          ))}
        </div>
      </Section>

      <Section
        title="Maximum result"
        description={
          power
            ? "Used in Final Value mode: the largest number an answer, or the top or bottom of a fraction, may have."
            : "The largest number an answer, or the top or bottom of a fraction, may have. Keeps the arithmetic reasonable."
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Maximum result">
          {EXPONENT_RESULT_CHOICES.map((choice) => (
            <Chip
              key={choice}
              active={state.maxResult === choice}
              disabled={power}
              onClick={() => onChange(editExponents(state, { maxResult: choice }))}
              className="font-mono tabular-nums"
            >
              {choice.toLocaleString("en-US")}
            </Chip>
          ))}
        </div>
      </Section>
    </div>
  );
}
