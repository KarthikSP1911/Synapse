"use client";

import { memo, useCallback, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Crown, X } from "lucide-react";
import { ACCENT } from "@/lib/accent";
import { pointToCell, type BoardRect } from "@/features/games/shared/lib/board-geometry";
import { REGION_NAMES } from "@/features/games/queens/lib/grid";
import { CROSS, EMPTY, HINTED, QUEEN, type Hint, type Mark } from "@/features/games/queens/lib/types";

/** What dragging across the board does: cross out empty cells, or clear cross-outs. */
type DragMode = "cross" | "clear";

interface Drag {
  pointerId: number;
  start: number;
  mode: DragMode | "none" | null;
  cells: number[];
  last: [number, number];
}

function describe(index: number, n: number, region: number, mark: Mark, conflict: boolean, flagged: boolean): string {
  const where = `Row ${Math.floor(index / n) + 1}, column ${(index % n) + 1}, ${REGION_NAMES[region]} region`;
  const what = mark === QUEEN ? "queen" : mark === HINTED ? "queen from a hint" : mark === CROSS ? "crossed out" : "empty";
  return `${where}, ${what}${conflict ? ", breaks a rule" : ""}${flagged ? ", this queen is not part of the solution" : ""}`;
}

interface CellProps {
  index: number;
  n: number;
  region: number;
  mark: Mark;
  /** "edge" on the first row, "1" where the region above differs. */
  top: "edge" | "1" | null;
  left: "edge" | "1" | null;
  conflict: boolean;
  unit: boolean;
  hinted: "cell" | "wrong" | null;
  preview: boolean;
  tabbable: boolean;
}

const Cell = memo(function Cell({ index, n, region, mark, top, left, conflict, unit, hinted, preview, tabbable }: CellProps) {
  return (
    <button
      type="button"
      data-index={index}
      data-region={region}
      data-mark={mark}
      data-t={top ?? undefined}
      data-l={left ?? undefined}
      data-conflict={conflict ? "true" : undefined}
      data-unit={unit ? "true" : undefined}
      data-hint={hinted ?? undefined}
      data-preview={preview ? "true" : undefined}
      className="qn-cell"
      tabIndex={tabbable ? 0 : -1}
      aria-label={describe(index, n, region, mark, conflict, hinted === "wrong")}
    >
      {(mark === QUEEN || mark === HINTED) && <Crown className="qn-queen" aria-hidden strokeWidth={2.25} />}
      {mark === CROSS && <X className="qn-cross" aria-hidden strokeWidth={2} />}
    </button>
  );
});

/**
 * The Queens board. One tap cycles a cell (empty, crossed out, queen, empty); dragging across empty cells crosses
 * them out and dragging across crossed-out cells clears them, never touching a queen. Pointer events do all of it
 * (mouse, touch and pen alike) with `touch-action: none` on the board only, so the rest of the page keeps scrolling.
 * Keyboard: arrows move, Space or Enter cycles, Q places a queen, X crosses out, Backspace clears.
 */
export function Board({
  size,
  regions,
  cells,
  conflicts,
  hint,
  hintUnitCells,
  covered,
  onTap,
  onSet,
  onMark,
}: {
  size: number;
  regions: readonly number[];
  cells: readonly Mark[];
  /** Queens that break a rule and should be marked. */
  conflicts: ReadonlySet<number>;
  hint: Hint | null;
  /** The cells of the units a hint talks about. */
  hintUnitCells: ReadonlySet<number>;
  covered: boolean;
  onTap: (index: number) => void;
  onSet: (index: number, mark: typeof EMPTY | typeof CROSS | typeof QUEEN) => void;
  onMark: (indices: number[], to: typeof CROSS | typeof EMPTY) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [focus, setFocus] = useState(0);
  const [preview, setPreview] = useState<{ cells: ReadonlySet<number>; to: typeof CROSS | typeof EMPTY } | null>(null);

  const rectOf = useCallback((): BoardRect | null => {
    const el = ref.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height, rows: size, cols: size };
  }, [size]);

  const finish = useCallback(() => {
    drag.current = null;
    setPreview(null);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (covered || drag.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const rect = rectOf();
    const start = rect ? pointToCell(rect, event.clientX, event.clientY, 1) : null;
    if (start === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, start, mode: null, cells: [start], last: [event.clientX, event.clientY] };
    setFocus(start);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const rect = rectOf();
    if (!d || d.pointerId !== event.pointerId || !rect) return;
    const here = pointToCell(rect, event.clientX, event.clientY, 1);
    if (here === null || (d.mode === null && here === d.start)) return;
    if (d.mode === null) {
      const mark = cells[d.start];
      d.mode = mark === EMPTY ? "cross" : mark === CROSS ? "clear" : "none";
    }
    if (d.mode === "none" || d.cells.includes(here)) return;
    d.cells.push(here);
    setPreview({ cells: new Set(d.cells), to: d.mode === "cross" ? CROSS : EMPTY });
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    if (d.mode === null) onTap(d.start);
    else if (d.mode === "cross" || d.mode === "clear") onMark(d.cells, d.mode === "cross" ? CROSS : EMPTY);
    finish();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (covered || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index)) return;
    const row = Math.floor(index / size);
    const col = index % size;
    const move = (r: number, c: number) => {
      const next = Math.min(size - 1, Math.max(0, r)) * size + Math.min(size - 1, Math.max(0, c));
      setFocus(next);
      ref.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
    };
    const key = event.key;
    if (key === "ArrowUp") move(row - 1, col);
    else if (key === "ArrowDown") move(row + 1, col);
    else if (key === "ArrowLeft") move(row, col - 1);
    else if (key === "ArrowRight") move(row, col + 1);
    else if (key === " " || key === "Enter") onTap(index);
    else if (key.toLowerCase() === "q") onSet(index, QUEEN);
    else if (key.toLowerCase() === "x") onSet(index, CROSS);
    else if (key === "Backspace" || key === "Delete" || key === "0") onSet(index, EMPTY);
    else return;
    event.preventDefault();
  };

  const gridStyle = useMemo(() => ({ "--qn": ACCENT.queens, "--n": size, gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${size}, minmax(0, 1fr))` }) as CSSProperties, [size]);
  const hintCells = useMemo(() => new Set(hint?.cells ?? []), [hint]);

  return (
    <div className="qn-board" data-covered={covered ? "true" : undefined}>
      <div
        ref={ref}
        role="group"
        aria-label={`Queens board, ${size} by ${size}`}
        className="qn-grid"
        style={gridStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        {cells.map((mark, i) => {
          const r = Math.floor(i / size);
          const c = i % size;
          const shown = preview?.cells.has(i) ? preview.to : null;
          return (
            <Cell
              key={i}
              index={i}
              n={size}
              region={regions[i]}
              mark={shown !== null && mark !== QUEEN && mark !== HINTED ? shown : mark}
              top={r === 0 ? "edge" : regions[i - size] !== regions[i] ? "1" : null}
              left={c === 0 ? "edge" : regions[i - 1] !== regions[i] ? "1" : null}
              conflict={conflicts.has(i)}
              unit={hintUnitCells.has(i)}
              hinted={hintCells.has(i) ? (hint?.kind === "wrong" ? "wrong" : "cell") : null}
              preview={shown !== null}
              tabbable={i === focus}
            />
          );
        })}
      </div>
    </div>
  );
}
