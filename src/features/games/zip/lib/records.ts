import { isDifficulty } from "@/features/games/shared/lib/puzzle-session";
import { MAX_PLAYED_MS, openRecord, type Parsed } from "@/lib/records";
import { isIntInRange } from "@/lib/validation";
import { cellCount, parsePuzzle } from "./puzzle-format";
import { solvePuzzle } from "./solver";
import type { SessionData } from "./types";

/**
 * Checks a saved or uploaded Zip game. Nothing in it is trusted: the puzzle must be well formed, and (for uploads)
 * the solver must prove it has exactly one solution within its fixed node budget; a puzzle it cannot settle is
 * rejected as unverified. The counters must be sane and the time played cannot exceed the time between start and
 * end. Points are not part of the record: they are worked out again from it wherever they are needed. Only the
 * structure of the puzzle is checked, never the generator's current settings, so tuning them cannot reject old games.
 */

/** Playing time may exceed the wall-clock span by this much (timer rounding between saves). */
const ELAPSED_SLACK_MS = 5000;
const MAX_HINTS = 1000;
/** A solved board takes at least a few moments per square, even drawn in one stroke. */
export const MIN_MS_PER_CELL = 20;

export type ParsedSession = Parsed<SessionData>;

/**
 * `now` makes the check against future dates; leave it out for data read back from this device.
 * `verify` also searches the puzzle for its solutions (bounded, but only worth doing for uploads).
 */
export function parseSessionData(raw: unknown, { now, verify = false }: { now?: number; verify?: boolean } = {}): ParsedSession {
  const head = openRecord(raw, "game", now);
  if (!head.ok) return head;
  const { clientId, startedAt, endedAt, fail } = head;

  const { difficulty, puzzle, completed, elapsedMs, hintsUsed } = head.raw;
  if (!isDifficulty(difficulty)) return fail("Invalid difficulty.");
  const parsed = parsePuzzle(puzzle);
  if (!parsed) return fail("Invalid puzzle.");
  if (verify) {
    const result = solvePuzzle(parsed);
    if (result.exceeded) return fail("The puzzle could not be verified.");
    if (result.count !== 1) return fail("The puzzle does not have exactly one solution.");
  }
  if (typeof completed !== "boolean") return fail("Invalid completed flag.");
  if (!isIntInRange(elapsedMs, 0, MAX_PLAYED_MS)) return fail("Invalid time played.");
  if (elapsedMs > endedAt - startedAt + ELAPSED_SLACK_MS) return fail("More time played than the game lasted.");
  if (completed && elapsedMs < MIN_MS_PER_CELL * cellCount(parsed)) return fail("The puzzle was solved implausibly fast.");
  if (!isIntInRange(hintsUsed, 0, MAX_HINTS)) return fail("Invalid hint count.");

  return { ok: true, data: { clientId, startedAt, endedAt, difficulty, puzzle: puzzle as string, completed, elapsedMs, hintsUsed } };
}
