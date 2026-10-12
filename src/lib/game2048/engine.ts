import { CELLS, SIZE, SPAWN_TWO_CHANCE, type Direction, type Grid, type MoveResult, type TileMove } from "./types";

/** Source of randomness in [0, 1); injectable so tests can choose where tiles appear. */
export type Rng = () => number;

export const emptyGrid = (): Grid => new Array<number>(CELLS).fill(0);

/** The four lines of cells for a direction, each listed starting from the edge the tiles slide towards. */
const LINES: Record<Direction, number[][]> = (() => {
  const rows = Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
  const cols = Array.from({ length: SIZE }, (_, c) => Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
  return {
    left: rows,
    right: rows.map((line) => [...line].reverse()),
    up: cols,
    down: cols.map((line) => [...line].reverse()),
  };
})();

/**
 * Slides every tile as far as it will go towards `direction` and merges equal neighbours. Each tile takes part in at
 * most one merge per move, and merges happen from the edge inwards: [2,2,2,2] to the left gives [4,4,0,0], and
 * [2,2,4,0] gives [4,4,0,0]. Pure and deterministic: no tile is added here (see `spawnTile`).
 */
export function moveGrid(grid: Grid, direction: Direction): MoveResult {
  const next = emptyGrid();
  const moves: TileMove[] = [];
  let gained = 0;

  for (const line of LINES[direction]) {
    const out: { value: number; merged: boolean; first: TileMove }[] = [];
    for (const from of line) {
      const value = grid[from];
      if (value === 0) continue;
      const top = out[out.length - 1];
      if (top && !top.merged && top.value === value) {
        top.value *= 2;
        top.merged = true;
        top.first.merged = true;
        gained += top.value;
        moves.push({ from, to: line[out.length - 1], value, merged: true });
      } else {
        const move: TileMove = { from, to: line[out.length], value, merged: false };
        out.push({ value, merged: false, first: move });
        moves.push(move);
      }
    }
    out.forEach((tile, k) => (next[line[k]] = tile.value));
  }

  return { grid: next, gained, moved: next.some((v, i) => v !== grid[i]), moves };
}

export const emptyCells = (grid: Grid): number[] => grid.flatMap((v, i) => (v === 0 ? [i] : []));

/**
 * Puts a 2 (90%) or a 4 (10%) in a uniformly chosen empty cell. Draws two numbers from `rng`: the first picks the
 * cell, the second the value. Returns null when the board is full.
 */
export function spawnTile(grid: Grid, rng: Rng): { grid: Grid; index: number; value: number } | null {
  const empties = emptyCells(grid);
  if (empties.length === 0) return null;
  const index = empties[Math.min(empties.length - 1, Math.floor(rng() * empties.length))];
  const value = rng() < SPAWN_TWO_CHANCE ? 2 : 4;
  const next = [...grid];
  next[index] = value;
  return { grid: next, index, value };
}

/** A fresh board with the two classic starting tiles. */
export function startingGrid(rng: Rng): Grid {
  let grid = emptyGrid();
  for (let n = 0; n < 2; n++) grid = spawnTile(grid, rng)!.grid;
  return grid;
}

/** Whether any direction would change the board: an empty cell, or two equal tiles side by side or one above the other. */
export function hasMoves(grid: Grid): boolean {
  if (grid.some((v) => v === 0)) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r * SIZE + c];
      if (c + 1 < SIZE && grid[r * SIZE + c + 1] === v) return true;
      if (r + 1 < SIZE && grid[(r + 1) * SIZE + c] === v) return true;
    }
  }
  return false;
}

export const highestTileOf = (grid: Grid): number => grid.reduce((max, v) => Math.max(max, v), 0);

export const sumOf = (grid: Grid): number => grid.reduce((total, v) => total + v, 0);

export const isPowerOfTwo = (n: number): boolean => Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0;
