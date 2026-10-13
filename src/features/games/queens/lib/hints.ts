import { hintStep, type Step } from "./deduce";
import { REGION_NAMES, colOf, rowOf, type Board } from "./grid";
import { HINTED, QUEEN, CROSS, type Conflict, type Hint, type Mark } from "./types";

/** Turns the solver's steps into hints a player can follow. Pure; the game state decides when each hint is shown. */

const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "row 3", "column 2", "the blue region". */
export function unitName(id: string): string {
  const index = Number(id.slice(1));
  if (id[0] === "r") return `row ${index + 1}`;
  if (id[0] === "c") return `column ${index + 1}`;
  return `the ${REGION_NAMES[index]} region`;
}

const list = (ids: readonly string[]): string => {
  const names = ids.map(unitName);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

function explain(step: Step): string {
  switch (step.technique) {
    case "single":
      return `${cap(unitName(step.from[0]))} has only one place left for its queen.`;
    case "confine":
      return step.from.length === 1
        ? `${cap(list(step.from))} lies entirely inside ${list(step.into)}, so no other cell of ${list(step.into)} can hold a queen.`
        : `${cap(list(step.from))} fit only inside ${list(step.into)}. Together they use up those ${step.into.length} queens, so no other cell there can hold one.`;
    case "wipeout":
      return "A queen on the marked cell would leave a row, column or region with nowhere to put its queen.";
    default:
      return "A queen on the marked cell leads to a contradiction a few steps later, so it cannot go there.";
  }
}

/** A queen of the player's that is not in the solution (hinted queens are always right), as the first such cell. */
export function wrongQueen(cells: readonly Mark[], solution: string, n: number): number | null {
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === QUEEN && String(colOf(i, n)) !== solution[rowOf(i, n)]) return i;
  }
  return null;
}

/** The hint that points at a wrong queen. */
export function wrongQueenHint(index: number, n: number): Hint {
  return {
    kind: "wrong",
    units: [],
    cells: [index],
    eliminate: [],
    queen: null,
    text: `The queen in row ${rowOf(index, n) + 1}, column ${colOf(index, n) + 1} is not part of the solution.`,
  };
}

/**
 * The first step of a fresh hint: the reason, built from the queens the player has placed correctly (their
 * cross-outs are ignored, since they may be mistakes), skipping any elimination they have already made.
 * Falls back to revealing a queen directly if the logic cannot find a next move.
 */
export function startHint(board: Board, cells: readonly Mark[], solution: string): Hint {
  const { n } = board;
  const queens: number[] = [];
  const crossed = new Set<number>();
  cells.forEach((m, i) => {
    if ((m === QUEEN || m === HINTED) && String(colOf(i, n)) === solution[rowOf(i, n)]) queens.push(i);
    else if (m === CROSS) crossed.add(i);
  });
  const found = hintStep(board, queens, crossed);
  if (!found) {
    const row = Array.from({ length: n }, (_, r) => r).find((r) => !queens.includes(r * n + Number(solution[r]))) ?? 0;
    const queen = row * n + Number(solution[row]);
    return { kind: "reason", units: [`r${row}`], cells: [], eliminate: [], queen, text: `Row ${row + 1} still needs its queen.` };
  }
  const { step, queen } = found;
  const units = [...step.from, ...step.into];
  return {
    kind: "reason",
    units,
    cells: [],
    eliminate: step.place !== null ? [] : step.eliminate.filter((c) => !crossed.has(c)),
    queen: queen ?? step.place,
    text: explain(step),
  };
}

/** The next stage of a hint: reason, then the cells it is about, then the queen. Null once the queen is placed. */
export function advanceHint(hint: Hint): Hint | null {
  if (hint.kind === "reason") {
    const cells = hint.eliminate.length > 0 ? hint.eliminate : hint.queen !== null ? [hint.queen] : [];
    return { ...hint, kind: "cells", cells, text: `${hint.text} ${hint.eliminate.length > 0 ? "Cross out the marked cells." : "The queen goes in the marked cell."}` };
  }
  if (hint.kind === "cells" && hint.queen !== null) {
    return { ...hint, kind: "place", cells: [hint.queen], text: "This is where the next queen goes." };
  }
  return null;
}

/** A conflict in words, for the message under the board after a check. */
export function describeConflict(conflict: Conflict, board: Board): string {
  const { n, reg } = board;
  const [a, b] = conflict.cells;
  switch (conflict.kind) {
    case "row":
      return `Row ${rowOf(a, n) + 1} has ${conflict.cells.length} queens.`;
    case "column":
      return `Column ${colOf(a, n) + 1} has ${conflict.cells.length} queens.`;
    case "region":
      return `The ${REGION_NAMES[reg[a]]} region has ${conflict.cells.length} queens.`;
    default:
      return `The queens at row ${rowOf(a, n) + 1}, column ${colOf(a, n) + 1} and row ${rowOf(b, n) + 1}, column ${colOf(b, n) + 1} touch.`;
  }
}
