"use client";

import type { ReactNode } from "react";
import { ArrowRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ACCENT, type AccentId } from "@/lib/accent";
import { DIFFICULTIES, DIFFICULTY_LABEL, formatTime, type Difficulty } from "@/features/games/shared/lib/puzzle-session";

/** The setup screen of Queens, Zip and Patches: pick a difficulty, adjust assistance, start a new game or resume the unfinished one. */
export function PuzzleSetup({
  accent,
  idPrefix,
  difficulty,
  onDifficulty,
  descriptions,
  boardLabel,
  bestTimes,
  saved,
  assistance,
  rules,
  generating,
  failed,
  onStart,
  onResume,
}: {
  accent: AccentId;
  idPrefix: string;
  difficulty: Difficulty;
  onDifficulty: (difficulty: Difficulty) => void;
  descriptions: Record<Difficulty, string>;
  boardLabel: Record<Difficulty, string>;
  /** Fastest solve at each difficulty, or null. */
  bestTimes: Record<Difficulty, number | null>;
  /** The unfinished game stored on this device, if any. */
  saved: { difficulty: Difficulty; playedMs: number; progress: string } | null;
  assistance: ReactNode;
  rules: ReactNode;
  generating: boolean;
  failed: boolean;
  onStart: () => void;
  onResume: () => void;
}) {
  const color = ACCENT[accent];
  const savedLine = saved ? `Unfinished ${DIFFICULTY_LABEL[saved.difficulty]} · ${formatTime(saved.playedMs)} played · ${saved.progress}` : "";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-labelledby={`${idPrefix}-difficulty`}>
          <h2 id={`${idPrefix}-difficulty`} className="text-[15px] font-semibold tracking-tight">
            Difficulty
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Every game is a new puzzle, built just for you.</p>
          <div role="group" aria-labelledby={`${idPrefix}-difficulty`} className="mt-4 grid grid-cols-2 gap-2">
            {DIFFICULTIES.map((d) => {
              const active = d === difficulty;
              const best = bestTimes[d];
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onDifficulty(d)}
                  style={active ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : undefined}
                  className={cn(
                    "flex min-h-11 flex-col items-start gap-1 rounded-xl border p-3 text-left transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active ? "bg-card" : "border-border bg-background hover:border-input hover:bg-accent/60"
                  )}
                >
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="text-[15px] font-semibold tracking-tight">{DIFFICULTY_LABEL[d]}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{boardLabel[d]}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{descriptions[d]}</span>
                  <span className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">{best === null ? "No best time yet" : `Best ${formatTime(best)}`}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-labelledby={`${idPrefix}-assist`}>
          <h2 id={`${idPrefix}-assist`} className="text-[15px] font-semibold tracking-tight">
            Assistance
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Hints are always optional and cost a few points each.</p>
          <div className="mt-4 grid gap-5">{assistance}</div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-labelledby={`${idPrefix}-rules`}>
          <h2 id={`${idPrefix}-rules`} className="text-[15px] font-semibold tracking-tight">
            How to play
          </h2>
          <div className="mt-2 space-y-2 text-sm text-muted-foreground">{rules}</div>
        </section>
      </div>

      {/* Phones: the way in stays on screen above the tab bar instead of sitting at the end of a long page. */}
      <div className="sdk-start-bar -mx-5 border-t border-border bg-background/90 px-5 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden">
        {saved && <p className="mb-2 text-xs text-muted-foreground">{savedLine}</p>}
        <div className="flex gap-2">
          {saved && (
            <Button size="lg" className="flex-1" onClick={onResume}>
              <Play /> Resume
            </Button>
          )}
          <Button size="lg" variant={saved ? "outline" : "default"} className="flex-1" disabled={generating} onClick={onStart}>
            {generating ? "Building…" : saved ? "New game" : `Start ${DIFFICULTY_LABEL[difficulty]} game`}
            {!generating && !saved && <ArrowRight />}
          </Button>
        </div>
        {failed && (
          <p role="alert" className="mt-2 text-center text-xs text-destructive">
            A puzzle could not be built. Please try again.
          </p>
        )}
      </div>

      <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block" aria-label="Start">
        {saved && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-card" style={{ borderColor: color }}>
            <h2 className="text-[15px] font-semibold tracking-tight">Unfinished game</h2>
            <p className="mt-1 text-sm text-muted-foreground">{savedLine.replace(/^Unfinished /, "")}</p>
            <Button size="lg" className="mt-4 w-full" onClick={onResume}>
              <Play /> Resume
            </Button>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 className="text-[15px] font-semibold tracking-tight">New game</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Difficulty</dt>
              <dd className="font-medium">{DIFFICULTY_LABEL[difficulty]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Board</dt>
              <dd className="font-medium">{boardLabel[difficulty]}, one solution</dd>
            </div>
          </dl>
          <Button size="xl" variant={saved ? "outline" : "default"} className="mt-5 w-full" disabled={generating} onClick={onStart}>
            {generating ? "Building puzzle…" : "Start new game"}
            {!generating && <ArrowRight />}
          </Button>
          {failed && (
            <p role="alert" className="mt-3 text-center text-xs text-destructive">
              A puzzle could not be built. Please try again.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
