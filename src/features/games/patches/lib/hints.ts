import { describeClue, placeName } from "./puzzle-format";
import { modelFor, puzzleFor } from "./game";
import { cloneState, loadPatches, lookahead, propagate, type Model, type State, type Step } from "./solver";
import type { GameState, Hint, Patch } from "./types";

/**
 * Hints for Patches. They are worked out from the board as it stands and checked against the one solution, so a hint
 * never points somewhere the answer is not. From the cheapest kind of help to the strongest:
 *
 *   wrong   a patch that is not part of the solution, with the reason when the board shows one;
 *   focus   a clue that is easy to place right now: the only place it can go, or a cell only it can reach
 *           (and, when nothing is that easy, the clue with the fewest ways left after trying each placement);
 *   reveal  asked for by pressing Hint again with the board unchanged: the exact cells of that clue's patch.
 *
 * A hint shows its cells and never places anything; the player still draws the patch. Each one that is given counts
 * as a hint used; when there is nothing to point at, `giveHint` returns the state unchanged, which is how the caller
 * knows not to charge for it.
 */

const solutionCells = (state: GameState, clue: number): number[] => {
  const cells: number[] = [];
  state.solution.forEach((owner, cell) => {
    if (owner === clue) cells.push(cell);
  });
  return cells;
};

const same = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((cell, i) => cell === b[i]);

/** The placed patches that are not the solution's patch for their clue. */
export function wrongPatches(state: Pick<GameState, "patches" | "solution">): Patch[] {
  return state.patches.filter((patch) => {
    const mine = [...patch.cells].sort((a, b) => a - b);
    const theirs: number[] = [];
    state.solution.forEach((owner, cell) => {
      if (owner === patch.clue) theirs.push(cell);
    });
    return !same(mine, theirs);
  });
}

/** The patches placed, in a model that also knows the ones drawn at the wrong size. */
const stateWith = (model: Model, patches: readonly Patch[]): { model: Model; state: State } => loadPatches(model, patches);

/** Why a wrong patch cannot stand, when following the clues from the board shows it. */
function whyWrong(state: GameState, model: Model, wrong: Patch): string {
  const cols = puzzleFor(state.puzzle).cols;
  const others = wrongPatches(state);
  const right = state.patches.filter((p) => p === wrong || !others.includes(p));
  const loaded = stateWith(model, right);
  const result = propagate(loaded.model, loaded.state);
  const clue = puzzleFor(state.puzzle).clues[wrong.clue];
  const head = `The patch around the clue at ${placeName(clue.cell, cols)} is not part of the solution.`;
  if (!result.ok && result.dead) {
    if (result.dead.kind === "clue") return `${head} With it, the clue at ${placeName(puzzleFor(state.puzzle).clues[result.dead.clue].cell, cols)} would have no room for its patch.`;
    return `${head} With it, the cell at ${placeName(result.dead.cell, cols)} could not be covered by any patch.`;
  }
  return `${head} The puzzle has exactly one answer, and this patch does not fit it.`;
}

function focusFor(state: GameState, model: Model): { clue: number; cells: number[]; text: string } | null {
  const puzzle = puzzleFor(state.puzzle);
  const { cols } = puzzle;
  const loaded = stateWith(model, state.patches);
  const s = loaded.state;
  const steps: Step[] = [];
  if (!propagate(loaded.model, s, steps).ok || (s.left === 0 && steps.length === 0)) return null;

  const first = steps[0];
  if (first) {
    const clue = puzzle.clues[first.clue];
    if (first.kind === "cell" && first.cell !== null) {
      return {
        clue: first.clue,
        cells: [first.cell, clue.cell],
        text: `The cell at ${placeName(first.cell, cols)} can only be reached by the patch of the clue at ${placeName(clue.cell, cols)} (${describeClue(clue)}).`,
      };
    }
    return { clue: first.clue, cells: [clue.cell], text: `The clue at ${placeName(clue.cell, cols)} (${describeClue(clue)}) has only one place left to go.` };
  }

  // Nothing follows directly: try each placement and see which ones fail.
  const trial = cloneState(s);
  if (lookahead(loaded.model, trial) < 0) return null;
  let target = -1;
  for (let i = 0; i < trial.placed.length; i++) {
    if (trial.placed[i] < 0 && (target < 0 || trial.live[i].length < trial.live[target].length)) target = i;
  }
  if (target < 0) return null;
  const clue = puzzle.clues[target];
  const options = trial.live[target].length;
  const tried = options < s.live[target].length;
  return {
    clue: target,
    cells: [clue.cell],
    text: tried
      ? `Look at the clue at ${placeName(clue.cell, cols)} (${describeClue(clue)}). Most ways to place it leave another clue with no room, so only ${options} ${options === 1 ? "way is" : "ways are"} left.`
      : `Start with the clue at ${placeName(clue.cell, cols)} (${describeClue(clue)}). It has the fewest ways left to be placed: ${options}.`,
  };
}

/** One press of the Hint button; the state comes back unchanged when there is no hint to give. */
export function giveHint(state: GameState): GameState {
  if (state.status !== "playing") return state;
  const model = modelFor(state.puzzle);
  const puzzle = puzzleFor(state.puzzle);
  const given = (hint: Hint): GameState => ({ ...state, hint, hintsUsed: state.hintsUsed + 1 });

  const wrong = wrongPatches(state)[0];
  if (wrong && state.hint?.kind === "wrong" && state.hint.clue === wrong.clue) return state;
  if (wrong) return given({ kind: "wrong", clue: wrong.clue, cells: wrong.cells, text: whyWrong(state, model, wrong) });

  const placed = (clue: number) => state.patches.some((p) => p.clue === clue);
  const before = state.hint;
  if (before && before.kind === "focus" && !placed(before.clue)) {
    const cells = solutionCells(state, before.clue);
    const where = placeName(puzzle.clues[before.clue].cell, puzzle.cols);
    return given({ kind: "reveal", clue: before.clue, cells, text: `This is the patch for the clue at ${where}: ${cells.length} ${cells.length === 1 ? "cell" : "cells"}. Draw it to place it.` });
  }
  // Already showing the whole patch: there is nothing more to give until the board changes.
  if (before && before.kind === "reveal") return state;

  const focus = focusFor(state, model);
  if (!focus) return state;
  return given({ kind: "focus", clue: focus.clue, cells: focus.cells, text: focus.text });
}

export interface Delivery {
  state: GameState;
  /** given: the hint is on the board; none: there was nothing to point at (nothing charged); refused: the price could not be paid (no hint shown). */
  outcome: "given" | "none" | "refused";
}

/**
 * The whole of a hint request, in the order that keeps it fair. The hint is worked out first, with no side effects.
 * If there is none, nothing is charged and no cooldown starts. Otherwise `pay` takes the price (the wallet checks its
 * cooldown and balance in that same step, see `usePaidHint`), and the hint is shown only if that succeeded. A refused
 * payment leaves the game exactly as it was: no hint, no hint counted.
 */
export function deliverHint(state: GameState, pay: (ordinal: number) => { ok: boolean }): Delivery {
  const next = giveHint(state);
  if (next.hintsUsed === state.hintsUsed) return { state, outcome: "none" };
  return pay(next.hintsUsed).ok ? { state: next, outcome: "given" } : { state, outcome: "refused" };
}
