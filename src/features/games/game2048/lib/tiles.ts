import type { Grid, MoveResult } from "./types";

/**
 * The tiles as the screen draws them. The rules only know the grid, but sliding and merging are animated, which
 * needs each tile to keep an identity from one move to the next. That bookkeeping lives here, away from the rules:
 * a tile keeps its `id` while it slides; a merge retires both parts (kept for one move as `ghost`s that slide into
 * place and fade) and makes one new tile; a spawned tile is `fresh`.
 */

export interface UiTile {
  id: number;
  value: number;
  /** Cell index 0-15. */
  index: number;
  /** Made by a merge in the last move. */
  merged: boolean;
  /** Appeared after the last move. */
  fresh: boolean;
  /** Part of a merge: slides into the merged tile and disappears. */
  ghost: boolean;
}

/** Tiles for a position with no history (a new game, a restored one, or after undo). */
export function tilesFromGrid(grid: Grid, firstId: number): { tiles: UiTile[]; nextId: number } {
  let id = firstId;
  const tiles: UiTile[] = [];
  grid.forEach((value, index) => {
    if (value !== 0) tiles.push({ id: id++, value, index, merged: false, fresh: false, ghost: false });
  });
  return { tiles, nextId: id };
}

/** Carries the on-screen tiles through one move and the tile that appeared after it. */
export function advanceTiles(previous: readonly UiTile[], result: MoveResult, spawn: { index: number; value: number } | null, firstId: number): { tiles: UiTile[]; nextId: number } {
  let id = firstId;
  const live = new Map<number, UiTile>();
  for (const tile of previous) if (!tile.ghost) live.set(tile.index, tile);

  const tiles: UiTile[] = [];
  const mergedAt = new Set<number>();
  for (const move of result.moves) {
    const source = live.get(move.from);
    if (!source) continue;
    if (!move.merged) {
      tiles.push({ ...source, index: move.to, merged: false, fresh: false, ghost: false });
      continue;
    }
    tiles.push({ ...source, index: move.to, merged: false, fresh: false, ghost: true });
    if (!mergedAt.has(move.to)) {
      mergedAt.add(move.to);
      tiles.push({ id: id++, value: result.grid[move.to], index: move.to, merged: true, fresh: false, ghost: false });
    }
  }
  if (spawn) tiles.push({ id: id++, value: spawn.value, index: spawn.index, merged: false, fresh: true, ghost: false });
  return { tiles, nextId: id };
}

/** The values of the tiles that count (ghosts excluded), as a grid; used to check the drawing against the rules. */
export function gridOfTiles(tiles: readonly UiTile[]): Grid {
  const grid = new Array<number>(16).fill(0);
  for (const t of tiles) if (!t.ghost) grid[t.index] = t.value;
  return grid;
}
