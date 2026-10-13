/**
 * Benchmarks puzzle generation and verification: `npx tsx scripts/bench-puzzles.ts <queens|zip|batch> [count]`.
 * Reports success rate, attempts per success, time per puzzle and (for Zip) solver nodes at every difficulty, so grid
 * sizes and technique thresholds are set from measurements. `batch` times what the server does for one upload of
 * ten Zip and ten Queens records. Not part of `npm test`.
 */
import { seededRng } from "../src/lib/random";
import { DIFFICULTIES } from "../src/features/games/shared/lib/puzzle-session";
import { generatePuzzle as generateQueens, GenerationError as QueensError, type Attempts as QueensAttempts } from "../src/features/games/queens/lib/generator";
import { parseSessionData as parseQueensRecord } from "../src/features/games/queens/lib/records";
import { generatePuzzle as generateZip, GenerationError as ZipError, type Attempts as ZipAttempts } from "../src/features/games/zip/lib/generator";
import { parseSessionData as parseZipRecord } from "../src/features/games/zip/lib/records";

const [game = "queens", countArg = "30"] = process.argv.slice(2);
const count = Number(countArg);

const pct = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const avg = (xs: number[]): string => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(1);

if (game === "queens") {
  for (const difficulty of DIFFICULTIES) {
    const times: number[] = [];
    const stats: QueensAttempts = { attempts: 0, unique: 0 };
    let failed = 0;
    for (let seed = 1; seed <= count; seed++) {
      const t0 = performance.now();
      try {
        generateQueens(difficulty, seededRng(seed * 7919), undefined, stats);
        times.push(performance.now() - t0);
      } catch (e) {
        if (!(e instanceof QueensError)) throw e;
        failed++;
      }
    }
    times.sort((a, b) => a - b);
    const ok = times.length;
    console.log(
      `${difficulty.padEnd(7)} ok ${ok}/${count}  attempts/puzzle ${(stats.attempts / Math.max(1, ok)).toFixed(0)}  unique/puzzle ${(stats.unique / Math.max(1, ok)).toFixed(1)}  ms mean ${avg(times)} p95 ${ok ? pct(times, 95).toFixed(0) : "-"} max ${ok ? times[ok - 1].toFixed(0) : "-"}  failed ${failed}`
    );
  }
}

if (game === "zip") {
  for (const difficulty of DIFFICULTIES) {
    const times: number[] = [];
    const stats: ZipAttempts = { attempts: 0, solves: 0, nodes: [], walls: [], checkpoints: [] };
    let failed = 0;
    for (let seed = 1; seed <= count; seed++) {
      const t0 = performance.now();
      try {
        generateZip(difficulty, seededRng(seed * 7919), undefined, stats);
        times.push(performance.now() - t0);
      } catch (e) {
        if (!(e instanceof ZipError)) throw e;
        failed++;
      }
    }
    times.sort((a, b) => a - b);
    const nodes = [...stats.nodes].sort((a, b) => a - b);
    const ok = times.length;
    console.log(
      `${difficulty.padEnd(7)} ok ${ok}/${count}  attempts/puzzle ${(stats.attempts / Math.max(1, ok)).toFixed(1)}  ms mean ${avg(times)} p95 ${ok ? pct(times, 95).toFixed(0) : "-"} max ${ok ? times[ok - 1].toFixed(0) : "-"}  nodes mean ${avg(nodes)} p95 ${ok ? pct(nodes, 95) : "-"} max ${ok ? nodes[ok - 1] : "-"}  walls ${avg(stats.walls)} checkpoints ${avg(stats.checkpoints)}  failed ${failed}`
    );
  }
}

if (game === "batch") {
  // The server verifies up to ten records per upload request: time ten of the most expensive kind.
  const T0 = 1_700_000_000_000;
  for (const [name, make, parse] of [
    ["zip", (d: (typeof DIFFICULTIES)[number], s: number) => generateZip(d, seededRng(s)).puzzle, parseZipRecord],
    ["queens", (d: (typeof DIFFICULTIES)[number], s: number) => generateQueens(d, seededRng(s)).regions, parseQueensRecord],
  ] as const) {
    for (const difficulty of ["hard", "expert"] as const) {
      const records = Array.from({ length: 10 }, (_, i) => ({
        clientId: `bench-${name}-${i}-0000`,
        startedAt: T0,
        endedAt: T0 + 3_600_000,
        difficulty,
        puzzle: make(difficulty, 100 + i),
        completed: true,
        elapsedMs: 600_000,
        hintsUsed: 0,
      }));
      const t0 = performance.now();
      const accepted = records.filter((r) => parse(r, { now: T0 + 4_000_000, verify: true }).ok).length;
      console.log(`${name.padEnd(6)} ${difficulty.padEnd(7)} batch of 10: ${(performance.now() - t0).toFixed(0)} ms, accepted ${accepted}/10`);
    }
  }
}
