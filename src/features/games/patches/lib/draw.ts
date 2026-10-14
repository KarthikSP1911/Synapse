import { clueAt } from "./rules";
import { rectangleBetween } from "./shapes";
import type { PatchesPuzzle } from "./types";

/**
 * Drawing a patch, as a small state machine on plain data. The board component turns pointer and key events into
 * these calls and only renders the result; nothing here is committed to the game until the player lets go (see
 * `commitPatch` in game.ts), so a half-drawn patch can always be thrown away.
 *
 *   rectangle  press on any free cell and drag to the opposite corner (squares, wide and tall rectangles, and any
 *              clue that does not say freeform)
 *   freeform   press on the clue of a freeform patch and paint across the cells it should take
 */

export type Draft =
  | { mode: "rect"; anchor: number; head: number }
  | {
      mode: "free";
      /** The cells painted so far, in the order they were touched. */
      cells: number[];
      head: number;
    };

/** Starts a draft on a cell; null when the cell already belongs to a patch (a patch cannot be drawn over). */
export function beginDraft(puzzle: PatchesPuzzle, owner: Int16Array, cell: number): Draft | null {
  if (owner[cell] >= 0) return null;
  const clue = clueAt(puzzle)[cell];
  if (clue >= 0 && puzzle.clues[clue].shape === "free") return { mode: "free", cells: [cell], head: cell };
  return { mode: "rect", anchor: cell, head: cell };
}

/** The pointer (or the keyboard cursor) reached `cell`. The same draft comes back when nothing changed. */
export function extendDraft(draft: Draft, owner: Int16Array, cell: number): Draft {
  if (draft.mode === "rect") return draft.head === cell ? draft : { ...draft, head: cell };
  // Painting skips cells that belong to a patch, and carries on across the rest.
  if (owner[cell] >= 0) return draft;
  if (draft.cells.includes(cell)) return draft.head === cell ? draft : { ...draft, head: cell };
  return { mode: "free", cells: [...draft.cells, cell], head: cell };
}

/** The cells a draft covers, in index order. */
export function draftCells(draft: Draft, cols: number): number[] {
  return draft.mode === "rect" ? rectangleBetween(draft.anchor, draft.head, cols) : [...draft.cells].sort((a, b) => a - b);
}

/** The cell the player pressed first. */
export const draftStart = (draft: Draft): number => (draft.mode === "rect" ? draft.anchor : draft.cells[0]);
