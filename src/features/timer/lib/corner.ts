import type { Corner } from "./storage";

/** Where the floating widget can sit, and how it keeps clear of the screen's chrome and of what the user is working on. All values are CSS pixels. */

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface Viewport {
  width: number;
  height: number;
  /** Space to leave free at each edge: the safe area, the header or tab bar when they are showing, and a margin. */
  insets: { top: number; right: number; bottom: number; left: number };
}

export type Spot = { kind: "corner"; corner: Corner } | { kind: "edge"; side: "left" | "right"; slot: 0 | 1 | 2 };

export const CORNERS: readonly Corner[] = ["tl", "tr", "bl", "br"];
/** Breathing room kept between the widget and anything marked `data-timer-clear`. */
export const CLEARANCE = 6;

export function spotRect(spot: Spot, viewport: Viewport, size: Size): Rect {
  const { insets } = viewport;
  const minX = insets.left;
  const maxX = Math.max(minX, viewport.width - insets.right - size.width);
  const minY = insets.top;
  const maxY = Math.max(minY, viewport.height - insets.bottom - size.height);
  let left: number;
  let top: number;
  if (spot.kind === "corner") {
    left = spot.corner === "tl" || spot.corner === "bl" ? minX : maxX;
    top = spot.corner === "tl" || spot.corner === "tr" ? minY : maxY;
  } else {
    left = spot.side === "left" ? minX : maxX;
    top = minY + ((maxY - minY) * (spot.slot + 1)) / 4;
  }
  return { left, top, right: left + size.width, bottom: top + size.height };
}

const center = (r: Rect): Point => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** The corner nearest to where the widget was let go (`point` is its centre). */
export function snapCorner(point: Point, viewport: Viewport, size: Size): Corner {
  let best: Corner = "br";
  let bestDistance = Infinity;
  for (const corner of CORNERS) {
    const d = distance(point, center(spotRect({ kind: "corner", corner }, viewport, size)));
    if (d < bestDistance) {
      best = corner;
      bestDistance = d;
    }
  }
  return best;
}

export function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
}

export interface Placement {
  spot: Spot;
  size: Size;
  rect: Rect;
}

/**
 * Picks where to put the widget: the remembered corner if nothing is under it, otherwise the nearest free corner, then a
 * free slot on a side edge. `sizes` run from the largest to the smallest, so a tight screen shrinks the widget before
 * giving up. Null means there is no room at all.
 *
 * There are two kinds of obstacle. `hard` ones (the board, the answer box, the keypad) are never covered. `soft` ones (rows of
 * buttons, scores) are avoided while there is room, but when that leaves no spot at all the widget goes over them rather than
 * disappearing: a timer nobody can see is worse than one the user may have to drag aside.
 */
export function placeWidget(preferred: Corner, viewport: Viewport, sizes: readonly Size[], hard: readonly Rect[], soft: readonly Rect[] = []): Placement | null {
  return place(preferred, viewport, sizes, [...hard, ...soft]) ?? (soft.length > 0 ? place(preferred, viewport, sizes, hard) : null);
}

function place(preferred: Corner, viewport: Viewport, sizes: readonly Size[], obstacles: readonly Rect[]): Placement | null {
  for (const size of sizes) {
    const home = center(spotRect({ kind: "corner", corner: preferred }, viewport, size));
    const spots: Spot[] = [
      ...CORNERS.map((corner): Spot => ({ kind: "corner", corner })),
      ...(["left", "right"] as const).flatMap((side) => ([0, 1, 2] as const).map((slot): Spot => ({ kind: "edge", side, slot }))),
    ];
    // Corners come before edges; within each kind the nearest to the remembered corner comes first.
    const rank = (spot: Spot) => (spot.kind === "corner" ? 0 : 1_000_000) + distance(center(spotRect(spot, viewport, size)), home);
    spots.sort((a, b) => rank(a) - rank(b));
    for (const spot of spots) {
      const rect = spotRect(spot, viewport, size);
      if (!obstacles.some((o) => overlaps(rect, o, CLEARANCE))) return { spot, size, rect };
    }
  }
  return null;
}
