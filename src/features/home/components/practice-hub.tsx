"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useLocalStore } from "@/features/auth/components/viewer-provider";
import { guestSkillSummaries } from "@/features/offline/lib/guest/progress";
import { scoreSession } from "@/features/games/mindsprint/lib/scoring";
import { loadHistory as loadMindsprintHistory } from "@/features/games/mindsprint/lib/storage";
import { computeAllStats as computeAllRecallStats } from "@/features/games/recall/lib/stats";
import { loadHistory as loadRecallHistory } from "@/features/games/recall/lib/storage";
import { computeStats as computeStats2048 } from "@/features/games/game2048/lib/stats";
import { loadBest as load2048Best, loadGame as load2048Game, loadHistory as load2048History } from "@/features/games/game2048/lib/storage";
import { DIFFICULTY_LABEL } from "@/features/games/sudoku/lib/types";
import { loadGame as loadSudokuGame, loadHistory as loadSudokuHistory } from "@/features/games/sudoku/lib/storage";
import { computeStats as computeQueensStats } from "@/features/games/queens/lib/stats";
import { loadGame as loadQueensGame, loadHistory as loadQueensHistory } from "@/features/games/queens/lib/storage";
import { computeStats as computeZipStats } from "@/features/games/zip/lib/stats";
import { loadGame as loadZipGame, loadHistory as loadZipHistory } from "@/features/games/zip/lib/storage";
import { computeStats as computePatchesStats } from "@/features/games/patches/lib/stats";
import { loadGame as loadPatchesGame, loadHistory as loadPatchesHistory } from "@/features/games/patches/lib/storage";
import { computeStats as computeNbackStats, hubSummary as nbackSummary } from "@/features/games/nback/lib/stats";
import { loadHistory as loadNbackHistory } from "@/features/games/nback/lib/storage";
import { DIFFICULTIES } from "@/features/games/shared/lib/puzzle-session";
import { loadGuestData } from "@/features/offline/lib/guest/storage";
import { SKILL_META, SKILL_ORDER } from "@/features/skills/lib/meta";
import { skillHref } from "@/features/skills/lib/routes";
import type { Skill } from "@/features/skills/lib/types";
import type { SkillSummary } from "@/features/progress/server/progress-queries";
import { AccentTile, accentStyle } from "@/components/common/accent-tile";
import type { AccentId } from "@/lib/accent";

