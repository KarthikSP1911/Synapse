import { memo } from "react";
import { ACCENT } from "@/lib/accent";
import { cellGap } from "@/features/games/nback/lib/geometry";
import { describeStimulus, type Stimulus } from "@/features/games/nback/lib/stimuli";

/**
 * The board: a square grid with at most one lit cell. A lit cell shows the trial's colour and letter; with Color off
 * it uses the game's accent, with Letter off it holds no letter. Nothing here animates the stimulus, so it appears
 * and disappears in the same frame the runner says so. The board only draws what it is given: it never decides
 * anything about scoring.
 */
function BoardView({ grid, stimulus, empty = false }: { grid: number; stimulus: Stimulus | null; empty?: boolean }) {
  const lit = stimulus && !empty ? stimulus : null;
  return (
    <div
      data-timer-clear
      className="nb-board"
      role="img"
      aria-label={lit ? `${grid} by ${grid} board. ${describeStimulus(lit, grid)}.` : `${grid} by ${grid} board, no stimulus`}
      style={{ "--nb-n": grid, "--nb-gap": `${cellGap(grid)}px`, "--nb-accent": ACCENT.nback } as React.CSSProperties}
    >
      <div className="nb-grid" aria-hidden>
        {Array.from({ length: grid * grid }, (_, cell) => {
          const isLit = lit !== null && lit.cell === cell;
          return (
            <div key={cell} className="nb-cell" data-lit={isLit || undefined} style={isLit ? { background: lit.color?.fill ?? "var(--nb-accent)", color: lit.color?.ink ?? "#111111" } : undefined}>
              {isLit && lit.letter && <span className="nb-letter">{lit.letter}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const Board = memo(BoardView);
