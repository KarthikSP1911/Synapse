"use client";

import type { ReactNode } from "react";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PresetRow, SettingsStatus, SetupLayout, type PresetOption } from "@/components/setup/setup-layout";
import { ACCENT, type AccentId } from "@/lib/accent";
import { DIFFICULTIES, DIFFICULTY_LABEL, formatTime, type Difficulty } from "@/features/games/shared/lib/puzzle-session";

/**
 * The setup screen of Queens, Zip, Patches and Sudoku: pick a difficulty and start a new game (or resume the unfinished one).
 * The assistance switches live under Customize, and the rules behind a "?".
 */
export function PuzzleSetup({
  accent,
  difficulty,
  onDifficulty,
  descriptions,
  boardLabel,
  bestTimes,
  saved,
  assistance,
  customized,
  changed,
  onReset,
  rules,
  generating,
  failed,
  onStart,
  onResume,
}: {
  accent: AccentId;
  difficulty: Difficulty;
  onDifficulty: (difficulty: Difficulty) => void;
  descriptions: Record<Difficulty, string>;
  boardLabel: Record<Difficulty, string>;
  /** Fastest solve at each difficulty, or null. */
  bestTimes: Record<Difficulty, number | null>;
  /** The unfinished game stored on this device, if any. */
  saved: { difficulty: Difficulty; playedMs: number; progress: string } | null;
  assistance: ReactNode;
  /** The assistance settings are not the defaults, so Customize starts open. */
  customized: boolean;
  /** The difficulty or the assistance differs from the defaults. */
  changed: boolean;
  onReset: () => void;
  rules: ReactNode;
  generating: boolean;
  failed: boolean;
  onStart: () => void;
  onResume: () => void;
}) {
  const color = ACCENT[accent];
  const savedLine = saved ? `Unfinished ${DIFFICULTY_LABEL[saved.difficulty]} · ${formatTime(saved.playedMs)} played · ${saved.progress}` : "";
  const best = bestTimes[difficulty];
  const options: PresetOption<Difficulty>[] = DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_LABEL[d], detail: boardLabel[d], description: descriptions[d] }));

  const failure = failed && (
    <p role="alert" className="text-center text-xs text-destructive">
      A puzzle could not be built. Please try again.
    </p>
  );
  const newGame = (size: "lg" | "xl", wide: boolean) => (
    <Button size={size} variant={saved ? "outline" : "default"} className={wide ? "w-full" : "flex-1"} disabled={generating} onClick={onStart}>
      {generating ? "Building…" : saved ? "New game" : `Start ${DIFFICULTY_LABEL[difficulty]} game`}
      {!generating && !saved && <ArrowRight />}
    </Button>
  );

  return (
    <SetupLayout
      status={<SettingsStatus changed={changed} onReset={onReset} />}
      quick={<PresetRow label="Difficulty" options={options} value={difficulty} onChange={onDifficulty} />}
      customized={customized}
      customize={<div className="grid gap-5">{assistance}</div>}
      summary={`${DIFFICULTY_LABEL[difficulty]}: ${boardLabel[difficulty]} board, one solution. ${best === null ? "No best time yet." : `Best time ${formatTime(best)}.`}`}
      help={rules}
      helpLabel="how to play"
      asideTop={
        saved && (
          <div className="rounded-xl border bg-card p-5 shadow-card" style={{ borderColor: color }}>
            <h2 className="text-[15px] font-semibold tracking-tight">Unfinished game</h2>
            <p className="mt-1 text-sm text-muted-foreground">{savedLine.replace(/^Unfinished /, "")}</p>
            <Button size="lg" className="mt-4 w-full" onClick={onResume}>
              <Play /> Resume
            </Button>
          </div>
        )
      }
      action={
        <div className="space-y-3">
          {newGame("xl", true)}
          {failure}
        </div>
      }
      mobileAction={
        <>
          {saved && <p className="mb-2 text-xs text-muted-foreground">{savedLine}</p>}
          <div className="flex gap-2">
            {saved && (
              <Button size="lg" className="flex-1" onClick={onResume}>
                <Play /> Resume
              </Button>
            )}
            {newGame("lg", false)}
          </div>
          {failure && <div className="mt-2">{failure}</div>}
        </>
      }
    />
  );
}
