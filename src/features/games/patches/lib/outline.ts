/**
 * Drawing helpers for the board, kept free of React so they can be tested. Everything is in cell units: the board's
 * SVG has a viewBox of one unit per cell, so a path scales with the board from a 320px phone to a desktop.
 */

/** The outline of a set of cells as SVG path data: one segment for every side that has no neighbour in the set. */
export function outlinePath(cells: readonly number[], cols: number): string {
  const inSet = new Set(cells);
  const parts: string[] = [];
  for (const cell of cells) {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    if (!inSet.has(cell - cols)) parts.push(`M${c} ${r}h1`);
    if (c === cols - 1 || !inSet.has(cell + 1)) parts.push(`M${c + 1} ${r}v1`);
    if (!inSet.has(cell + cols)) parts.push(`M${c} ${r + 1}h1`);
    if (c === 0 || !inSet.has(cell - 1)) parts.push(`M${c} ${r}v1`);
  }
  return parts.join("");
}

/** The cells as filled unit squares, one path for all of them. */
export function cellsPath(cells: readonly number[], cols: number): string {
  return cells.map((cell) => `M${cell % cols} ${Math.floor(cell / cols)}h1v1h-1z`).join("");
}

/**
 * The order in which a patch fills in: the clue first, then outwards one step at a time (cells equally far from the
 * clue arrive together). The result lists the step of every cell, in the order of `cells`.
 */
