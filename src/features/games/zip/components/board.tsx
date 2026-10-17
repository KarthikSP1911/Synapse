"use client";

import { memo, useMemo, useRef, type CSSProperties, type PointerEvent } from "react";
import { ACCENT } from "@/lib/accent";
import { cellsAlong, pointToCell, type BoardRect } from "@/features/games/shared/lib/board-geometry";
import { lastNumberOpen, nextNumber, type Rules } from "@/features/games/zip/lib/draw";
import type { Hint } from "@/features/games/zip/lib/types";

interface CellProps {
  on: boolean;
  head: boolean;
  hint: boolean;
  /** The number on the cell, or 0. */
  number: number;
  state: "plain" | "reached" | "next" | "locked" | "open" | "waiting";
}

const Cell = memo(function Cell({ on, head, hint, number, state }: CellProps) {
  return (
    <div className="zp-cell" data-on={on ? "true" : undefined} data-head={head ? "true" : undefined} data-hint={hint ? "true" : undefined}>
      {number > 0 && (
        <span
          className="zp-badge"
          data-reached={state === "reached" ? "true" : undefined}
          data-next={state === "next" ? "true" : undefined}
          data-locked={state === "locked" ? "true" : undefined}
          data-open={state === "open" ? "true" : undefined}
        >
          {number}
        </span>
      )}
    </div>
  );
});

/** A wall between two neighbouring cells, as a line segment in cell units. */
function wallLine(key: string, cols: number): { x1: number; y1: number; x2: number; y2: number } {
  const [a, b] = key.split("-").map(Number);
  const r = Math.floor(a / cols);
  const c = a % cols;
  // Side by side: a vertical line on their shared edge. One above the other: a horizontal line.
  return b === a + 1 ? { x1: c + 1, y1: r, x2: c + 1, y2: r + 1 } : { x1: c, y1: r + 1, x2: c + 1, y2: r + 1 };
}

function describe(rules: Rules, path: readonly number[], hint: Hint | null): string {
  const cells = rules.cells;
  const next = nextNumber(rules, path);
  const head = path.length > 0 ? path[path.length - 1] : null;
  const where = head === null ? "The path has not started. Start on the square marked 1." : `The path ends at row ${Math.floor(head / rules.puzzle.cols) + 1}, column ${(head % rules.puzzle.cols) + 1}.`;
  return `Zip board, ${rules.puzzle.rows} by ${rules.puzzle.cols}. ${path.length} of ${cells} squares filled. ${where} ${next <= rules.last ? `Heading for ${next}.` : ""} ${hint ? hint.text : ""}`.trim();
}

/**
 * The Zip board: cells, the path and the walls. Drawing is one stroke of pointer events (mouse, touch and pen alike):
 * press starts or continues the path, moving extends it through every cell the pointer crosses (a quick drag is
 * expanded so none are skipped), release ends the stroke. `touch-action: none` is on the board only.
 * The keyboard is handled by the play screen.
 */
export function Board({
  rules,
  path,
  hint,
  covered,
  won,
  onBegin,
  onDrag,
  onEnd,
}: {
  rules: Rules;
  path: readonly number[];
  hint: Hint | null;
  covered: boolean;
  /** The puzzle is solved: play the win animation on the path. */
  won: boolean;
  onBegin: (cell: number) => void;
  onDrag: (cell: number) => void;
  onEnd: () => void;
}) {
  const { puzzle } = rules;
  const ref = useRef<HTMLDivElement>(null);
  const stroke = useRef<{ pointerId: number; last: [number, number] } | null>(null);

  const rect = (): BoardRect | null => {
    const el = ref.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height, rows: puzzle.rows, cols: puzzle.cols };
  };

  const finish = () => {
    if (!stroke.current) return;
    stroke.current = null;
    onEnd();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (covered || stroke.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const r = rect();
    const cell = r ? pointToCell(r, event.clientX, event.clientY, 1) : null;
    if (cell === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    stroke.current = { pointerId: event.pointerId, last: [event.clientX, event.clientY] };
    onBegin(cell);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const s = stroke.current;
    const r = rect();
    if (!s || s.pointerId !== event.pointerId || !r) return;
    // Fast drags deliver few events; the browser keeps the ones in between.
    const events = typeof event.nativeEvent.getCoalescedEvents === "function" ? event.nativeEvent.getCoalescedEvents() : [];
    const points: [number, number][] = (events.length > 0 ? events : [event.nativeEvent]).map((e) => [e.clientX, e.clientY]);
    for (const point of points) {
      for (const cell of cellsAlong(r, s.last, point)) onDrag(cell);
      s.last = point;
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (stroke.current?.pointerId === event.pointerId) finish();
  };

  const inPath = useMemo(() => new Set(path), [path]);
  const head = path.length > 0 ? path[path.length - 1] : -1;
  const next = nextNumber(rules, path);
  const open = lastNumberOpen(rules, path);
  const hintCells = useMemo(() => new Set(hint?.cells ?? []), [hint]);

  const style = useMemo(() => ({ "--zp": ACCENT.zip, "--zpn": puzzle.cols, gridTemplateColumns: `repeat(${puzzle.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${puzzle.rows}, minmax(0, 1fr))` }) as CSSProperties, [puzzle.cols, puzzle.rows]);
  const points = path.map((c) => `${(c % puzzle.cols) + 0.5},${Math.floor(c / puzzle.cols) + 0.5}`).join(" ");

  return (
    <div data-timer-clear className="zp-board" data-covered={covered ? "true" : undefined} data-won={won ? "true" : undefined} style={style}>
      <div
        ref={ref}
        role="group"
        aria-label={describe(rules, path, hint)}
        tabIndex={0}
        className="zp-grid"
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onContextMenu={(e) => e.preventDefault()}
      >
        {Array.from({ length: rules.cells }, (_, i) => {
          const number = rules.numbers[i];
          const reached = number > 0 && inPath.has(i);
          const state: CellProps["state"] = number === 0 ? "plain" : reached ? "reached" : number === rules.last ? (open ? "open" : "locked") : number === next ? "next" : "waiting";
          return <Cell key={i} on={inPath.has(i)} head={i === head} hint={hintCells.has(i)} number={number} state={state} />;
        })}
        <svg className="zp-svg" viewBox={`0 0 ${puzzle.cols} ${puzzle.rows}`} preserveAspectRatio="none" aria-hidden>
          {path.length > 1 && <polyline className="zp-path" points={points} pathLength={1} />}
          {head >= 0 && <circle className="zp-head" cx={(head % puzzle.cols) + 0.5} cy={Math.floor(head / puzzle.cols) + 0.5} r={0.17} />}
          {puzzle.walls.map((key) => {
            const line = wallLine(key, puzzle.cols);
            return <line key={key} className="zp-wall" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />;
          })}
        </svg>
      </div>
    </div>
  );
}
