"use client";

import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { ACCENT } from "@/lib/skills/accent";
import type { UiTile } from "@/lib/game2048/tiles";
import { SIZE, WIN_TILE, type Direction } from "@/lib/game2048/types";

/** How far a finger or the mouse must travel before it counts as a swipe, at most this many pixels (less on a small board). */
const SWIPE_PX = 28;

interface Gesture {
  pointerId: number;
  x: number;
  y: number;
  done: boolean;
}

/**
 * The 4x4 board: empty cells underneath, the tiles on top, and an optional overlay (win, game over) over both.
 * Swipes (touch, pen or a mouse drag) call `onSwipe` once per gesture, as soon as the travel is long enough, so
 * the board answers while the finger is still down. The frame stops the browser from scrolling or zooming on it.
 */
export function Board({ tiles, onSwipe, overlay, description }: { tiles: readonly UiTile[]; onSwipe: (direction: Direction) => void; overlay?: ReactNode; description: string }) {
  const gesture = useRef<Gesture | null>(null);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesture.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, done: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.done || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const threshold = Math.min(SWIPE_PX, e.currentTarget.getBoundingClientRect().width * 0.08);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    g.done = true;
    onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  };

  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId === e.pointerId) gesture.current = null;
  };

  return (
    <div className="g48-board relative w-full" style={{ "--g48": ACCENT.game2048 } as CSSProperties}>
      <div className="g48-frame" role="group" aria-label={description} tabIndex={0} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <div className="g48-cells" aria-hidden>
          {Array.from({ length: SIZE * SIZE }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <div className="g48-tiles" aria-hidden>
          {tiles.map((t) => (
            <div key={t.id} className="g48-tile" data-value={t.value} data-digits={String(t.value).length} data-super={t.value > WIN_TILE} data-ghost={t.ghost} data-merged={t.merged} style={{ "--r": Math.floor(t.index / SIZE), "--c": t.index % SIZE } as CSSProperties}>
              <span data-fresh={t.fresh} data-merged={t.merged}>
                {t.value}
              </span>
            </div>
          ))}
        </div>
      </div>
      {overlay}
    </div>
  );
}