/** A card on the hub: a skill or a game. Each one opens its own page. */
function HubCard({
  href,
  title,
  description,
  accent,
  progress,
  due = 0,
}: {
  href: string;
  title: string;
  description: string;
  accent: AccentId;
  progress: string;
  /** Reviews that are due; shown beside the icon when above zero. */
  due?: number;
}) {
  return (
    <Link
      href={href}
      data-accent-host
      style={accentStyle(accent)}
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left shadow-card transition-[color,background-color,border-color,transform,translate,scale,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-6px_color-mix(in_oklab,var(--accent)_45%,transparent)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <AccentTile id={accent} />
        {due > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">{due} due</span>}
      </span>
      <span>
        <span className="accent-label block text-[15px] font-semibold tracking-tight">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground dark:text-muted-foreground/75">{description}</span>
      </span>
      <span className="mt-auto font-mono text-xs tabular-nums text-muted-foreground">{progress}</span>
    </Link>
  );
}

/** Best results in each game, read from this device after mount (null until then, and when a game has not been played). */
interface GameProgress {
  mindsprint: string | null;
  recall: string | null;
  sudoku: string | null;
  game2048: string | null;
  queens: string | null;
  zip: string | null;
  patches: string | null;
  nback: string | null;
}

/** "Best score 1,234" over every difficulty, or a note when nothing has been solved yet; null when never played. */
function puzzleProgress(stats: { attempted: number; byDifficulty: Record<(typeof DIFFICULTIES)[number], { bestScore: number }> }, unfinished: boolean): string | null {
  const best = Math.max(...DIFFICULTIES.map((d) => stats.byDifficulty[d].bestScore));
  if (best > 0) return `Best score ${best.toLocaleString()}`;
  if (unfinished) return "Game in progress";
  return stats.attempted > 0 ? "No puzzle solved yet" : null;
}

function useGameProgress(): GameProgress {
  const store = useLocalStore();
  const [progress, setProgress] = useState<GameProgress>({ mindsprint: null, recall: null, sudoku: null, game2048: null, queens: null, zip: null, patches: null, nback: null });

  useEffect(() => {
    if (!store) return;
    const timer = setTimeout(() => {
      const scores = loadMindsprintHistory(store).map((s) => scoreSession(s.rounds).score);
      const recall = computeAllRecallStats(loadRecallHistory(store));
      const longest = (["single", "pair"] as const).filter((m) => recall[m].longestRecalled > 0).map((m) => `${recall[m].longestRecalled} ${m === "single" ? "digits" : "pairs"}`);
      const sudokuGames = loadSudokuHistory(store);
      const unfinished = loadSudokuGame(store);
      const solved = sudokuGames.filter((g) => g.completed).length;
      const games2048 = computeStats2048(load2048History(store));
      const best2048 = Math.max(load2048Best(store) ?? 0, games2048.highScore);
      const queensSaved = loadQueensGame(store);
      const zipSaved = loadZipGame(store);
      const patchesSaved = loadPatchesGame(store);
      setProgress({
        queens: puzzleProgress(computeQueensStats(loadQueensHistory(store), queensSaved?.difficulty ?? null), queensSaved !== null),
        zip: puzzleProgress(computeZipStats(loadZipHistory(store), zipSaved?.difficulty ?? null), zipSaved !== null),
        patches: puzzleProgress(computePatchesStats(loadPatchesHistory(store), patchesSaved?.difficulty ?? null), patchesSaved !== null),
        nback: nbackSummary(computeNbackStats(loadNbackHistory(store))),
        game2048: best2048 > 0 ? `Best ${best2048.toLocaleString()} · tile ${games2048.bestTile || "—"}` : load2048Game(store) ? "Game in progress" : games2048.gamesPlayed > 0 ? "No score yet" : null,
        sudoku: unfinished ? `${DIFFICULTY_LABEL[unfinished.difficulty]} game in progress` : solved > 0 ? `${solved.toLocaleString()} solved · ${Math.floor((solved * 100) / sudokuGames.length)}% completed` : sudokuGames.length > 0 ? "No puzzle solved yet" : null,
        mindsprint: scores.length > 0 ? `Best score ${Math.max(...scores).toLocaleString()}` : null,
        recall: recall.single.sessions + recall.pair.sessions > 0 ? (longest.length > 0 ? `Longest recall ${longest.join(" · ")}` : "No perfect recall yet") : null,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [store]);

  return progress;
}

function GamesRow() {
  const progress = useGameProgress();
  return (
    <section id="games" aria-labelledby="games-heading" className="scroll-mt-20 space-y-3">
      <h2 id="games-heading" className="text-sm font-medium text-muted-foreground">
        Games
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HubCard href="/games/mindsprint" title="MindSprint" accent="mindsprint" description="Numbers flash by. Calculate in your head, then give the result." progress={progress.mindsprint ?? "Not played yet"} />
        <HubCard href="/games/recall" title="Number Recall" accent="recall" description="Memorise digits or number pairs, then type them back in order." progress={progress.recall ?? "Not played yet"} />
        <HubCard href="/games/sudoku" title="Sudoku" accent="sudoku" description="Fill the grid so every row, column and box holds 1 to 9." progress={progress.sudoku ?? "Not played yet"} />
        <HubCard href="/games/2048" title="2048" accent="game2048" description="Slide and merge matching tiles to reach 2048." progress={progress.game2048 ?? "Not played yet"} />
        <HubCard href="/games/queens" title="Queens" accent="queens" description="Place queens using logic so every row, column and colored region satisfies the rules." progress={progress.queens ?? "Not played yet"} />
        <HubCard href="/games/zip" title="Zip" accent="zip" description="Connect numbered checkpoints with one continuous path that fills the entire grid." progress={progress.zip ?? "Not played yet"} />
        <HubCard href="/games/patches" title="Patches" accent="patches" description="Divide the grid into patches that each hold one clue and match its area and shape." progress={progress.patches ?? "Not played yet"} />
        <HubCard href="/games/n-back" title="N-Back" accent="nback" description="Spot when a position, color or letter matches the one from n steps back." progress={progress.nback ?? "Not played yet"} />
      </div>
    </section>
  );
}

/** The home screen: a card for each skill and game. Every card opens its own page; the options live there. */
export default function PracticeHub({
  summaries = null,
}: {
  /** The account's figures as of the last page load; the on-device copy replaces them once it has history. */
  summaries?: Record<Skill, SkillSummary> | null;
}) {
  const store = useLocalStore();
  const [localSummaries, setLocalSummaries] = useState<Record<Skill, SkillSummary> | null>(null);

  // A guest's figures are always the device's. An account's are too once the device holds its history.
  useEffect(() => {
    if (!store) return;
    const timer = setTimeout(() => {
      const data = loadGuestData(store.key);
      if (!store.syncable || Object.keys(data.stats).length > 0) setLocalSummaries(guestSkillSummaries(data));
    }, 0);
    return () => clearTimeout(timer);
  }, [store]);

  const shown = localSummaries ?? summaries;

  return (
    <div className="space-y-6">
      <section aria-labelledby="skills-heading" className="space-y-3">
        <h2 id="skills-heading" className="text-sm font-medium text-muted-foreground">
          Skills
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SKILL_ORDER.map((id) => {
          const summary = shown?.[id];
          return (
            <HubCard
              key={id}
              href={skillHref(id)}
              title={SKILL_META[id].title}
              description={SKILL_META[id].description}
              accent={id}
              due={summary?.due ?? 0}
              progress={summary && summary.attempts > 0 ? `${summary.attempts.toLocaleString()} answered · ${summary.accuracy}%` : "Not started yet"}
            />
          );
        })}
        </div>
      </section>
      <GamesRow />
    </div>
  );
}
