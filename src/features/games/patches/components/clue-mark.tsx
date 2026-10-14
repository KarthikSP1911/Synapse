import { memo } from "react";
import { describeClue } from "@/features/games/patches/lib/puzzle-format";
import type { Clue, Shape } from "@/features/games/patches/lib/types";

/** The symbol of a shape category, drawn from plain outlines (nothing borrowed): a square, a wide and a tall rectangle, and a bent freeform shape. */
export function ShapeGlyph({ shape, className }: { shape: Shape; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden>
      {shape === "square" && <rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1.2" />}
      {shape === "wide" && <rect x="0.9" y="3.4" width="10.2" height="5.2" rx="1.2" />}
      {shape === "tall" && <rect x="3.4" y="0.9" width="5.2" height="10.2" rx="1.2" />}
      {shape === "free" && <path d="M2 1.8h4.4v3.4H10v5H5.6V7H2z" />}
    </svg>
  );
}

/**
 * What a clue cell shows: its area as a number, its shape as a symbol, both, or (for a clue that says neither) a
 * plain dot. The state is told by the outline and fill as well as by colour: a placed clue is solid, one with no room
 * left is dashed and marked.
 */
export const ClueMark = memo(function ClueMark({
  clue,
  placed,
  conflict,
  hinted,
  entering,
  celebrate,
}: {
  clue: Clue;
  placed: boolean;
  conflict: boolean;
  hinted: boolean;
  /** Delay (ms) before the clue pops as its patch settles, or null when it does not. */
  entering: number | null;
  celebrate: boolean;
}) {
  const kind = clue.area !== null && clue.shape !== null ? "both" : clue.area !== null ? "area" : clue.shape !== null ? "shape" : "none";
  return (
    <span
      className="pt-clue"
      data-kind={kind}
      data-placed={placed ? "true" : undefined}
      data-conflict={conflict ? "true" : undefined}
      data-hint={hinted ? "true" : undefined}
      data-enter={entering !== null ? "" : undefined}
      data-celebrate={celebrate ? "" : undefined}
      style={entering !== null ? ({ "--cd": `${entering}ms` } as React.CSSProperties) : undefined}
      role="img"
      aria-label={`Clue: ${describeClue(clue)}${placed ? ", placed" : ""}${conflict ? ", no room left" : ""}`}
    >
      {clue.area !== null && <span className="pt-num">{clue.area}</span>}
      {clue.shape !== null && <ShapeGlyph shape={clue.shape} className="pt-glyph" />}
      {kind === "none" && <span className="pt-dot" />}
    </span>
  );
});
