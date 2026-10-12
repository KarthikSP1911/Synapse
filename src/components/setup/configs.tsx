"use client";

import { cn } from "@/lib/utils";
import { DEFAULT_BASE_RANGE, SQUARE_PRESETS } from "@/lib/skills/pools";
import { DIFFICULTY_META, EXERCISE_META } from "@/lib/skills/meta";
import { EXERCISE_TYPES, DIFFICULTIES, MAX_DIGITS, MAX_DIVISOR_DIGITS, type Difficulty } from "@/lib/skills/types";
import { MAX_BASE } from "@/lib/skills/ids";
import type { SetupState } from "@/lib/setup-state";
import { Chip, ExercisePicker, NumberField, Section } from "@/components/setup/controls";

const numbers = Array.from({ length: 20 }, (_, i) => i + 1);
const presets = [
  { label: "1–5", range: [1, 5] },
  { label: "6–10", range: [6, 10] },
  { label: "11–20", range: [11, 20] },
  { label: "All", range: [1, 20] },
] as const;
const rangeOf = (from: number, to: number) => numbers.filter((n) => n >= from && n <= to);

function NumberPicker({
  title,
  description,
  selected,
  onChange,
}: {
  title: string;
  description: string;
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const toggle = (n: number) => onChange(selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n].sort((a, b) => a - b));
  const matches = (from: number, to: number) => {
    const r = rangeOf(from, to);
    return r.length === selected.length && r.every((n) => selected.includes(n));
  };

  return (
    <Section
      title={title}
      description={description}
      aside={
        <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
          {selected.length}/20
        </span>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {presets.map(({ label, range }) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(rangeOf(range[0], range[1]))}
            className={cn(
              "h-7 rounded-full border px-3 text-xs font-medium transition-colors",
              matches(range[0], range[1])
                ? "border-foreground/40 bg-accent text-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange([])}
          className="h-7 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear
        </button>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10 lg:grid-cols-5 xl:grid-cols-10">
        {numbers.map((n) => (
          <Chip key={n} active={selected.includes(n)} onClick={() => toggle(n)} className="font-mono tabular-nums">
            {n}
          </Chip>
        ))}
      </div>
    </Section>
  );
}

export function MultiplicationConfig({
  state,
  onChange,
}: {
  state: SetupState["multiplication"];
  onChange: (next: SetupState["multiplication"]) => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-1">
      <NumberPicker
        title="First number"
        description="Numbers that can appear on the left of ×."
        selected={state.left}
        onChange={(left) => onChange({ ...state, left })}
      />
      <NumberPicker
        title="Second number"
        description="Numbers that can appear on the right of ×."
        selected={state.right}
        onChange={(right) => onChange({ ...state, right })}
      />
    </div>
  );
}

/** Multi-select of digit counts: 1-digit numbers run 1-9, 2-digit 10-99, and so on. */
function DigitPicker({
  title,
  description,
  max,
  selected,
  onChange,
}: {
  title: string;
  description: string;
  max: number;
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const counts = Array.from({ length: max }, (_, i) => i + 1);
  const toggle = (digits: number) =>
    onChange(selected.includes(digits) ? selected.filter((d) => d !== digits) : [...selected, digits].sort((a, b) => a - b));
  return (
    <Section title={title} description={description}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={title}>
        {counts.map((digits) => (
          <Chip key={digits} active={selected.includes(digits)} onClick={() => toggle(digits)} className="flex-col gap-0 py-1.5">
            <span>{digits} {digits === 1 ? "digit" : "digits"}</span>
            <span className="font-mono text-[11px] tabular-nums opacity-70">
              {digits === 1 ? 1 : 10 ** (digits - 1)}–{10 ** digits - 1}
            </span>
          </Chip>
        ))}
      </div>
    </Section>
  );
}

/** Two mutually exclusive choices shown as a pair of chips. */
function ChoicePair({
  title,
  description,
  value,
  options,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  options: { off: string; on: string };
  onChange: (next: boolean) => void;
}) {
  return (
    <Section title={title} description={description}>
      <div className="grid max-w-md grid-cols-2 gap-2" role="group" aria-label={title}>
        <Chip active={!value} onClick={() => onChange(false)}>
          {options.off}
        </Chip>
        <Chip active={value} onClick={() => onChange(true)}>
          {options.on}
        </Chip>
      </div>
    </Section>
  );
}

export function AdditionConfig({ state, onChange }: { state: SetupState["addition"]; onChange: (next: SetupState["addition"]) => void }) {
  return (
    <div className="grid gap-6">
      <DigitPicker
        title="First number"
        description="How many digits the number on the left can have."
        max={MAX_DIGITS}
        selected={state.leftDigits}
        onChange={(leftDigits) => onChange({ ...state, leftDigits })}
      />
      <DigitPicker
        title="Second number"
        description="How many digits the number on the right can have."
        max={MAX_DIGITS}
        selected={state.rightDigits}
        onChange={(rightDigits) => onChange({ ...state, rightDigits })}
      />
    </div>
  );
}

export function SubtractionConfig({
  state,
  onChange,
}: {
  state: SetupState["subtraction"];
  onChange: (next: SetupState["subtraction"]) => void;
}) {
  return (
    <div className="grid gap-6">
      <DigitPicker
        title="First number"
        description="The number you subtract from."
        max={MAX_DIGITS}
        selected={state.leftDigits}
        onChange={(leftDigits) => onChange({ ...state, leftDigits })}
      />
      <DigitPicker
        title="Second number"
        description="The number you take away."
        max={MAX_DIGITS}
        selected={state.rightDigits}
        onChange={(rightDigits) => onChange({ ...state, rightDigits })}
      />
      <ChoicePair
        title="Answers"
        description="Negative answers come from questions like 23 − 58, so they need the second number to be able to be larger."
        value={state.allowNegative}
        options={{ off: "Positive only", on: "Include negatives" }}
        onChange={(allowNegative) => onChange({ ...state, allowNegative })}
      />
    </div>
  );
}

export function DivisionConfig({ state, onChange }: { state: SetupState["division"]; onChange: (next: SetupState["division"]) => void }) {
  return (
    <div className="grid gap-6">
      <DigitPicker
        title="Dividend"
        description="The number being divided."
        max={MAX_DIGITS}
        selected={state.dividendDigits}
        onChange={(dividendDigits) => onChange({ ...state, dividendDigits })}
      />
      <DigitPicker
        title="Divisor"
        description="The number you divide by."
        max={MAX_DIVISOR_DIGITS}
        selected={state.divisorDigits}
        onChange={(divisorDigits) => onChange({ ...state, divisorDigits })}
      />
      <ChoicePair
        title="Answers"
        description="Decimal answers stop at two places, like 15 ÷ 4 = 3.75."
        value={state.decimals}
        options={{ off: "Whole numbers only", on: "Include decimals" }}
        onChange={(decimals) => onChange({ ...state, decimals })}
      />
    </div>
  );
}

function DifficultyPicker({
  value,
  skill,
  onChange,
}: {
  value: Difficulty;
  skill: "percentage" | "fraction";
  onChange: (next: Difficulty) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Difficulty">
        {DIFFICULTIES.map((d) => (
          <Chip key={d} active={value === d} onClick={() => onChange(d)}>
            {DIFFICULTY_META[d].label}
          </Chip>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{DIFFICULTY_META[value].description[skill]}</p>
    </div>
  );
}

const exerciseOptions = (skill: "percentage" | "fraction" | "square") =>
  EXERCISE_TYPES[skill].map((value) => ({ value, ...EXERCISE_META[skill][value] }));

export function PercentageConfig({
  state,
  onChange,
}: {
  state: SetupState["percentage"];
  onChange: (next: SetupState["percentage"]) => void;
}) {
  const min = Number(state.baseMin);
  const max = Number(state.baseMax);
  const invalidRange = !(min >= 1 && max <= MAX_BASE && min <= max);
  return (
    <div className="grid gap-6">
      <Section title="Exercises" description="Practise one type, or switch several on for a mix.">
        <ExercisePicker
          options={exerciseOptions("percentage")}
          selected={state.exerciseTypes}
          onChange={(exerciseTypes) => onChange({ ...state, exerciseTypes })}
        />
      </Section>
      <Section title="Difficulty">
        <DifficultyPicker
          skill="percentage"
          value={state.difficulty}
          onChange={(difficulty) =>
            onChange({
              ...state,
              difficulty,
              baseMin: String(DEFAULT_BASE_RANGE[difficulty].baseMin),
              baseMax: String(DEFAULT_BASE_RANGE[difficulty].baseMax),
            })
          }
        />
      </Section>
      <Section title="Number range" description="The size of the numbers you take a percentage of.">
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <NumberField id="base-min" label="From" value={state.baseMin} min={1} max={MAX_BASE} invalid={invalidRange} onChange={(baseMin) => onChange({ ...state, baseMin })} />
          <NumberField id="base-max" label="To" value={state.baseMax} min={1} max={MAX_BASE} invalid={invalidRange} onChange={(baseMax) => onChange({ ...state, baseMax })} />
        </div>
      </Section>
    </div>
  );
}

export function FractionConfig({
  state,
  onChange,
}: {
  state: SetupState["fraction"];
  onChange: (next: SetupState["fraction"]) => void;
}) {
  return (
    <div className="grid gap-6">
      <Section title="Exercises" description="Practise one type, or switch several on for a mix.">
        <ExercisePicker
          options={exerciseOptions("fraction")}
          selected={state.exerciseTypes}
          onChange={(exerciseTypes) => onChange({ ...state, exerciseTypes })}
        />
      </Section>
      <Section title="Difficulty" description="Controls the size of the numerators and denominators and how tricky the simplifying is.">
        <DifficultyPicker skill="fraction" value={state.difficulty} onChange={(difficulty) => onChange({ ...state, difficulty })} />
      </Section>
    </div>
  );
}

export function SquareConfig({
  state,
  onChange,
}: {
  state: SetupState["square"];
  onChange: (next: SetupState["square"]) => void;
}) {
  const min = Number(state.rangeMin);
  const max = Number(state.rangeMax);
  const invalidRange = !(min >= 1 && max <= 100 && min <= max);
  const activePreset = DIFFICULTIES.find((d) => SQUARE_PRESETS[d].rangeMin === min && SQUARE_PRESETS[d].rangeMax === max);
  return (
    <div className="grid gap-6">
      <Section title="Exercises" description="Direct recall, reverse recall, or both mixed together.">
        <ExercisePicker
          options={exerciseOptions("square")}
          selected={state.exerciseTypes}
          onChange={(exerciseTypes) => onChange({ ...state, exerciseTypes })}
        />
      </Section>
      <Section title="Range" description="Which numbers to square. Pick a preset or set your own within 1–100.">
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Range presets">
          {DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              active={activePreset === d}
              onClick={() => onChange({ ...state, rangeMin: String(SQUARE_PRESETS[d].rangeMin), rangeMax: String(SQUARE_PRESETS[d].rangeMax) })}
            >
              {DIFFICULTY_META[d].label}
              <span className="ml-1.5 font-mono text-xs opacity-70">
                {SQUARE_PRESETS[d].rangeMin}–{SQUARE_PRESETS[d].rangeMax}
              </span>
            </Chip>
          ))}
        </div>
        <div className="mt-4 grid max-w-sm grid-cols-2 gap-3">
          <NumberField id="range-min" label="From" value={state.rangeMin} min={1} max={100} invalid={invalidRange} onChange={(rangeMin) => onChange({ ...state, rangeMin })} />
          <NumberField id="range-max" label="To" value={state.rangeMax} min={1} max={100} invalid={invalidRange} onChange={(rangeMax) => onChange({ ...state, rangeMax })} />
        </div>
      </Section>
    </div>
  );
}
