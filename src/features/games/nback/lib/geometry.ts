/**
 * Board geometry. The board is a square; its cells are squares separated by a gap that shrinks on bigger grids so a
 * 6 x 6 board stays legible on a 320 px phone. The CSS reads the same gap (`--nb-gap`), so this is the one place the
 * numbers live.
 */

/** The gap between cells in CSS pixels. */
export const cellGap = (grid: number): number => (grid >= 6 ? 3 : grid >= 5 ? 4 : 6);

/** Width of the board's own padding on each side, in CSS pixels. */
export const BOARD_PADDING = 6;

/** The side of one cell when the board is `boardPx` wide. */
export function cellSize(boardPx: number, grid: number): number {
  return (boardPx - 2 * BOARD_PADDING - cellGap(grid) * (grid - 1)) / grid;
}

/** Page padding on each side on a phone, in CSS pixels (the `container` utility in globals.css: 1.25rem). */
export const PHONE_GUTTER = 20;

/** The narrowest viewport the game supports. */
export const MIN_VIEWPORT = 320;

/** Smallest comfortable cell for a letter, in CSS pixels. */
export const MIN_CELL = 40;

/** The side of the letter in a cell: a little over half the cell. */
export const letterSize = (cell: number): number => Math.round(cell * 0.56);
