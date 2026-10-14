/**
 * Drawing helpers for the board, kept free of React so they can be tested. Everything is in cell units: the board's
 * SVG has a viewBox of one unit per cell, so a path scales with the board from a 320px phone to a desktop.
 */

/** The outline of a set of cells as SVG path data: one segment for every side that has no neighbour in the set. */
export function outlinePath(cells: readonly number[], cols: number): string {
  const inSet = new Set(cells);
  const parts: string[] = [];
  for (const cell of cells) {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    if (!inSet.has(cell - cols)) parts.push(`M${c} ${r}h1`);
    if (c === cols - 1 || !inSet.has(cell + 1)) parts.push(`M${c + 1} ${r}v1`);
    if (!inSet.has(cell + cols)) parts.push(`M${c} ${r + 1}h1`);
    if (c === 0 || !inSet.has(cell - 1)) parts.push(`M${c} ${r}v1`);
  }
  return parts.join("");
}

/** The cells as filled unit squares, one path for all of them. */
export function cellsPath(cells: readonly number[], cols: number): string {
  return cells.map((cell) => `M${cell % cols} ${Math.floor(cell / cols)}h1v1h-1z`).join("");
}

/**
 * The order in which a patch fills in: the clue first, then outwards one step at a time (cells equally far from the
 * clue arrive together). The result lists the step of every cell, in the order of `cells`.
 */
export function cascadeSteps(cells: readonly number[], from: number, cols: number): number[] {
  const inSet = new Set(cells);
  const step = new Map<number, number>([[from, 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    const c = cell % cols;
    for (const m of [cell - cols, cell + cols, c > 0 ? cell - 1 : -1, c < cols - 1 ? cell + 1 : -1]) {
      if (m >= 0 && inSet.has(m) && !step.has(m)) {
        step.set(m, step.get(cell)! + 1);
        queue.push(m);
      }
    }
  }
  // A cell the walk cannot reach (never in a valid patch) simply comes last.
  const last = Math.max(0, ...step.values()) + 1;
  return cells.map((cell) => step.get(cell) ?? last);
}
