"use client";

import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ACCENT } from "@/lib/accent";
import { cellsAlong, pointToCell, type BoardRect } from "@/features/games/shared/lib/board-geometry";
import { ClueMark } from "@/features/games/patches/components/clue-mark";
import { beginDraft, draftCells, extendDraft, grabPatch, type Draft } from "@/features/games/patches/lib/draw";
import { cellsPath, labelSpot, outlinePath, patchShapePath } from "@/features/games/patches/lib/outline";
import { describeClue, placeName } from "@/features/games/patches/lib/puzzle-format";
import { checkDraft, clueAt, overlappedClues, ownerMap, ownerWithout, type DraftCheck } from "@/features/games/patches/lib/rules";
import type { Conflicts } from "@/features/games/patches/lib/game";
import type { Clue, Hint, Patch, PatchesPuzzle } from "@/features/games/patches/lib/types";

/** How long a refused patch stays on the board (flashing red) and a removed patch lingers while it fades. */
const REJECT_MS = 520;
const LEAVE_MS = 240;
/** A finger or mouse that moved less than this (px) between pressing and letting go has tapped. */
const TAP_SLOP = 10;
/** How long the completion wave takes to cross the board. */
export const WIN_WAVE_MS = 700;

interface CellProps {
  clue: Clue | null;
  /** The clue's own colour. */
  clueColor: number;
  placed: boolean;
  /** The clue has no room left (or, for a plain cell, nothing could cover it). */
  dead: boolean;
  hinted: boolean;
  cursor: boolean;
  clueEnter: number | null;
  /** Delay (ms) in the completion wave, or null. */
  wave: number | null;
}

const Cell = memo(function Cell({ clue, clueColor, placed, dead, hinted, cursor, clueEnter, wave }: CellProps) {
  return (
    <div
      className="pt-cell"
      data-dead={dead && !clue ? "true" : undefined}
      data-hint={hinted ? "true" : undefined}
      data-cursor={cursor ? "true" : undefined}
      style={wave !== null ? ({ "--wd": `${wave}ms` } as CSSProperties) : undefined}
    >
      {clue && <ClueMark clue={clue} color={clueColor} placed={placed} conflict={dead} hinted={hinted} entering={clueEnter} celebrate={wave !== null} />}
    </div>
  );
});

function describeBoard(puzzle: PatchesPuzzle, patches: readonly Patch[], left: number): string {
  return `Patches board, ${puzzle.rows} by ${puzzle.cols}. ${patches.length} of ${puzzle.clues.length} patches placed, ${left} ${left === 1 ? "cell" : "cells"} left. Drag across the board to draw a patch around a clue. Drag from the edge of a patch to resize it, draw over a patch to replace it, tap a patch to erase it.`;
}

const sameCells = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((cell, i) => cell === b[i]);

/**
 * The Patches board: cells, clues, the patches drawn so far and the one being drawn.
 *
 * Drawing is one gesture of pointer events (mouse, touch and pen alike), and every part of it can be done again
 * without a Remove button:
 *   - press a free cell and drag: a draft rectangle from that cell to the one under the pointer (or, on the clue of a
 *     freeform patch, the cells painted across). It is filled in the colour of the clue it holds as it grows;
 *   - press a patch and drag: the patch is picked up. A rectangle is held by its nearest corner, so it stretches and
 *     shrinks in your hand; a freeform patch grows where you paint;
 *   - tap a patch (press and let go without moving): it is erased;
 *   - draw over patches: they are shown dimmed and are replaced when the patch is let go over them.
 * A patch can be drawn at any size, as on paper: one that is not the size or shape its clue asks for is placed with a
 * dashed outline instead of being refused, and only the finished board decides. A drag simply stops growing where it
 * would take in a second clue, rather than showing an error.
 * Nothing reaches the game until the pointer is released, a refused patch changes nothing (a patch you were holding
 * stays as it was), and a cancelled pointer (a call, a scroll takeover, the page hiding) throws the draft away. The
 * keyboard does the same with the arrow keys, Enter and Delete.
 *
 * A patch is drawn as in the paper puzzle: a rounded shape in the colour of its clue, tinted, with a coloured border pulled in a
 * little from the cell lines so touching patches keep a gap, and a small label with its size in the middle. The draft shows the
 * same, and its size, while it is being drawn.
 *
 * The draft, the patch in hand, the cursor and every animation live here, in the component: the committed patches
 * come from the game and are never changed by how long an animation takes. `touch-action: none` is on the board only.
 */