export function cascadeSteps(cells: readonly number[], from: number, cols: number): number[] {
  const inSet = new Set(cells);
  const step = new Map<number, number>([[from, 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    const c = cell % cols;
    for (const m of [cell - cols, cell + cols, c > 0 ? cell - 1 : -1, c < cols - 1 ? cell + 1 : -1]) {
      if (m >= 0 && inSet.has(m) && !step.has(m)) {
        step.set(m, step.get(cell)! + 1);
        queue.push(m);
      }
    }
  }
  // A cell the walk cannot reach (never in a valid patch) simply comes last.
  const last = Math.max(0, ...step.values()) + 1;
  return cells.map((cell) => step.get(cell) ?? last);
}

type Point = [number, number];

/**
 * The outline of a set of cells as closed loops of corner points, walked clockwise on the screen with the cells on the
 * right-hand side, and with straight runs merged (only real corners are kept). A shape with a hole has a second loop.
 * Where two cells meet only at a corner the walk turns right, so the pieces stay separate loops.
 */
export function boundaryLoops(cells: readonly number[], cols: number): Point[][] {
  const inSet = new Set(cells);
  // Every side that has no neighbour is a directed edge, keyed by where it starts.
  const out = new Map<string, Point[]>();
  const add = (from: Point, to: Point) => {
    const key = `${from[0]},${from[1]}`;
    const list = out.get(key);
    if (list) list.push(to);
    else out.set(key, [to]);
  };
  for (const cell of cells) {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    if (!inSet.has(cell - cols)) add([c, r], [c + 1, r]);
    if (c === cols - 1 || !inSet.has(cell + 1)) add([c + 1, r], [c + 1, r + 1]);
    if (!inSet.has(cell + cols)) add([c + 1, r + 1], [c, r + 1]);
    if (c === 0 || !inSet.has(cell - 1)) add([c, r + 1], [c, r]);
  }

  const loops: Point[][] = [];
  for (const [startKey, targets] of out) {
    while (targets.length > 0) {
      const [sx, sy] = startKey.split(",").map(Number);
      const loop: Point[] = [[sx, sy]];
      let at: Point = [sx, sy];
      let dir: Point | null = null;
      for (let guard = 0; guard < 10_000; guard++) {
        const options = out.get(`${at[0]},${at[1]}`);
        if (!options || options.length === 0) break;
        // Prefer the sharpest right turn, then straight on, then a left turn.
        let pick = 0;
        if (options.length > 1 && dir) {
          const score = (to: Point): number => {
            const d: Point = [to[0] - at[0], to[1] - at[1]];
            const cross = dir![0] * d[1] - dir![1] * d[0]; // positive: a right turn on the screen
            return cross > 0 ? 2 : cross === 0 ? 1 : 0;
          };
          pick = options.reduce((best, to, i) => (score(to) > score(options[best]) ? i : best), 0);
        }
        const [next] = options.splice(pick, 1);
        dir = [next[0] - at[0], next[1] - at[1]];
        at = next;
        if (at[0] === sx && at[1] === sy) break;
        loop.push(at);
      }
      loops.push(loop);
    }
  }
  // Merge straight runs.
  return loops.map((loop) =>
    loop.filter((point, i) => {
      const before = loop[(i + loop.length - 1) % loop.length];
      const after = loop[(i + 1) % loop.length];
      return (point[0] - before[0]) * (after[1] - point[1]) - (point[1] - before[1]) * (after[0] - point[0]) !== 0;
    })
  );
}

const fixed = (n: number): string => String(Math.round(n * 1000) / 1000);

/**
 * A patch drawn as in the paper puzzle: its outline pulled in a little from the cell lines (`inset`, so patches that
 * touch keep a gap between them) and with rounded corners (`radius`). One path for all loops; fill it with the
 * even-odd rule so a hole stays open.
 */
export function patchShapePath(cells: readonly number[], cols: number, inset = 0.06, radius = 0.14): string {
  const parts: string[] = [];
  for (const loop of boundaryLoops(cells, cols)) {
    const n = loop.length;
    if (n < 3) continue;
    const unit = (a: Point, b: Point): Point => {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    };
    // Each corner moves inwards by `inset` along both of its edges' normals (the cells are on the right: normal = (-dy, dx)).
    const moved: Point[] = loop.map((p, i) => {
      const d1 = unit(loop[(i + n - 1) % n], p);
      const d2 = unit(p, loop[(i + 1) % n]);
      return [p[0] + inset * (-d1[1] - d2[1]), p[1] + inset * (d1[0] + d2[0])];
    });
    const arrive = (i: number): Point => {
      const p = moved[i];
      const before = moved[(i + n - 1) % n];
      const u = unit(before, p);
      const r = Math.min(radius, Math.hypot(p[0] - before[0], p[1] - before[1]) / 2);
      return [p[0] - u[0] * r, p[1] - u[1] * r];
    };
    const leave = (i: number): Point => {
      const p = moved[i];
      const after = moved[(i + 1) % n];
      const u = unit(p, after);
      const r = Math.min(radius, Math.hypot(after[0] - p[0], after[1] - p[1]) / 2);
      return [p[0] + u[0] * r, p[1] + u[1] * r];
    };
    const first = leave(0);
    let d = `M${fixed(first[0])} ${fixed(first[1])}`;
    for (let i = 1; i <= n; i++) {
      const k = i % n;
      const a = arrive(k);
      const b = leave(k);
      d += `L${fixed(a[0])} ${fixed(a[1])}Q${fixed(moved[k][0])} ${fixed(moved[k][1])} ${fixed(b[0])} ${fixed(b[1])}`;
    }
    parts.push(`${d}Z`);
  }
  return parts.join("");
}

/**
 * Where the small size label of a patch sits, in cell units from the top-left of the board: the middle of its box (for
 * an odd shape, the patch cell nearest to that). When that is the clue's own cell, the label is moved down a little so
 * it does not cover the clue.
 */
export function labelSpot(cells: readonly number[], clueCell: number, cols: number): { x: number; y: number } {
  let r0 = Infinity;
  let r1 = -Infinity;
  let c0 = Infinity;
  let c1 = -Infinity;
  for (const cell of cells) {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r);
    c0 = Math.min(c0, c);
    c1 = Math.max(c1, c);
  }
  let x = (c0 + c1 + 1) / 2;
  let y = (r0 + r1 + 1) / 2;
  const full = (r1 - r0 + 1) * (c1 - c0 + 1) === cells.length;
  if (!full) {
    // Not a rectangle: the cell of the patch whose middle is closest to the middle of the box.
    let best = Infinity;
    for (const cell of cells) {
      const cx = (cell % cols) + 0.5;
      const cy = Math.floor(cell / cols) + 0.5;
      const dist = (cx - x) ** 2 + (cy - y) ** 2;
      if (dist < best) {
        best = dist;
        x = cx;
        y = cy;
      }
    }
  }
  const clueX = (clueCell % cols) + 0.5;
  const clueY = Math.floor(clueCell / cols) + 0.5;
  if (Math.abs(clueX - x) < 0.5 && Math.abs(clueY - y) < 0.5) y += 0.32;
  return { x, y };
}
