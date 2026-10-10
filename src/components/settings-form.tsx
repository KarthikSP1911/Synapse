"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Chip, ExercisePicker } from "@/components/setup/controls";
import {
  CONFIGURABLE_SKILLS,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type ConfigurableSkill,
  type Settings,
} from "@/lib/settings";
import { DIFFICULTY_META, EXERCISE_META, SKILL_META } from "@/lib/skills/meta";
import { DIFFICULTIES, EXERCISE_TYPES } from "@/lib/skills/types";
import { REVIEW_INTERVAL_DAYS } from "@/lib/spaced-repetition";
import { ALLOWED_DURATIONS, ALLOWED_QUESTION_COUNTS, MAX_RECENT_WINDOW, MAX_WEAK_FOCUS_PERCENT } from "@/lib/validation";

function SliderField({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  help,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  help: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <span className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-xs font-medium tabular-nums">
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-foreground"
      />
      <p className="text-sm text-muted-foreground">{help}</p>
    </div>
  );
}

function ToggleField({
  id,
  label,
  help,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} className="mt-0.5" />
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{help}</p>
      </div>
    </div>
  );
}

const sessionChoices = [
  ...ALLOWED_QUESTION_COUNTS.map((n) => ({ value: String(n), label: `${n} questions` })),
  { value: "endless", label: "Endless" },
  ...ALLOWED_DURATIONS.map((s) => ({ value: `timed:${s}`, label: s === 60 ? "Timed · 1 min" : s === 120 ? "Timed · 2 min" : `Timed · ${s} sec` })),
];

const timeLimits = [
  { value: 0, label: "Off" },
  { value: 10, label: "10 s" },
  { value: 20, label: "20 s" },
  { value: 30, label: "30 s" },
];

const exerciseOptions = (skill: ConfigurableSkill) =>
  EXERCISE_TYPES[skill].map((value) => ({ value, ...EXERCISE_META[skill][value] }));

export default function SettingsForm() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");

  // Read from localStorage after mount to avoid a server/client hydration mismatch.
  useEffect(() => {
    const timer = setTimeout(() => setSettings(loadSettings()), 0);
    return () => clearTimeout(timer);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setStatus("idle");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Training behaviour</CardTitle>
          <CardDescription>
            Adjust how the adaptive algorithm selects questions. Applies to new sessions of every skill, including mistake reviews.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <SliderField
            id="weak-focus"
            label="Focus on weaknesses"
            value={settings.weakFocusPercent}
            display={`${settings.weakFocusPercent}%`}
            min={0}
            max={MAX_WEAK_FOCUS_PERCENT}
            step={5}
            help="Share of questions drawn from your historically weakest questions (0 turns it off)."
            onChange={(v) => update({ weakFocusPercent: v })}
          />
          <div className="border-t border-border" />
          <SliderField
            id="recent-window"
            label="Avoid repeating the last"
            value={settings.recentWindow}
            display={`${settings.recentWindow} ${settings.recentWindow === 1 ? "question" : "questions"}`}
            min={0}
            max={MAX_RECENT_WINDOW}
            step={1}
            help="Prevents the same question from reappearing too soon (0 allows repeats)."
            onChange={(v) => update({ recentWindow: v })}
          />
          <div className="border-t border-border" />
          <div className="space-y-2">
            <p className="text-sm font-medium">Spaced repetition</p>
            <p className="text-sm text-muted-foreground">
              Every skill uses the same five Leitner boxes. A question you answer correctly without a hint moves up a box and comes back after{" "}
              {REVIEW_INTERVAL_DAYS.join(", ")} days; a miss, skip or timeout sends it back to box 1. Due questions are favoured when picking what to ask.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Practice defaults</CardTitle>
          <CardDescription>What the setup screen starts with. You can still change it for each session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-3">
            <p className="text-sm font-medium">Difficulty</p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Default difficulty">
              {DIFFICULTIES.map((d) => (
                <Chip key={d} active={settings.difficulty === d} onClick={() => update({ difficulty: d })}>
                  {DIFFICULTY_META[d].label}
                </Chip>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Used for percentages and fractions, and to choose the starting range for squares (1–20, 1–50 or 1–100).
            </p>
          </div>

          {CONFIGURABLE_SKILLS.map((skill) => (
            <div key={skill} className="space-y-3 border-t border-border pt-8">
              <p className="text-sm font-medium">{SKILL_META[skill].title}: exercise types</p>
              <ExercisePicker
                options={exerciseOptions(skill)}
                selected={settings.enabledExercises[skill]}
                onChange={(types) => update({ enabledExercises: { ...settings.enabledExercises, [skill]: types } })}
              />
            </div>
          ))}

          <div className="space-y-3 border-t border-border pt-8">
            <p className="text-sm font-medium">Default session</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Default session length">
              {sessionChoices.map(({ value, label }) => (
                <Chip key={value} active={settings.defaultSession === value} onClick={() => update({ defaultSession: value })} className="px-2 text-[13px]">
                  {label}
                </Chip>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display and timing</CardTitle>
          <CardDescription>How the practice screen behaves. Animations follow your system&apos;s reduced-motion setting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-3">
            <p className="text-sm font-medium">Time limit per question</p>
            <div className="grid grid-cols-4 gap-2" role="group" aria-label="Time limit per question">
              {timeLimits.map(({ value, label }) => (
                <Chip key={value} active={settings.questionTimeLimit === value} onClick={() => update({ questionTimeLimit: value })}>
                  {label}
                </Chip>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              A question left unanswered past the limit is recorded as timed out and returns to Box 1. Pausing stops this clock too.
            </p>
          </div>
          <div className="space-y-6 border-t border-border pt-8">
            <ToggleField
              id="show-explanations"
              label="Explain wrong answers"
              help="Show a short worked explanation after a miss and wait for Enter. Timed sessions never wait."
              checked={settings.showExplanations}
              onChange={(showExplanations) => update({ showExplanations })}
            />
            <ToggleField
              id="allow-hints"
              label="Offer hints"
              help="Adds a Hint button (press ?). A correct answer after a hint counts as right, but does not move the question up a box."
              checked={settings.allowHints}
              onChange={(allowHints) => update({ allowHints })}
            />
            <ToggleField
              id="show-live-stats"
              label="Show live stats"
              help="Correct count, accuracy and streak along the bottom of the practice screen."
              checked={settings.showLiveStats}
              onChange={(showLiveStats) => update({ showLiveStats })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <span role="status" className="mr-auto text-sm">
          {status === "saved" && (
            <span className="inline-flex items-center gap-1.5 text-success">
              <Check className="size-4" /> Saved
            </span>
          )}
          {status === "failed" && <span className="text-destructive">Could not save (browser storage unavailable)</span>}
        </span>
        <Button variant="outline" onClick={() => update(DEFAULT_SETTINGS)}>
          Reset to defaults
        </Button>
        <Button onClick={() => setStatus(saveSettings(settings) ? "saved" : "failed")}>Save settings</Button>
      </div>
    </div>
  );
}
