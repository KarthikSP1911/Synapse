import { clueIndexByCell, describeClue, placeName } from "./puzzle-format";
import { fitsShape, isConnected } from "./shapes";
import type { Clue, Patch, PatchesPuzzle } from "./types";

/**
 * The rules of the game as checks on plain data: is this set of cells a valid patch, and is this board solved. The
 * board check uses the very same patch check as drawing does, so what the player is allowed to place and what counts
 * as a solution cannot disagree. Neither looks at the hidden solution; they only apply the clues.
 */

const clueAtCache = new WeakMap<PatchesPuzzle, Int16Array>();

/** For every cell, the index of the clue on it, or -1 (cached per puzzle: drawing asks on every pointer move). */
export function clueAt(puzzle: PatchesPuzzle): Int16Array {
  let at = clueAtCache.get(puzzle);
  if (!at) {
    at = clueIndexByCell(puzzle);
    clueAtCache.set(puzzle, at);
  }
  return at;
}

/** For every cell, the clue of the patch that covers it, or -1. */
export function ownerMap(patches: readonly Patch[], cellCount: number): Int16Array {
  const owner = new Int16Array(cellCount).fill(-1);
  for (const patch of patches) for (const cell of patch.cells) owner[cell] = patch.clue;
  return owner;
}

/** The clues whose patches the cells would cover, in order of first appearance. */
export function overlappedClues(owner: Int16Array, cells: readonly number[]): number[] {
  const clues: number[] = [];
  for (const cell of cells) if (owner[cell] >= 0 && !clues.includes(owner[cell])) clues.push(owner[cell]);
  return clues;
}

/** A copy of the owner map with the given patches taken off. */
export function ownerWithout(owner: Int16Array, clues: readonly number[]): Int16Array {
  if (clues.length === 0) return owner;
  const next = owner.slice();
  for (let cell = 0; cell < next.length; cell++) if (clues.includes(next[cell])) next[cell] = -1;
  return next;
}

export type Reason = "empty" | "overlap" | "no-clue" | "many-clues" | "disconnected" | "shape" | "area";

export interface DraftCheck {
  ok: boolean;
  /** The clue the patch would belong to, when it holds exactly one. */
  clue: number | null;
  reason: Reason | null;
  /** Why the patch is refused, or a short description of it when it is fine. */
  message: string;
}

const shapeWords = (clue: Clue): string =>
  clue.shape === "square"
    ? "needs a square: as wide as it is tall"
    : clue.shape === "wide"
      ? "needs a wide rectangle: wider than it is tall"
      : clue.shape === "tall"
        ? "needs a tall rectangle: taller than it is wide"
        : "needs a rectangle (only a clue with the freeform symbol takes other shapes)";

/**
 * Whether `cells` can be placed as a patch on a board where `owner` says which cells are already taken. The first
 * rule broken is the one reported: overlap, then the number of clues, then connection, shape and area.
 */
export function checkDraft(puzzle: PatchesPuzzle, owner: Int16Array, cells: readonly number[]): DraftCheck {
  const fail = (reason: Reason, message: string, clue: number | null = null): DraftCheck => ({ ok: false, clue, reason, message });
  if (cells.length === 0) return fail("empty", "Drag across the board to draw a patch.");
  const at = clueAt(puzzle);
  if (cells.some((cell) => owner[cell] >= 0)) return fail("overlap", "That would cover cells that already belong to another patch.");

  const inside = cells.map((cell) => at[cell]).filter((i) => i >= 0);
  if (inside.length === 0) return fail("no-clue", "A patch needs exactly one clue inside it, and this one has none.");
  if (inside.length > 1) return fail("many-clues", `A patch holds exactly one clue, and this one covers ${inside.length}.`);
  const index = inside[0];
  const clue = puzzle.clues[index];
  const where = placeName(clue.cell, puzzle.cols);

  if (!isConnected(cells, puzzle.cols)) return fail("disconnected", "Every cell of a patch must touch another along an edge. Corners do not count.", index);
  if (!fitsShape(clue.shape, cells, puzzle.cols)) {
    return fail("shape", `The clue at ${where} ${shapeWords(clue)}.`, index);
  }
  if (clue.area !== null && cells.length !== clue.area) {
    return fail("area", `The clue at ${where} needs ${clue.area} ${clue.area === 1 ? "cell" : "cells"}, but this patch has ${cells.length}.`, index);
  }
  const what = describeClue(clue);
  return { ok: true, clue: index, reason: null, message: `${cells.length} ${cells.length === 1 ? "cell" : "cells"} · fits the clue at ${where} (${what})` };
}

export interface BoardCheck {
  solved: boolean;
  /** Cells no patch covers. */
  uncovered: number;
  /** What is wrong, in words; empty when the patches themselves are all fine. */
  problems: string[];
}

/**
 * Whether the patches divide the board correctly: each one valid for its own clue, none overlapping, every clue used
 * once and every cell covered. This is the single definition of "solved".
 */
export function validateBoard(puzzle: PatchesPuzzle, patches: readonly Patch[]): BoardCheck {
  const n = puzzle.rows * puzzle.cols;
  const none = new Int16Array(n).fill(-1);
  const owner = new Int16Array(n).fill(-1);
  const used = new Set<number>();
  const problems: string[] = [];
  for (const patch of patches) {
    const check = checkDraft(puzzle, none, patch.cells);
    if (!check.ok) problems.push(check.message);
    else if (check.clue !== patch.clue) problems.push("A patch is filed under the wrong clue.");
    if (used.has(patch.clue)) problems.push("A clue has more than one patch.");
    used.add(patch.clue);
    for (const cell of patch.cells) {
      if (owner[cell] >= 0) problems.push("Two patches share a cell.");
      owner[cell] = patch.clue;
    }
  }
  let uncovered = 0;
  for (let cell = 0; cell < n; cell++) if (owner[cell] < 0) uncovered++;
  const solved = problems.length === 0 && uncovered === 0 && used.size === puzzle.clues.length;
  return { solved, uncovered, problems };
}
