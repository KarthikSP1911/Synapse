interface SquareRangeInput {
  n: number;
  attempts: number;
  correct: number;
  averageResponseTimeMs: number;
}

export interface RangeBucket {
  label: string;
  attempts: number;
  /** 0-100; 0 when nothing in the range has been attempted. */
  accuracy: number;
  avgSeconds: number;
}

/**
 * Recall by range of n (1-10, 11-20, ... 91-100) for the squares progress chart. Each range pools the
 * attempts of its numbers, so accuracy is weighted by how often each was asked.
 */
export function squareRangeBuckets(cells: SquareRangeInput[], size = 10): RangeBucket[] {
  const buckets = Array.from({ length: Math.ceil(100 / size) }, (_, i) => ({
    label: `${i * size + 1}–${Math.min(100, (i + 1) * size)}`,
    attempts: 0,
    correct: 0,
    time: 0,
  }));
  for (const cell of cells) {
    if (cell.n < 1 || cell.n > 100) continue;
    const bucket = buckets[Math.floor((cell.n - 1) / size)];
    bucket.attempts += cell.attempts;
    bucket.correct += cell.correct;
    bucket.time += cell.averageResponseTimeMs * cell.attempts;
  }
  return buckets.map((b) => ({
    label: b.label,
    attempts: b.attempts,
    accuracy: b.attempts > 0 ? Math.round((b.correct / b.attempts) * 100) : 0,
    avgSeconds: b.attempts > 0 ? Math.round(b.time / b.attempts / 100) / 10 : 0,
  }));
}
