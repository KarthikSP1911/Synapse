"use client";

import { log } from "@/lib/logger";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Infinity as InfinityIcon, ListOrdered, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { localFetchFor, playHref } from "@/features/offline/lib/local-store";
import { useLocalStore } from "@/features/auth/components/viewer-provider";
import { DEFAULT_SETTINGS, isSessionChoice, loadSettings, type Settings } from "@/features/settings/lib/settings";
import { configFromState, initialSetupState, type SetupState } from "@/features/skills/lib/practice/setup-state";
import { loadFocus, loadSkillSetup, saveFocus, saveSkillSetup } from "@/features/skills/lib/practice/skill-memory";
import { activePreset, applyPreset, isCustomized, presetRow, questionPoolSize, summarizeSkillSetup } from "@/features/skills/lib/practice/skill-presets";
import { SKILL_META, exerciseLabel } from "@/features/skills/lib/meta";
import { EXERCISE_TYPES, type Focus, type PracticeConfig, type Skill } from "@/features/skills/lib/types";
import { sameValue } from "@/lib/same-value";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/layout/section";
import { PresetRow, SettingsStatus, SetupLayout, StartButton } from "@/components/setup/setup-layout";
import ReviewButton from "@/features/skills/components/review-button";
import { StartCountdown } from "@/features/skills/components/start-countdown";
import { usePracticeSound } from "@/features/skills/components/use-practice-sound";
import { Chip } from "@/components/form/choice-controls";
import { ExponentsConfig } from "@/features/skills/components/setup/exponents-config";
import {
  AdditionConfig,
  DivisionConfig,
  FractionConfig,
  MultiplicationConfig,
  PercentageConfig,
  SquareConfig,
  SubtractionConfig,
} from "@/features/skills/components/setup/configs";

const countModes = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "30", label: "30" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "endless", label: "Endless" },
] as const;

const timedModes = [
  { value: "timed:30", label: "30 sec" },
  { value: "timed:60", label: "1 min" },
  { value: "timed:120", label: "2 min" },
] as const;

const focuses: { value: Focus; label: string; help: string }[] = [
  { value: "adaptive", label: "Adaptive", help: "A balanced mix that leans on your weak spots and reviews that are due." },
  { value: "weak", label: "Weak spots", help: "Only questions you find hard. Falls back to the mix when there are none yet." },
  { value: "due", label: "Due reviews", help: "Only questions whose spaced-repetition review is due. Falls back to the mix when none are." },
];

/** What a new session is created from. Taken when Start is pressed, so changes made behind the countdown cannot alter it. */
interface SessionPlan {
  mode: "fixed" | "endless" | "timed";
  focus: Focus;
  config: PracticeConfig;
  sessionMode: string;
}

/**
 * One skill's page: a preset row and the Start button, with the detailed options under Customize. The options are remembered per
 * skill on this device; the session length is not, because its starting point is the "Default session" in Settings.
 * `/` only lists the skills.
 */
