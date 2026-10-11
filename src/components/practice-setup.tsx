"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Infinity as InfinityIcon, ListOrdered, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { localFetchFor, playHref } from "@/lib/local-store";
import { useLocalStore } from "@/components/viewer-provider";
import { guestSkillSummaries } from "@/lib/guest/progress";
import { loadGuestData } from "@/lib/guest/storage";
import { DEFAULT_SETTINGS, isSessionChoice, loadSettings, type Settings } from "@/lib/settings";
import { configFromState, initialSetupState, type SetupState } from "@/lib/setup-state";
import { buildPool } from "@/lib/skills/pools";
import { SKILL_META, SKILL_ORDER, exerciseLabel } from "@/lib/skills/meta";
import { EXERCISE_TYPES, type Focus, type Skill } from "@/lib/skills/types";
import type { SkillSummary } from "@/lib/progress-queries";
import { Button } from "@/components/ui/button";
import ReviewButton from "@/components/review-button";
import { SkillIcon } from "@/components/skill-icon";
import { Chip } from "@/components/setup/controls";
import { FractionConfig, MultiplicationConfig, PercentageConfig, SquareConfig } from "@/components/setup/configs";

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

function SkillPicker({
  skill,
  summaries,
  onChange,
}: {
  skill: Skill;
  summaries: Record<Skill, SkillSummary> | null;
  onChange: (next: Skill) => void;
}) {
  return (
    <div role="group" aria-label="Skill" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {SKILL_ORDER.map((id) => {
        const active = id === skill;
        const summary = summaries?.[id];
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(id)}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border p-4 text-left shadow-card transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active ? "border-foreground bg-card ring-1 ring-foreground" : "border-border bg-card hover:border-input hover:bg-accent/60"
            )}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-lg",
                  active ? "bg-foreground text-background" : "bg-secondary text-foreground"
                )}
              >
                <SkillIcon skill={id} className="size-[18px]" />
              </span>
              {summary && summary.due > 0 && (
                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">{summary.due} due</span>
              )}
            </span>
            <span>
              <span className="block text-[15px] font-semibold tracking-tight">{SKILL_META[id].title}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{SKILL_META[id].description}</span>
            </span>
            <span className="mt-auto font-mono text-xs tabular-nums text-muted-foreground">
              {summary && summary.attempts > 0
                ? `${summary.attempts.toLocaleString()} answered · ${summary.accuracy}%`
                : "Not started yet"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function PracticeSetup({
  initialSkill = "multiplication",
  summaries = null,
}: {
  initialSkill?: Skill;
  /** The account's figures as of the last page load; the on-device copy replaces them once it has history. */
  summaries?: Record<Skill, SkillSummary> | null;
}) {
  const router = useRouter();
  // Sessions run on this device (see `src/lib/guest/api.ts`), so starting one never waits on the network.
  const store = useLocalStore();
  const [localSummaries, setLocalSummaries] = useState<Record<Skill, SkillSummary> | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [skill, setSkill] = useState<Skill>(initialSkill);
  const [state, setState] = useState<SetupState>(() => initialSetupState(DEFAULT_SETTINGS));
  const [kind, setKind] = useState<"count" | "timed">("count");
  const [sessionMode, setSessionMode] = useState<string>(DEFAULT_SETTINGS.defaultSession);
  const [focus, setFocus] = useState<Focus>("adaptive");
  const [reviewType, setReviewType] = useState<string>("");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preferences live in localStorage, so they are applied after mount to avoid a hydration mismatch.
  useEffect(() => {
    const timer = setTimeout(() => {
      const loaded = loadSettings();
      setSettings(loaded);
      setState(initialSetupState(loaded));
      setSessionMode(loaded.defaultSession);
      setKind(loaded.defaultSession.startsWith("timed:") ? "timed" : "count");
      if (store) {
        const data = loadGuestData(store.key);
        // A guest's figures are always the device's. An account's are too once the device holds its history.
        if (!store.syncable || Object.keys(data.stats).length > 0) setLocalSummaries(guestSkillSummaries(data));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [store]);

  const chooseSkill = (next: Skill) => {
    setSkill(next);
    setReviewType("");
    setError(null);
    window.history.replaceState(null, "", next === "multiplication" ? "/" : `/?skill=${next}`);
  };

  const switchKind = (next: "count" | "timed") => {
    setKind(next);
    const preferred = settings.defaultSession;
    const fits = next === "timed" ? preferred.startsWith("timed:") : !preferred.startsWith("timed:");
    setSessionMode(fits && isSessionChoice(preferred) ? preferred : next === "count" ? "20" : "timed:60");
  };

  const built = useMemo(() => configFromState(skill, state), [skill, state]);
  const poolSize = useMemo(() => {
    if (!built.ok) return 0;
    return built.config.skill === "multiplication" ? built.config.left.length * built.config.right.length : buildPool(built.config).length;
  }, [built]);

  const canStart = built.ok && poolSize > 0;
  const problem = !built.ok
    ? built.error
    : poolSize === 0
      ? "No questions match these options. Try a wider number range or a different difficulty."
      : null;

  const handleStart = async () => {
    if (!built.ok || poolSize === 0 || !store) return;
    setIsStarting(true);
    setError(null);
    try {
      const isTimed = sessionMode.startsWith("timed:");
      const mode = isTimed ? "timed" : sessionMode === "endless" ? "endless" : "fixed";
      const response = await localFetchFor(store)("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill,
          mode,
          focus,
          config: built.config,
          targetQuestionCount: mode === "fixed" ? parseInt(sessionMode, 10) : null,
          durationSeconds: isTimed ? parseInt(sessionMode.slice(6), 10) : null,
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
      console.error(err);
      setError(err instanceof Error && err.message !== "Failed to start session" ? err.message : "Could not start the session. Please try again.");
      setIsStarting(false);
    }
  };

  const options = kind === "count" ? countModes : timedModes;
  const formatSummary =
    sessionMode === "endless"
      ? "Endless session"
      : sessionMode.startsWith("timed:")
        ? `${timedModes.find((m) => m.value === sessionMode)?.label} challenge`
        : `${sessionMode} questions`;

  return (
    <div className="space-y-6">
      <SkillPicker skill={skill} summaries={localSummaries ?? summaries} onChange={chooseSkill} />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          {skill === "multiplication" && (
            <MultiplicationConfig state={state.multiplication} onChange={(multiplication) => setState((s) => ({ ...s, multiplication }))} />
          )}
          {skill === "percentage" && (
            <PercentageConfig state={state.percentage} onChange={(percentage) => setState((s) => ({ ...s, percentage }))} />
          )}
          {skill === "fraction" && <FractionConfig state={state.fraction} onChange={(fraction) => setState((s) => ({ ...s, fraction }))} />}
          {skill === "square" && <SquareConfig state={state.square} onChange={(square) => setState((s) => ({ ...s, square }))} />}
        </div>

        <aside
          className="rounded-xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
          aria-label="Session options"
        >
          <h2 className="text-[15px] font-semibold tracking-tight">Session</h2>

          <div role="tablist" aria-label="Session type" className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
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

          <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label={kind === "count" ? "Number of questions" : "Duration"}>
            {options.map(({ value, label }) => (
              <Chip key={value} active={sessionMode === value} onClick={() => setSessionMode(value)} className="gap-1">
                {value === "endless" && <InfinityIcon className="size-3.5" />}
                {label}
              </Chip>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {kind === "count"
              ? "Finish a fixed number of questions, or practise endlessly and end whenever you like."
              : "Answer as many as you can before the clock runs out. Beat your personal best."}
          </p>

          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Focus</h3>
            <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Practice focus">
              {focuses.map(({ value, label }) => (
                <Chip key={value} active={focus === value} onClick={() => setFocus(value)} className="px-1 text-[13px]">
                  {label}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{focuses.find((f) => f.value === focus)?.help}</p>
          </div>

          <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Skill</dt>
              <dd className="font-medium">{SKILL_META[skill].title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Format</dt>
              <dd className="font-medium">{formatSummary}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Question pool</dt>
              <dd className="font-mono font-medium tabular-nums">
                {poolSize} {skill === "multiplication" ? "pairs" : "questions"}
              </dd>
            </div>
          </dl>

          {error && (
            <p role="alert" className="mt-4 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {problem && (
            <p role="status" className="mt-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
              {problem}
            </p>
          )}

          <Button size="xl" className="mt-5 w-full" onClick={handleStart} disabled={!canStart || isStarting || !store}>
            {isStarting ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                Starting…
              </>
            ) : (
              <>
                Start practice
                <ArrowRight />
              </>
            )}
          </Button>

          <div className="mt-3 space-y-2 border-t border-border pt-4">
            {skill !== "multiplication" && (
              <label className="flex items-center justify-between gap-3 text-sm">
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
              className="w-full"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
