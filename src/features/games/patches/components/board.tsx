"use client";

import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ACCENT } from "@/lib/accent";
import { cellsAlong, pointToCell, type BoardRect } from "@/features/games/shared/lib/board-geometry";
import { ClueMark } from "@/features/games/patches/components/clue-mark";
import { beginDraft, draftCells, extendDraft, type Draft } from "@/features/games/patches/lib/draw";
import { cascadeSteps, cellsPath, outlinePath } from "@/features/games/patches/lib/outline";
import { describeClue, placeName } from "@/features/games/patches/lib/puzzle-format";
import { checkDraft, clueAt, ownerMap, type DraftCheck } from "@/features/games/patches/lib/rules";
import type { Conflicts } from "@/features/games/patches/lib/game";
import type { Clue, Hint, Patch, PatchesPuzzle } from "@/features/games/patches/lib/types";

/** Time between neighbouring cells of a patch as it fills in, and the longest the whole cascade may take. */
const CASCADE_MS = 30;
const CASCADE_MAX_MS = 360;
/** How long a refused patch stays on the board (flashing red) and a removed patch's outline lingers. */
const REJECT_MS = 520;
const LEAVE_MS = 240;
/** A finger or mouse that moved less than this (px) between pressing and letting go has tapped. */
const TAP_SLOP = 8;
/** How long the completion wave takes to cross the board. */
export const WIN_WAVE_MS = 700;

interface CellProps {
  color: number;
  /** Delay (ms) before the cell fills in, or null when it is not arriving. */
  enter: number | null;
  clue: Clue | null;
  placed: boolean;
  /** The clue has no room left (or, for a plain cell, nothing could cover it). */
  dead: boolean;
  hinted: boolean;
  cursor: boolean;
  draft: "valid" | "neutral" | "blocked" | null;
  /** A label for the cell holding the end of a draft ("3/6"). */
  count: string | null;
  clueEnter: number | null;
  /** Delay (ms) in the completion wave, or null. */
  wave: number | null;
}

const Cell = memo(function Cell({ color, enter, clue, placed, dead, hinted, cursor, draft, count, clueEnter, wave }: CellProps) {
  return (
    <div
      className="pt-cell"
      data-dead={dead && !clue ? "true" : undefined}
      data-hint={hinted ? "true" : undefined}
      data-cursor={cursor ? "true" : undefined}
      style={wave !== null ? ({ "--wd": `${wave}ms` } as CSSProperties) : undefined}
    >
      <i className="pt-fill" data-c={color >= 0 ? color : undefined} data-enter={enter !== null ? "" : undefined} style={enter !== null ? ({ "--d": `${enter}ms` } as CSSProperties) : undefined} />
      {draft && <i className="pt-draft" data-state={draft} />}
      {clue && <ClueMark clue={clue} placed={placed} conflict={dead} hinted={hinted} entering={clueEnter} celebrate={wave !== null} />}
      {count && <b className="pt-count">{count}</b>}
    </div>
  );
});

function describeBoard(puzzle: PatchesPuzzle, patches: readonly Patch[], left: number): string {
  return `Patches board, ${puzzle.rows} by ${puzzle.cols}. ${patches.length} of ${puzzle.clues.length} patches placed, ${left} ${left === 1 ? "cell" : "cells"} left. Drag across the board to draw a patch around a clue.`;
}

/**
 * The Patches board: cells, clues, the patches drawn so far and the one being drawn.
 *
 * Drawing is one gesture of pointer events (mouse, touch and pen alike). Pressing a free cell starts a draft: for
 * most clues a rectangle from that cell to the one under the pointer, and when the press is on the clue of a freeform
 * patch, the cells painted across. Nothing reaches the game until the pointer is released, and a cancelled pointer
 * (a call, a scroll takeover, the page hiding) throws the draft away. Pressing a patch that is already there selects
 * it instead; a patch can never be drawn over. The keyboard does the same with the arrow keys and Enter.
 *
 * The draft, the selection, the cursor and every animation live here, in the component: the committed patches come
 * from the game and are never changed by how long an animation takes. `touch-action: none` is on the board only.
 */
