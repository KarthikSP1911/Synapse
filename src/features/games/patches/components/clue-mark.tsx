import { memo } from "react";
import { describeClue } from "@/features/games/patches/lib/puzzle-format";
import type { Clue } from "@/features/games/patches/lib/types";

/** The small bent-shape symbol on a freeform clue, drawn from plain outlines (nothing borrowed). */
function FreeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
      <path d="M2 1.8h4.4v3.4H10v5H5.6V7H2z" />
    </svg>
  );
}

/**
 * What a clue cell shows, as in the paper puzzle: a solid badge in the clue's own colour whose outline is the shape it
 * asks for (a square, a wide rectangle, a tall rectangle), with the area as a white number inside when it gives one. A clue
 * that says no shape and no area is a hatched square: any rectangle. Until its patch is drawn the badge sits in a dashed,
 * tinted halo of the same colour; once it is drawn the halo gives way to the patch. The state is never told by colour
 * alone: the shape, the number, the dashes and the "!" mark all say it too.
 */
export const ClueMark = memo(function ClueMark({
  clue,
  color,
  placed,
  conflict,
  hinted,
  entering,
  celebrate,
}: {
  clue: Clue;
  /** The clue's own colour (0 to 9). */
  color: number;
  placed: boolean;
  /** No patch can serve this clue any more. */
  conflict: boolean;
  hinted: boolean;
  /** Delay (ms) before the clue pops as its patch settles, or null when it does not. */
  entering: number | null;
  celebrate: boolean;
}) {
  // A clue with only an area is a patch of that many cells in any rectangle: the badge is a plain square.
  const badge = clue.shape === "wide" || clue.shape === "tall" || clue.shape === "free" ? clue.shape : clue.area === null && clue.shape === null ? "any" : "square";
  return (
    <span
      className="pt-clue"
      data-c={color >= 0 ? color : undefined}
      data-placed={placed ? "true" : undefined}
      data-conflict={conflict ? "true" : undefined}
      data-hint={hinted ? "true" : undefined}
      data-enter={entering !== null ? "" : undefined}
      data-celebrate={celebrate ? "" : undefined}
      style={entering !== null ? ({ "--cd": `${entering}ms` } as React.CSSProperties) : undefined}
      role="img"
      aria-label={`Clue: ${describeClue(clue)}${placed ? ", placed" : ""}${conflict ? ", no room left" : ""}`}
    >
      <span className="pt-halo" />
      <span className="pt-badge" data-badge={badge}>
        {clue.shape === "free" && <FreeGlyph className="pt-glyph" />}
        {clue.area !== null && <span className="pt-num">{clue.area}</span>}
      </span>
    </span>
  );
});
