import { CLIENT_ID } from "@/lib/mindsprint/records";
import { parseGrid } from "./grid";
import { isDifficulty } from "./scoring";
import { countSolutions } from "./solver";
import { CELLS, type SessionData } from "./types";

/**
 * Checks a saved or uploaded game. Nothing in it is trusted: the puzzle must be a well-formed grid with exactly
 * one solution, the counters must be sane, and the time played cannot exceed the time between start and end.
 * Points are not part of the record: they are worked out again from it wherever they are needed.
 */

/** Local clocks drift; a game claiming to end further ahead than this is rejected. */
const FUTURE_SLACK_MS = 5 * 60 * 1000;
/** Playing time may exceed the wall-clock span by this much (timer rounding between saves). */
const ELAPSED_SLACK_MS = 5000;
const MAX_ELAPSED_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_COUNT = 10_000;
/** The fewest clues any puzzle with a unique solution can have is 17. */
const MIN_CLUES = 17;

export type ParsedSession = { ok: true; data: SessionData } | { ok: false; clientId: string | null; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isEpoch = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT;

/**
 * `now` makes the check against future dates; leave it out for data read back from this device.
 * `verify` also searches the puzzle for its solutions (cheap, but only worth doing for uploads).
 */
export function parseSessionData(raw: unknown, { now, verify = false }: { now?: number; verify?: boolean } = {}): ParsedSession {
  if (!isObject(raw)) return { ok: false, clientId: null, reason: "Session must be an object." };
  const clientId = typeof raw.clientId === "string" && CLIENT_ID.test(raw.clientId) ? raw.clientId : null;
  if (clientId === null) return { ok: false, clientId: null, reason: "Invalid clientId." };
  const fail = (reason: string): ParsedSession => ({ ok: false, clientId, reason });

  const { startedAt, endedAt, difficulty, puzzle, completed, elapsedMs, mistakes, hintsUsed } = raw;
  if (!isEpoch(startedAt) || !isEpoch(endedAt) || endedAt < startedAt) return fail("Invalid game times.");
  if (now !== undefined && endedAt > now + FUTURE_SLACK_MS) return fail("The game ends in the future.");
  if (!isDifficulty(difficulty)) return fail("Invalid difficulty.");
  const grid = parseGrid(puzzle);
  if (!grid || grid.length !== CELLS || grid.filter(Boolean).length < MIN_CLUES) return fail("Invalid puzzle.");
  if (verify && countSolutions(grid, 2) !== 1) return fail("The puzzle does not have exactly one solution.");
  if (typeof completed !== "boolean") return fail("Invalid completed flag.");
  if (typeof elapsedMs !== "number" || !Number.isInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > MAX_ELAPSED_MS) return fail("Invalid time played.");
  if (elapsedMs > endedAt - startedAt + ELAPSED_SLACK_MS) return fail("More time played than the game lasted.");
  if (!isCount(mistakes) || !isCount(hintsUsed)) return fail("Invalid mistake or hint count.");

  return { ok: true, data: { clientId, startedAt, endedAt, difficulty, puzzle: puzzle as string, completed, elapsedMs, mistakes, hintsUsed } };
}
