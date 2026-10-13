"use client";

import { memo, useEffect, useRef, type CSSProperties } from "react";
import { ACCENT } from "@/lib/accent";
import { PEERS, bit, colOf, rowOf } from "@/features/games/sudoku/lib/grid";
import { SIZE, type CellState } from "@/features/games/sudoku/lib/types";

/** The cell at position `k` (0-8) of box `b` (0-8). The board is drawn box by box so the box lines are real gaps. */
const cellIndex = (b: number, k: number): number => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * SIZE + (b % 3) * 3 + (k % 3);

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function describe(index: number, cell: CellState, given: boolean, error: boolean): string {
  const place = `Row ${rowOf(index) + 1}, column ${colOf(index) + 1}`;
  if (cell.value !== 0) return `${place}, ${given ? "clue" : cell.hinted ? "hint" : "entry"} ${cell.value}${error ? ", wrong" : ""}`;
  const notes = DIGITS.filter((d) => cell.notes & bit(d));
  return notes.length > 0 ? `${place}, empty, notes ${notes.join(" ")}` : `${place}, empty`;
}

interface CellProps {
  index: number;
  cell: CellState;
  given: boolean;
  selected: boolean;
  related: boolean;
  match: boolean;
  error: boolean;
  /** The digit being highlighted, so matching pencil marks can stand out. 0 for none. */
  matchDigit: number;
  tabbable: boolean;
  onSelect: (index: number) => void;
}

const Cell = memo(function Cell({ index, cell, given, selected, related, match, error, matchDigit, tabbable, onSelect }: CellProps) {
  return (
    <button
      type="button"
      data-index={index}
      className="sdk-cell"
      tabIndex={tabbable ? 0 : -1}
      aria-label={describe(index, cell, given, error)}
      aria-current={selected ? "true" : undefined}
      data-given={given}
      data-hinted={cell.hinted}
      data-selected={selected}
      data-related={related}
      data-match={match}
      data-error={error}
      onClick={() => onSelect(index)}
    >
      {cell.value !== 0 ? (
        cell.value
      ) : cell.notes !== 0 ? (
        <span className="sdk-notes" aria-hidden>
          {DIGITS.map((d) => (
            <span key={d} data-hit={matchDigit === d}>
              {cell.notes & bit(d) ? d : ""}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
});

export interface BoardProps {
  cells: readonly CellState[];
  puzzle: string;
  selected: number | null;
  /** Cells to draw as wrong. */
  errors: ReadonlySet<number>;
  onSelect: (index: number) => void;
  /** Hides the digits (the game is paused). */
  covered?: boolean;
}

/** The 9x9 grid with the selected cell, its row, column and box, and every cell with the same digit picked out. */
export function Board({ cells, puzzle, selected, errors, onSelect, covered = false }: BoardProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const selectedCell = selected === null ? null : cells[selected];
  const matchDigit = selectedCell && selectedCell.value !== 0 ? selectedCell.value : 0;
  const peers = selected === null ? null : new Set(PEERS[selected]);

  // Focus follows the selection when the player is already working inside the board, so a screen reader says where they are.
  useEffect(() => {
    const grid = gridRef.current;
    if (selected === null || !grid || !grid.contains(document.activeElement)) return;
    grid.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.focus({ preventScroll: true });
  }, [selected]);
  // Exactly one cell is a tab stop, so Tab moves in and out of the board in one step; the arrow keys move inside it.
  const tabStop = selected ?? 0;

  return (
    <div className="sdk-board w-full" style={{ "--sdk": ACCENT.sudoku } as CSSProperties}>
      <div ref={gridRef} role="group" aria-label="Sudoku board" className="sdk-grid select-none" aria-hidden={covered || undefined} style={covered ? { filter: "blur(14px)", pointerEvents: "none" } : undefined}>
        {Array.from({ length: SIZE }, (_, b) => (
          <div key={b} className="sdk-box">
            {Array.from({ length: SIZE }, (_, k) => {
              const index = cellIndex(b, k);
              const cell = cells[index];
              return (
                <Cell
                  key={index}
                  index={index}
                  cell={cell}
                  given={puzzle[index] !== "0"}
                  selected={selected === index}
                  related={selected !== null && selected !== index && (peers?.has(index) ?? false)}
                  match={matchDigit !== 0 && cell.value === matchDigit && selected !== index}
                  error={errors.has(index)}
                  matchDigit={matchDigit}
                  tabbable={tabStop === index}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