export default function SkillPractice({ skill }: { skill: Skill }) {
  const router = useRouter();
  // Sessions run on this device (see `src/features/offline/lib/guest/api.ts`), so starting one never waits on the network.
  const store = useLocalStore();
  const { player: sound, soundOn, changeSound } = usePracticeSound();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<SetupState>(() => initialSetupState(DEFAULT_SETTINGS));
  /** Whether the saved options have been read, so the defaults shown before that never overwrite them. */
  const [setupLoaded, setSetupLoaded] = useState(false);
  const [kind, setKind] = useState<"count" | "timed">("count");
  const [sessionMode, setSessionMode] = useState<string>(DEFAULT_SETTINGS.defaultSession);
  const [focus, setFocus] = useState<Focus>("adaptive");
  const [reviewType, setReviewType] = useState<string>("");
  /** Set from the Start tap until the session exists (or the player backs out); the countdown shows meanwhile. */
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Preferences live in localStorage, so they are applied after mount to avoid a hydration mismatch.
  useEffect(() => {
    const timer = setTimeout(() => {
      const loaded = loadSettings();
      setSettings(loaded);
      // Every skill opens with the options it was last left with (the defaults the first time, or after Reset).
      setState(loadSkillSetup(skill, initialSetupState(loaded)));
      setFocus(loadFocus(skill));
      setSetupLoaded(true);
      setSessionMode(loaded.defaultSession);
      setKind(loaded.defaultSession.startsWith("timed:") ? "timed" : "count");
    }, 0);
    return () => clearTimeout(timer);
  }, [skill]);

  useEffect(() => {
    if (setupLoaded) saveSkillSetup(skill, state);
  }, [skill, setupLoaded, state]);

  useEffect(() => {
    if (setupLoaded) saveFocus(skill, focus);
  }, [skill, setupLoaded, focus]);

  const switchKind = (next: "count" | "timed") => {
    setKind(next);
    const preferred = settings.defaultSession;
    const fits = next === "timed" ? preferred.startsWith("timed:") : !preferred.startsWith("timed:");
    setSessionMode(fits && isSessionChoice(preferred) ? preferred : next === "count" ? "20" : "timed:60");
  };

  const built = useMemo(() => configFromState(skill, state), [skill, state]);
  const poolSize = useMemo(() => (built.ok ? questionPoolSize(built.config) : 0), [built]);
  const defaults = useMemo(() => initialSetupState(settings), [settings]);

  const canStart = built.ok && poolSize > 0;
  const problem = !built.ok
    ? built.error
    : poolSize === 0
      ? skill === "subtraction"
        ? "No questions match these options. The first number needs at least as many digits as the second, unless negative answers are on."
        : skill === "exponents"
          ? "No questions match these options. Try a wider base or exponent range, more kinds of exponent, a higher maximum result or other exercise types."
          : "No questions match these options. Try a wider number range or a different difficulty."
      : null;

  /** The tap: unlock audio (browsers only allow sound after a gesture) and show the countdown. Nothing is created yet. */
  const handleStart = () => {
    if (!built.ok || poolSize === 0 || !store) return;
    sound.unlock();
    setError(null);
    const isTimed = sessionMode.startsWith("timed:");
    setPlan({ mode: isTimed ? "timed" : sessionMode === "endless" ? "endless" : "fixed", focus, config: built.config, sessionMode });
  };

  /** Runs when the countdown has finished: this is the moment the session is created, so a timed clock starts with the first question. */
  const createSession = async () => {
    if (!plan || !store) return;
    try {
      const response = await localFetchFor(store)("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill,
          mode: plan.mode,
          focus: plan.focus,
          config: plan.config,
          targetQuestionCount: plan.mode === "fixed" ? parseInt(plan.sessionMode, 10) : null,
          durationSeconds: plan.mode === "timed" ? parseInt(plan.sessionMode.slice(6), 10) : null,
          questionTimeLimitSeconds: settings.questionTimeLimit,
          weakFocusPercent: settings.weakFocusPercent,
          recentWindow: settings.recentWindow,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Failed to start session");
      }
      const session = await response.json();
      router.push(playHref(session.id));
    } catch (err) {
      log.error("Could not start a practice session", err);
      setError(err instanceof Error && err.message !== "Failed to start session" ? err.message : "Could not start the session. Please try again.");
      setPlan(null);
    }
  };

  const options = kind === "count" ? countModes : timedModes;
  const row = presetRow(skill);
  const presetOptions = [
    ...row.presets,
    ...(row.hasCustom ? [{ id: "custom", label: "Custom", description: "Set the options yourself under Customize. Changing any of them switches to Custom." }] : []),
  ];
  /** Different from a fresh page: the options came back from last time, or were changed here. */
  const changed = setupLoaded && (!sameValue(state[skill], defaults[skill]) || focus !== "adaptive");

  const reset = () => {
    setState((current) => ({ ...current, [skill]: defaults[skill] }));
    setFocus("adaptive");
  };

  return (
    <div className="container space-y-6 py-8 sm:py-10">
      <PageHeader accent={skill} title={SKILL_META[skill].title} description={SKILL_META[skill].description} />

      <SetupLayout
        status={<SettingsStatus changed={changed} onReset={reset} />}
        quick={<PresetRow label={row.label} options={presetOptions} value={activePreset(skill, state)} onChange={(id) => setState((current) => applyPreset(skill, current, id))} />}
        customized={isCustomized(skill, state, defaults)}
        customize={
          <>
            {skill === "multiplication" && <MultiplicationConfig state={state.multiplication} onChange={(multiplication) => setState((s) => ({ ...s, multiplication }))} />}
            {skill === "addition" && <AdditionConfig state={state.addition} onChange={(addition) => setState((s) => ({ ...s, addition }))} />}
            {skill === "subtraction" && <SubtractionConfig state={state.subtraction} onChange={(subtraction) => setState((s) => ({ ...s, subtraction }))} />}
            {skill === "division" && <DivisionConfig state={state.division} onChange={(division) => setState((s) => ({ ...s, division }))} />}
            {skill === "percentage" && <PercentageConfig state={state.percentage} onChange={(percentage) => setState((s) => ({ ...s, percentage }))} />}
            {skill === "fraction" && <FractionConfig state={state.fraction} onChange={(fraction) => setState((s) => ({ ...s, fraction }))} />}
            {skill === "square" && <SquareConfig state={state.square} onChange={(square) => setState((s) => ({ ...s, square }))} />}
            {skill === "exponents" && <ExponentsConfig state={state.exponents} onChange={(exponents) => setState((s) => ({ ...s, exponents }))} />}

            <Section
              title="Session length"
              description={kind === "count" ? "Finish a fixed number of questions, or practise endlessly and end whenever you like." : "Answer as many as you can before the clock runs out. Beat your personal best."}
            >
              <div role="tablist" aria-label="Session type" className="grid max-w-xs grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
                {(
                  [
                    { id: "count", label: "Questions", icon: ListOrdered },
                    { id: "timed", label: "Timed", icon: Timer },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={kind === id}
                    onClick={() => switchKind(id)}
                    className={cn(
                      "flex h-8 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors pointer-coarse:h-10",
                      kind === id ? "bg-background text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label={kind === "count" ? "Number of questions" : "Duration"}>
                {options.map(({ value, label }) => (
                  <Chip key={value} active={sessionMode === value} onClick={() => setSessionMode(value)} className="gap-1">
                    {value === "endless" && <InfinityIcon className="size-3.5" />}
                    {label}
                  </Chip>
                ))}
              </div>
            </Section>

            <Section title="Focus" description={focuses.find((f) => f.value === focus)?.help}>
              <div className="grid max-w-md grid-cols-3 gap-2" role="group" aria-label="Practice focus">
                {focuses.map(({ value, label }) => (
                  <Chip key={value} active={focus === value} onClick={() => setFocus(value)} className="px-1 text-[13px]">
                    {label}
                  </Chip>
                ))}
              </div>
            </Section>
          </>
        }
        summary={built.ok ? summarizeSkillSetup({ skill, state, session: sessionMode, focus, pool: poolSize }) : "Choose your options under Customize to begin."}
        problems={
          <>
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            )}
            {problem && (
              <p role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
                {problem}
              </p>
            )}
          </>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-card">
            {EXERCISE_TYPES[skill].length > 1 && (
              <label className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">Review type</span>
                <select
                  value={reviewType}
                  onChange={(e) => setReviewType(e.target.value)}
                  aria-label="Exercise type to review"
                  className="h-8 rounded-md border border-input bg-background px-2 text-base outline-none md:text-sm pointer-coarse:h-11 focus:border-foreground focus:ring-4 focus:ring-ring/20"
                >
                  <option value="">All {SKILL_META[skill].short.toLowerCase()}</option>
                  {EXERCISE_TYPES[skill].map((type) => (
                    <option key={type} value={type}>
                      {exerciseLabel(skill, type)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ReviewButton
              key={`${skill}:${reviewType}`}
              source={{ reviewRecentDays: 7, skill, ...(reviewType ? { exerciseType: reviewType } : {}) }}
              label="Review mistakes from the last 7 days"
              variant="outline"
            />
          </div>
        }
        action={<StartButton label="Start practice" disabled={!canStart || plan !== null || !store} onClick={handleStart} />}
      />

      {plan && <StartCountdown sound={sound} soundOn={soundOn} onSoundChange={changeSound} onComplete={createSession} onCancel={() => setPlan(null)} />}
    </div>
  );
}
