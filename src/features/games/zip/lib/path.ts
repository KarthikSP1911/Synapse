import type { Rng } from "@/lib/random";

/**
 * A random Hamiltonian path on a grid (one that visits every cell exactly once, moving to a neighbouring cell each
 * time). Starts from the boustrophedon "snake", which always exists, and stirs it with backbite moves: take one end
 * of the path, join it to a neighbouring cell of the grid that is further along the path, and reverse the part in
 * between. Each move keeps the path Hamiltonian, so there is no search that can fail or backtrack.
 */
export function randomHamiltonianPath(rows: number, cols: number, rng: Rng, moves = 20 * rows * cols): number[] {
  let path: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) path.push(r * cols + (r % 2 === 0 ? i : cols - 1 - i));
  }
  const index = new Int16Array(rows * cols);
  const reindex = () => path.forEach((cell, i) => (index[cell] = i));
  reindex();

  for (let m = 0; m < moves; m++) {
    const fromEnd = rng() < 0.5;
    if (!fromEnd) {
      path = path.slice().reverse();
      reindex();
    }
    // Now stir from the tail.
    const tail = path[path.length - 1];
    const r = Math.floor(tail / cols);
    const c = tail % cols;
    const options = [r > 0 ? tail - cols : -1, r < rows - 1 ? tail + cols : -1, c > 0 ? tail - 1 : -1, c < cols - 1 ? tail + 1 : -1].filter((x) => x >= 0 && index[x] < path.length - 2);
    if (options.length > 0) {
      const x = options[Math.floor(rng() * options.length)];
      const j = index[x];
      path = [...path.slice(0, j + 1), ...path.slice(j + 1).reverse()];
      reindex();
    }
  }
  return path;
}