export function Board({
  puzzle,
  patches,
  colors,
  hint,
  dead,
  covered,
  won,
  soft,
  onCommit,
  onRemove,
  onNotice,
}: {
  puzzle: PatchesPuzzle;
  patches: readonly Patch[];
  /** The colour index of every clue (its symbol, and the patch drawn for it). */
  colors: readonly number[];
  hint: Hint | null;
  /** Dead ends to mark, or null when none are shown. */
  dead: Conflicts | null;
  covered: boolean;
  /** The puzzle is solved: play the win animation. */
  won: boolean;
  /** Patches arrive without the cascade (Undo and Redo). */
  soft: boolean;
  /** Offers cells as a patch (replacing any it covers); the game answers with why it was refused, or null once it is placed. */
  onCommit: (cells: number[]) => DraftCheck | null;
  onRemove: (clue: number) => void;
  /** Says something to the player (a hint at how to draw, say). */
  onNotice: (message: string) => void;
}) {
  const { rows, cols } = puzzle;
  const n = rows * cols;
  const patternId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<{ pointerId: number; kind: "draw" | "grab"; clue: number; last: [number, number]; from: [number, number]; travelled: number } | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const liftedRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** The clue of the patch in hand, which is drawn as part of the draft until it is put down. */
  const [lifted, setLifted] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [reject, setReject] = useState<{ key: number; cells: number[] } | null>(null);

  const owner = useMemo(() => ownerMap(patches, n), [patches, n]);
  const ownerRef = useRef(owner);
  useEffect(() => {
    ownerRef.current = owner;
  }, [owner]);
  /** Nothing is taken: a draft may run over patches, which it then replaces. */
  const noOwner = useMemo(() => new Int16Array(n).fill(-1), [n]);

  // Patches that just arrived or left, worked out when the patches change (never stored anywhere that matters).
  const [seen, setSeen] = useState(patches);
  const [arriving, setArriving] = useState<readonly Patch[]>([]);
  const [leaving, setLeaving] = useState<readonly Patch[]>([]);
  if (seen !== patches) {
    setSeen(patches);
    setArriving(patches.filter((p) => !seen.includes(p)));
    setLeaving(seen.filter((p) => !patches.includes(p)));
  }
  useEffect(() => {
    if (leaving.length === 0) return;
    const timer = setTimeout(() => setLeaving([]), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  useEffect(() => {
    if (!reject) return;
    const timer = setTimeout(() => setReject(null), REJECT_MS);
    return () => clearTimeout(timer);
  }, [reject]);

  // A pause covers the board: a gesture in progress is dropped.
  const [wasCovered, setWasCovered] = useState(covered);
  if (covered !== wasCovered) {
    setWasCovered(covered);
    if (covered) {
      setDraft(null);
      setLifted(null);
      setCursor(null);
    }
  }

  // The refs follow the state after every render (they are also set at once by the updaters below, because a gesture can deliver several moves before React renders).
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    liftedRef.current = lifted;
  }, [lifted]);

  const updateDraft = (next: Draft | null) => {
    draftRef.current = next;
    setDraft(next);
  };
  const updateLifted = (next: number | null) => {
    liftedRef.current = next;
    setLifted(next);
  };
  /** Puts the gesture down: no draft, nothing in hand. */
  const clearGesture = () => {
    updateDraft(null);
    updateLifted(null);
  };

  // ---- What is drawn --------------------------------------------------------

  /** The board without the patch in hand. */
  const base = useMemo(() => (lifted === null ? owner : ownerWithout(owner, [lifted])), [owner, lifted]);

  /** The patches that just arrived settle in from their clue; the same clues pop. */
  const entering = useMemo(() => new Set(arriving.map((p) => p.clue)), [arriving]);

  const shownDraft = covered ? null : draft;
  const cells = useMemo(() => (shownDraft ? draftCells(shownDraft, cols) : []), [shownDraft, cols]);
  /** The patches the draft would replace, and the draft's check once they are out of the way. */
  const replaced = useMemo(() => overlappedClues(base, cells), [base, cells]);
  const check = useMemo(() => (shownDraft ? checkDraft(puzzle, ownerWithout(base, replaced), cells) : null), [shownDraft, puzzle, base, replaced, cells]);
  const draftState: "valid" | "neutral" = check?.ok ? "valid" : "neutral";
  const draftColor = check?.clue != null ? colors[check.clue] : -1;
  const dimmed = useMemo(() => new Set(replaced), [replaced]);
  const draftShape = useMemo(() => (cells.length > 0 ? patchShapePath(cells, cols) : ""), [cells, cols]);
  /** The cell count shown in the middle of the draft, and of every placed patch, as in the paper puzzle. */
  const draftLabel = useMemo(() => {
    if (!shownDraft || cells.length === 0) return null;
    const clueCell = check?.clue != null ? puzzle.clues[check.clue].cell : cells[0];
    return { ...labelSpot(cells, clueCell, cols), text: String(cells.length), color: draftColor };
  }, [shownDraft, cells, check, puzzle, cols, draftColor]);
  /** The shape of every placed patch, worked out once per change of the board. */
  const shapes = useMemo(
    () => patches.map((p) => ({ patch: p, d: patchShapePath(p.cells, cols), label: labelSpot(p.cells, puzzle.clues[p.clue].cell, cols) })),
    [patches, puzzle, cols]
  );

  const hintCells = useMemo(() => new Set(hint?.cells ?? []), [hint]);
  const deadClues = useMemo(() => new Set(dead?.clues ?? []), [dead]);
  const deadCells = useMemo(() => new Set(dead?.cells ?? []), [dead]);
  const patchOf = useMemo(() => new Map(patches.map((p) => [p.clue, p])), [patches]);
  const at = clueAt(puzzle);
  /** The clues whose placed patch is not what the clue asks for. */
  const mismatched = useMemo(() => new Set(patches.filter((p) => !checkDraft(puzzle, noOwner, p.cells).ok).map((p) => p.clue)), [patches, puzzle, noOwner]);

  /** Grows a draft towards a cell, unless that would take a second clue in: then it stays as it was. */
  const grow = (from: Draft, cell: number): Draft => {
    const next = extendDraft(from, noOwner, cell);
    if (next === from) return from;
    let clues = 0;
    for (const c of draftCells(next, cols)) if (at[c] >= 0) clues++;
    return clues > 1 ? from : next;
  };

  // ---- Pointer ----------------------------------------------------------------

  const rect = (): BoardRect | null => {
    const el = ref.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height, rows, cols };
  };

  /** What the game will make of these cells, given the patch in hand and the ones they would replace. */
  const checkNow = (drawn: readonly number[]): DraftCheck => {
    const free = liftedRef.current === null ? ownerRef.current : ownerWithout(ownerRef.current, [liftedRef.current]);
    return checkDraft(puzzle, ownerWithout(free, overlappedClues(free, drawn)), drawn);
  };

  const offer = (drawn: number[]) => {
    const refused = onCommit(drawn);
    if (refused) setReject({ key: Date.now(), cells: drawn });
  };

  /** Lets go of the gesture: the draft is offered to the game (commit) or thrown away. */
  const finish = (commit: boolean) => {
    const gesture = press.current;
    const current = draftRef.current;
    const heldClue = liftedRef.current;
    press.current = null;
    clearGesture();
    if (!commit || !current || !gesture) return;
    const drawn = draftCells(current, cols);

    if (gesture.kind === "grab") {
      // Let go without moving: the patch is erased. Let go after moving: the new shape replaces it (if it is valid).
      if (gesture.travelled < TAP_SLOP) {
        if (heldClue !== null) onRemove(heldClue);
        return;
      }
      const held = heldClue !== null ? patchOf.get(heldClue) : undefined;
      if (held && sameCells(held.cells, drawn)) return;
      offer(drawn);
      return;
    }

    if (drawn.length === 1) {
      // A single cell is only a patch when the clue says one cell, or the pointer clearly drew it; a stray tap is not.
      const only = checkNow(drawn);
      const sure = only.ok && only.clue !== null && puzzle.clues[only.clue].area === 1;
      if (!sure && gesture.travelled < TAP_SLOP) {
        onNotice("Drag from one corner of the patch to the opposite corner. For a freeform clue, drag across the cells it should take.");
        return;
      }
    }
    offer(drawn);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (covered || press.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const r = rect();
    const cell = r ? pointToCell(r, event.clientX, event.clientY, 1) : null;
    if (cell === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCursor(null);
    const point: [number, number] = [event.clientX, event.clientY];
    const taken = ownerRef.current[cell];
    const held = taken >= 0 ? patchOf.get(taken) : undefined;
    if (held) {
      // A patch is picked up where it was pressed.
      press.current = { pointerId: event.pointerId, kind: "grab", clue: taken, last: point, from: point, travelled: 0 };
      updateLifted(taken);
      updateDraft(grabPatch(puzzle, held, cell));
      return;
    }
    press.current = { pointerId: event.pointerId, kind: "draw", clue: -1, last: point, from: point, travelled: 0 };
    updateDraft(beginDraft(puzzle, noOwner, cell));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const s = press.current;
    const r = rect();
    if (!s || s.pointerId !== event.pointerId || !r) return;
    if (covered) {
      press.current = null;
      return;
    }
    // Fast drags deliver few events; the browser keeps the ones in between.
    const events = typeof event.nativeEvent.getCoalescedEvents === "function" ? event.nativeEvent.getCoalescedEvents() : [];
    const points: [number, number][] = (events.length > 0 ? events : [event.nativeEvent]).map((e) => [e.clientX, e.clientY]);
    for (const point of points) {
      s.travelled = Math.max(s.travelled, Math.hypot(point[0] - s.from[0], point[1] - s.from[1]));
      let d = draftRef.current;
      // A grab only starts to change the shape once the pointer has clearly moved, so a tap does not nudge it.
      if (d && (s.kind === "draw" || s.travelled >= TAP_SLOP)) {
        if (d.mode === "rect") {
          const cell = pointToCell(r, point[0], point[1], 1);
          if (cell !== null) d = grow(d, cell);
        } else {
          for (const cell of cellsAlong(r, s.last, point)) d = grow(d, cell);
        }
        if (d !== draftRef.current) updateDraft(d);
      }
      s.last = point;
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const s = press.current;
    if (!s || s.pointerId !== event.pointerId) return;
    if (covered) {
      press.current = null;
      clearGesture();
      return;
    }
    finish(true);
  };

  /** The pointer was taken away (a system gesture, a lost capture): nothing is placed, and a patch in hand stays as it was. */
  const onCancel = () => {
    if (press.current) finish(false);
  };

  // ---- Keyboard ------------------------------------------------------------------

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (covered || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const step = key === "ArrowUp" ? [-1, 0] : key === "ArrowDown" ? [1, 0] : key === "ArrowLeft" ? [0, -1] : key === "ArrowRight" ? [0, 1] : null;
    if (step) {
      stop();
      if (cursor === null) {
        setCursor(puzzle.clues[0].cell);
        return;
      }
      const r = Math.min(rows - 1, Math.max(0, Math.floor(cursor / cols) + step[0]));
      const c = Math.min(cols - 1, Math.max(0, (cursor % cols) + step[1]));
      const next = r * cols + c;
      setCursor(next);
      const d = draftRef.current;
      if (d) updateDraft(grow(d, next));
      return;
    }
    if (key === "Enter" || key === " ") {
      stop();
      const here = cursor ?? puzzle.clues[0].cell;
      setCursor(here);
      const d = draftRef.current;
      if (d) {
        const drawn = draftCells(d, cols);
        updateDraft(null);
        offer(drawn);
      } else if (ownerRef.current[here] >= 0) {
        // Enter on a patch erases it, as a tap does.
        onRemove(ownerRef.current[here]);
      } else {
        updateDraft(beginDraft(puzzle, noOwner, here));
      }
      return;
    }
    if (key === "Escape") {
      if (draftRef.current) {
        stop();
        updateDraft(null);
      }
      return;
    }
    if ((key === "Delete" || key === "Backspace") && cursor !== null && ownerRef.current[cursor] >= 0) {
      stop();
      onRemove(ownerRef.current[cursor]);
    }
  };

  // ---- Render ------------------------------------------------------------------------

  const style = useMemo(() => ({ "--pt": ACCENT.patches, "--ptn": cols, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }) as CSSProperties, [cols, rows]);
  const left = n - patches.reduce((total, p) => total + p.cells.length, 0);
  /** The dashed lines between cells, drawn once in the board's SVG. */
  const gridLines = useMemo(() => {
    let d = "";
    for (let c = 1; c < cols; c++) d += `M${c} 0V${rows}`;
    for (let r = 1; r < rows; r++) d += `M0 ${r}H${cols}`;
    return d;
  }, [rows, cols]);
  const spoken =
    cursor === null
      ? ""
      : `${placeName(cursor, cols)}. ${at[cursor] >= 0 ? `Clue: ${describeClue(puzzle.clues[at[cursor]])}.` : owner[cursor] >= 0 ? "In a patch. Enter erases it." : "Empty."}${shownDraft ? ` Drawing, ${cells.length} ${cells.length === 1 ? "cell" : "cells"}.` : ""}`;

  return (
    <div className="pt-board" data-covered={covered ? "true" : undefined} data-won={won ? "true" : undefined} data-soft={soft ? "true" : undefined} data-holding={lifted !== null ? "true" : undefined} style={style}>
      <div
        ref={ref}
        role="group"
        aria-label={describeBoard(puzzle, patches, left)}
        tabIndex={0}
        className="pt-grid"
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onCancel}
        onLostPointerCapture={onCancel}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setCursor(null);
          if (draftRef.current && !press.current) clearGesture();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {Array.from({ length: n }, (_, i) => {
          const clueIndex = at[i];
          return (
            <Cell
              key={i}
              clue={clueIndex >= 0 ? puzzle.clues[clueIndex] : null}
              clueColor={clueIndex >= 0 ? colors[clueIndex] : -1}
              placed={clueIndex >= 0 && patchOf.has(clueIndex) && clueIndex !== lifted}
              dead={clueIndex >= 0 ? deadClues.has(clueIndex) : deadCells.has(i)}
              hinted={hintCells.has(i)}
              cursor={cursor === i}
              clueEnter={clueIndex >= 0 && entering.has(clueIndex) ? 0 : null}
              wave={won ? ((Math.floor(i / cols) + (i % cols)) * WIN_WAVE_MS) / (rows + cols) : null}
            />
          );
        })}

        <svg className="pt-svg" viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <pattern id={`${patternId}-dead`} width="0.28" height="0.28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="0.28" height="0.28" fill="none" />
              <rect width="0.09" height="0.28" className="pt-stripe" />
            </pattern>
          </defs>
          <path className="pt-gridlines" d={gridLines} />
          {(dead?.cells ?? []).length > 0 && <path d={cellsPath(dead!.cells, cols)} fill={`url(#${patternId}-dead)`} className="pt-dead" />}
          {shapes
            .filter(({ patch }) => patch.clue !== lifted)
            .map(({ patch, d }) => {
              const clue = puzzle.clues[patch.clue];
              const cx = (clue.cell % cols) + 0.5;
              const cy = Math.floor(clue.cell / cols) + 0.5;
              return (
                <path
                  key={`${patch.clue}:${patch.cells[0]}`}
                  className="pt-patch"
                  d={d}
                  data-c={colors[patch.clue]}
                  data-mismatch={mismatched.has(patch.clue) ? "true" : undefined}
                  data-dim={shownDraft !== null && dimmed.has(patch.clue) ? "true" : undefined}
                  data-enter={entering.has(patch.clue) ? "" : undefined}
                  style={{ transformOrigin: `${cx}px ${cy}px`, "--wd": `${((Math.floor(clue.cell / cols) + (clue.cell % cols)) * WIN_WAVE_MS) / (rows + cols)}ms` } as CSSProperties}
                />
              );
            })}
          {leaving.map((p) => (
            <path key={`gone:${p.clue}:${p.cells[0]}`} className="pt-patch" data-leaving="" data-c={colors[p.clue]} d={patchShapePath(p.cells, cols)} />
          ))}
          {shownDraft && draftShape && <path className="pt-patch" data-draft="" data-state={draftState} data-c={draftColor >= 0 ? draftColor : undefined} d={draftShape} />}
          {reject && (
            <g key={reject.key} className="pt-reject">
              <path className="pt-reject-fill" d={cellsPath(reject.cells, cols)} />
              <path className="pt-reject-line" d={outlinePath(reject.cells, cols)} />
            </g>
          )}
        </svg>
        {shapes
          .filter(({ patch }) => patch.clue !== lifted)
          .map(({ patch, label }) => (
            <b key={`size:${patch.clue}`} className="pt-size" data-c={colors[patch.clue]} style={{ left: `${(label.x / cols) * 100}%`, top: `${(label.y / rows) * 100}%` }} aria-hidden>
              {patch.cells.length}
            </b>
          ))}
        {draftLabel && (
          <b className="pt-size" data-draft="" data-c={draftLabel.color >= 0 ? draftLabel.color : undefined} style={{ left: `${(draftLabel.x / cols) * 100}%`, top: `${(draftLabel.y / rows) * 100}%` }} aria-hidden>
            {draftLabel.text}
          </b>
        )}
        {won && <span className="pt-sweep" aria-hidden />}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {spoken}
      </p>
    </div>
  );
}