export function Board({
  puzzle,
  patches,
  colors,
  selected,
  hint,
  dead,
  covered,
  won,
  soft,
  onCommit,
  onSelect,
  onRemove,
  onNotice,
}: {
  puzzle: PatchesPuzzle;
  patches: readonly Patch[];
  /** The colour index of every clue's patch. */
  colors: readonly number[];
  /** The clue of the selected patch. */
  selected: number | null;
  hint: Hint | null;
  /** Dead ends to mark, or null when none are shown. */
  dead: Conflicts | null;
  covered: boolean;
  /** The puzzle is solved: play the win animation. */
  won: boolean;
  /** Patches arrive without the cascade (Undo and Redo). */
  soft: boolean;
  /** Offers cells as a patch; the game answers with why it was refused, or null once it is placed. */
  onCommit: (cells: number[]) => DraftCheck | null;
  onSelect: (clue: number | null) => void;
  onRemove: (clue: number) => void;
  /** Says something to the player (a hint at how to draw, say). */
  onNotice: (message: string) => void;
}) {
  const { rows, cols } = puzzle;
  const n = rows * cols;
  const patternId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<{ pointerId: number; kind: "draw" | "tap"; clue: number; last: [number, number]; from: [number, number]; travelled: number } | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [reject, setReject] = useState<{ key: number; cells: number[] } | null>(null);

  const owner = useMemo(() => ownerMap(patches, n), [patches, n]);
  const ownerRef = useRef(owner);
  useEffect(() => {
    ownerRef.current = owner;
  }, [owner]);

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
      setCursor(null);
    }
  }

  // The ref follows the state after every render (it is also set at once by `updateDraft`, because a gesture can deliver several moves before React renders).
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const updateDraft = (next: Draft | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  // ---- What is drawn --------------------------------------------------------

  const enterDelay = useMemo(() => {
    const delays = new Map<number, number>();
    const clueDelays = new Map<number, number>();
    for (const patch of arriving) {
      const steps = soft ? patch.cells.map(() => 0) : cascadeSteps(patch.cells, puzzle.clues[patch.clue].cell, cols);
      patch.cells.forEach((cell, i) => delays.set(cell, Math.min(CASCADE_MAX_MS, steps[i] * CASCADE_MS)));
      clueDelays.set(patch.clue, 0);
    }
    return { cells: delays, clues: clueDelays };
  }, [arriving, soft, puzzle, cols]);

  const lastStep = useMemo(() => {
    let longest = 0;
    for (const delay of enterDelay.cells.values()) longest = Math.max(longest, delay);
    return longest;
  }, [enterDelay]);

  const shownDraft = covered ? null : draft;
  const cells = useMemo(() => (shownDraft ? draftCells(shownDraft, cols) : []), [shownDraft, cols]);
  const check = useMemo(() => (shownDraft ? checkDraft(puzzle, owner, cells) : null), [shownDraft, puzzle, owner, cells]);
  const draftState: "valid" | "neutral" | "blocked" = check?.ok ? "valid" : check?.reason === "overlap" ? "blocked" : "neutral";
  const draftSet = useMemo(() => new Set(cells), [cells]);
  const countLabel = useMemo(() => {
    if (!shownDraft || !check) return null;
    const clue = check.clue !== null ? puzzle.clues[check.clue] : null;
    return clue?.area != null ? `${cells.length}/${clue.area}` : String(cells.length);
  }, [shownDraft, check, cells, puzzle]);

  const hintCells = useMemo(() => new Set(hint?.cells ?? []), [hint]);
  const deadClues = useMemo(() => new Set(dead?.clues ?? []), [dead]);
  const deadCells = useMemo(() => new Set(dead?.cells ?? []), [dead]);
  const patchOf = useMemo(() => new Map(patches.map((p) => [p.clue, p])), [patches]);
  const at = clueAt(puzzle);
  const selectedPatch = selected !== null ? (patchOf.get(selected) ?? null) : null;

  // ---- Pointer ----------------------------------------------------------------

  const rect = (): BoardRect | null => {
    const el = ref.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height, rows, cols };
  };

  /** Lets go of the gesture: the draft is offered to the game (commit) or thrown away. */
  const finish = (commit: boolean) => {
    const gesture = press.current;
    press.current = null;
    const current = draftRef.current;
    updateDraft(null);
    if (!commit || !current || !gesture || gesture.kind !== "draw") return;
    const drawn = draftCells(current, cols);
    if (drawn.length === 1) {
      // A single cell is only a patch when the clue says one cell, or the pointer clearly drew it; a stray tap is not.
      const only = checkDraft(puzzle, ownerRef.current, drawn);
      const sure = only.ok && only.clue !== null && puzzle.clues[only.clue].area === 1;
      if (!sure && gesture.travelled < TAP_SLOP) {
        onNotice("Drag from one corner of the patch to the opposite corner. For a freeform clue, drag across the cells it should take.");
        return;
      }
    }
    const refused = onCommit(drawn);
    if (refused) setReject({ key: Date.now(), cells: drawn });
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
    if (taken >= 0) {
      press.current = { pointerId: event.pointerId, kind: "tap", clue: taken, last: point, from: point, travelled: 0 };
      return;
    }
    press.current = { pointerId: event.pointerId, kind: "draw", clue: -1, last: point, from: point, travelled: 0 };
    updateDraft(beginDraft(puzzle, ownerRef.current, cell));
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
      if (s.kind === "draw" && d) {
        if (d.mode === "rect") {
          const cell = pointToCell(r, point[0], point[1], 1);
          if (cell !== null) d = extendDraft(d, ownerRef.current, cell);
        } else {
          for (const cell of cellsAlong(r, s.last, point)) d = extendDraft(d, ownerRef.current, cell);
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
      updateDraft(null);
      return;
    }
    if (s.kind === "tap") {
      press.current = null;
      // Let go over the same patch it was pressed on, without dragging away: select it (again: deselect).
      const r = rect();
      const cell = r ? pointToCell(r, event.clientX, event.clientY, 1) : null;
      if (s.travelled < TAP_SLOP * 2 && cell !== null && ownerRef.current[cell] === s.clue) onSelect(selected === s.clue ? null : s.clue);
      return;
    }
    finish(true);
  };

  /** The pointer was taken away (a system gesture, a lost capture): nothing is placed. */
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
      if (d) updateDraft(extendDraft(d, ownerRef.current, next));
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
        const refused = onCommit(drawn);
        if (refused) setReject({ key: Date.now(), cells: drawn });
      } else if (ownerRef.current[here] >= 0) {
        const clue = ownerRef.current[here];
        onSelect(selected === clue ? null : clue);
      } else {
        updateDraft(beginDraft(puzzle, ownerRef.current, here));
      }
      return;
    }
    if (key === "Escape") {
      if (draftRef.current || selected !== null) {
        stop();
        updateDraft(null);
        onSelect(null);
      }
      return;
    }
    if (key === "Delete" || key === "Backspace") {
      const target = selected ?? (cursor !== null && ownerRef.current[cursor] >= 0 ? ownerRef.current[cursor] : null);
      if (target !== null) {
        stop();
        onRemove(target);
      }
    }
  };

  // ---- Render ------------------------------------------------------------------------

  const style = useMemo(() => ({ "--pt": ACCENT.patches, "--ptn": cols, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }) as CSSProperties, [cols, rows]);
  const left = n - patches.reduce((total, p) => total + p.cells.length, 0);
  const lineDelay = lastStep + CASCADE_MS;
  const spoken =
    cursor === null
      ? ""
      : `${placeName(cursor, cols)}. ${at[cursor] >= 0 ? `Clue: ${describeClue(puzzle.clues[at[cursor]])}.` : owner[cursor] >= 0 ? "In a patch." : "Empty."}${shownDraft ? ` Drawing, ${cells.length} ${cells.length === 1 ? "cell" : "cells"}.` : ""}`;
  const head = shownDraft ? shownDraft.head : -1;

  return (
    <div className="pt-board" data-covered={covered ? "true" : undefined} data-won={won ? "true" : undefined} data-soft={soft ? "true" : undefined} style={style}>
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
          if (draftRef.current && !press.current) updateDraft(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {Array.from({ length: n }, (_, i) => {
          const clueIndex = at[i];
          const owned = owner[i];
          return (
            <Cell
              key={i}
              color={owned >= 0 ? colors[owned] : -1}
              enter={enterDelay.cells.has(i) ? enterDelay.cells.get(i)! : null}
              clue={clueIndex >= 0 ? puzzle.clues[clueIndex] : null}
              placed={clueIndex >= 0 && patchOf.has(clueIndex)}
              dead={clueIndex >= 0 ? deadClues.has(clueIndex) : deadCells.has(i)}
              hinted={hintCells.has(i)}
              cursor={cursor === i}
              draft={shownDraft && draftSet.has(i) ? draftState : null}
              count={i === head ? countLabel : null}
              clueEnter={clueIndex >= 0 && enterDelay.clues.has(clueIndex) ? enterDelay.clues.get(clueIndex)! : null}
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
          {(dead?.cells ?? []).length > 0 && <path d={cellsPath(dead!.cells, cols)} fill={`url(#${patternId}-dead)`} className="pt-dead" />}
          {patches.map((p) => (
            <path key={`${p.clue}:${p.cells[0]}`} className="pt-line" d={outlinePath(p.cells, cols)} data-enter={enterDelay.clues.has(p.clue) ? "" : undefined} style={{ "--ld": `${lineDelay}ms` } as CSSProperties} />
          ))}
          {leaving.map((p) => (
            <path key={`gone:${p.clue}:${p.cells[0]}`} className="pt-line" data-leaving="" d={outlinePath(p.cells, cols)} />
          ))}
          {selectedPatch && <path className="pt-selected" d={outlinePath(selectedPatch.cells, cols)} />}
          {shownDraft && cells.length > 0 && <path className="pt-draft-line" data-state={draftState} d={outlinePath(cells, cols)} />}
          {reject && (
            <g key={reject.key} className="pt-reject">
              <path className="pt-reject-fill" d={cellsPath(reject.cells, cols)} />
              <path className="pt-reject-line" d={outlinePath(reject.cells, cols)} />
            </g>
          )}
        </svg>
        {won && <span className="pt-sweep" aria-hidden />}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {spoken}
      </p>
    </div>
  );
}
