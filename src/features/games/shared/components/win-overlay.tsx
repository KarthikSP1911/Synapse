"use client";

import { useEffect, useId, useRef } from "react";
import { Eye, RotateCcw, SlidersHorizontal, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { accentStyle } from "@/components/common/accent-tile";
import type { SaveState } from "@/features/games/shared/components/result-parts";
import { DIFFICULTY_LABEL, formatTime, type ScoreBreakdown } from "@/features/games/shared/lib/puzzle-session";
import type { PuzzleRecord } from "@/features/games/shared/lib/puzzle-stats";
import type { AccentId } from "@/lib/accent";

/** Confetti pieces: fixed positions, delays and colours, so the render is the same every time (no randomness in render). */
const PIECES = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 29 + 7) % 100,
  delay: ((i * 53) % 90) / 100,
  duration: 1.6 + ((i * 37) % 14) / 10,
  drift: ((i * 17) % 41) - 20,
  spin: 180 + ((i * 71) % 540),
  tone: i % 4,
}));

/**
 * The celebration after a puzzle is solved: a card over the solved board with confetti, the time, the score and
 * whether it is a new best, and the ways on. The game is already saved when this appears. "View board" closes it
 * to look at the finished board. Confetti and the pop-in are switched off for people who prefer reduced motion.
 */
export function WinOverlay({
  accent,
  noun,
  data,
  score,
  newBestTime,
  newBestScore,
  firstSolve,
  saveState,
  onPlayAgain,
  onChangeDifficulty,
  onDetails,
  onClose,
}: {
  accent: AccentId;
  noun: string;
  data: PuzzleRecord;
  score: ScoreBreakdown;
  newBestTime: boolean;
  newBestScore: boolean;
  /** The first solved puzzle at this difficulty. */
  firstSolve: boolean;
  saveState: SaveState;
  onPlayAgain: () => void;
  onChangeDifficulty: () => void;
  onDetails: () => void;
  /** Hides the card to look at the solved board. */
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const label = DIFFICULTY_LABEL[data.difficulty];
  const record = firstSolve ? `First ${label.toLowerCase()} ${noun} solved` : newBestTime ? "New best time" : newBestScore ? "New best score" : null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="win-dialog"
      style={accentStyle(accent)}
    >
      <div className="win-confetti" aria-hidden>
        {PIECES.map((p, i) => (
          <span key={i} data-tone={p.tone} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, "--drift": `${p.drift}vw`, "--spin": `${p.spin}deg` } as React.CSSProperties} />
        ))}
      </div>

      <div className="win-card">
        <span className="win-trophy" aria-hidden>
          <Trophy className="size-7" />
        </span>
        <h2 id={`${id}-title`} className="mt-3 text-2xl font-semibold tracking-tight">
          You won!
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {label} {noun} solved{data.hintsUsed === 0 ? " on your own" : ` with ${data.hintsUsed} ${data.hintsUsed === 1 ? "hint" : "hints"}`}.
        </p>

        {record && (
          <p role="status" className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-3 py-1 text-xs font-medium text-success">
            <Trophy className="size-3.5" aria-hidden /> {record}
          </p>
        )}

        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-secondary px-2 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Time</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{formatTime(data.elapsedMs)}</dd>
          </div>
          <div className="rounded-lg bg-secondary px-2 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Score</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{score.total.toLocaleString()}</dd>
          </div>
          <div className="rounded-lg bg-secondary px-2 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Hints</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{data.hintsUsed}</dd>
          </div>
        </dl>

        <div className="mt-6 grid gap-2">
          <Button size="lg" onClick={onPlayAgain} autoFocus>
            <RotateCcw /> Play again
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onChangeDifficulty}>
              <SlidersHorizontal /> Difficulty
            </Button>
            <Button variant="outline" onClick={onClose}>
              <Eye /> View board
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onDetails}>
            Score breakdown
          </Button>
        </div>
        {saveState === "failed" && <p className="mt-3 text-xs text-warning">This game could not be saved: the browser&apos;s storage is full or blocked.</p>}
      </div>
    </dialog>
  );
}
