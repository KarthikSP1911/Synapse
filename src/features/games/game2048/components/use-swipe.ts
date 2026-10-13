import { useRef, type PointerEvent } from "react";
import type { Direction } from "@/features/games/game2048/lib/types";

/** How far a finger or the mouse must travel before it counts as a swipe. */
export const SWIPE_PX = 24;

/** Things that keep their own taps and clicks: a swipe never starts on them. */
const OWN_INPUT = "button, a, summary, input, select, textarea, [role='tab'], [role='dialog']";

interface Gesture {
  pointerId: number;
  x: number;
  y: number;
  done: boolean;
}

/** The direction of a drag of (dx, dy), or null while it is still shorter than the swipe distance. */
export function swipeDirection(dx: number, dy: number, threshold = SWIPE_PX): Direction | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

/**
 * Pointer handlers that turn a touch, pen or mouse drag into one `onSwipe` per gesture, as soon as the travel is
 * long enough (the board answers while the finger is still down). Put them on the whole play area, with
 * `touch-action: none`, so a swipe anywhere on it moves the tiles instead of scrolling the page. A drag that starts
 * on a button, link or dialog is left alone, and nothing is handled while `enabled` is false.
 */
export function useSwipe(onSwipe: (direction: Direction) => void, enabled: boolean) {
  const gesture = useRef<Gesture | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (e.target instanceof Element && e.target.closest(OWN_INPUT)) return;
    gesture.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, done: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.done || g.pointerId !== e.pointerId) return;
    const direction = swipeDirection(e.clientX - g.x, e.clientY - g.y);
    if (!direction) return;
    g.done = true;
    onSwipe(direction);
  };

  const end = (e: PointerEvent<HTMLElement>) => {
    if (gesture.current?.pointerId === e.pointerId) gesture.current = null;
  };

  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}
