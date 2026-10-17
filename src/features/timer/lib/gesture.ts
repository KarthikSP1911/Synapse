import type { Point } from "./corner";

/** One finger or mouse button on the widget can mean three things. */
export const DRAG_SLOP_PX = 6;
export const LONG_PRESS_MS = 500;

export type Gesture = "tap" | "drag" | "longpress";

/** Has the pointer moved far enough from where it went down to count as a drag, not a tap? */
export const exceedsSlop = (from: Point, to: Point): boolean => Math.hypot(to.x - from.x, to.y - from.y) > DRAG_SLOP_PX;

/** What a finished press was. A press that became a drag stays a drag; a held press that did not move is a long-press. */
export function releaseGesture(state: { moved: boolean; heldLong: boolean }): Gesture {
  if (state.moved) return "drag";
  return state.heldLong ? "longpress" : "tap";
}
