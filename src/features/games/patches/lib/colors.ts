/**
 * Which colour each patch is filled with. The colour belongs to the clue, not to the patch the player drew, so it
 * stays the same when a patch is removed and drawn again. It is worked out from the solution's neighbours so that
 * patches that touch in the solution never share a colour (a few extra colours are never needed on a grid); a patch
 * drawn wrongly may still touch one of its own colour, which is why patches also have outlines and never rely on
 * colour alone.
 */

export const PALETTE_SIZE = 8;

/** A colour index (0 to PALETTE_SIZE - 1) for every clue, given the owning clue of every cell in the solution. */
export function patchColors(owner: readonly number[], clueCount: number, rows: number, cols: number): number[] {
  const touching: Set<number>[] = Array.from({ length: clueCount }, () => new Set());
  const join = (a: number, b: number) => {
    if (a >= 0 && b >= 0 && a !== b) {
      touching[a].add(b);
      touching[b].add(a);
    }
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = r * cols + c;
      if (c + 1 < cols) join(owner[cell], owner[cell + 1]);
      if (r + 1 < rows) join(owner[cell], owner[cell + cols]);
    }
  }
  // Most neighbours first, so the hard cases get their colour while there is still a choice.
  const order = Array.from({ length: clueCount }, (_, i) => i).sort((a, b) => touching[b].size - touching[a].size || a - b);
  const colors = new Array<number>(clueCount).fill(-1);
  for (const clue of order) {
    const used = new Set([...touching[clue]].map((other) => colors[other]));
    let color = 0;
    while (used.has(color)) color++;
    colors[clue] = color % PALETTE_SIZE;
  }
  return colors;
}
