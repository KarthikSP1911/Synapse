import { CLIENT_ID } from "@/lib/mindsprint/records";
import { isPowerOfTwo } from "./engine";
import { MAX_TILE, WIN_TILE, type SessionData } from "./types";

/**
 * Checks a saved or uploaded game. Nothing in it is trusted. The moves are not recorded, so the figures cannot be
 * replayed, but they must be possible: the tile is a power of two the board can hold, the score is at least what
 * merging up to that tile earns, there were enough moves to spawn it, the 2048 flag agrees with the tile, and the
 * time played fits between start and end.
 */

/** Local clocks drift; a game claiming to end further ahead than this is rejected. */
const FUTURE_SLACK_MS = 5 * 60 * 1000;
/** Playing time may exceed the wall-clock span by this much (rounding between saves). */
const DURATION_SLACK_MS = 5000;
const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
/** Every move adds a 2 or a 4 and the board holds at most about 2^18 in total, so no game has more moves than this. */
const MAX_MOVES = 200_000;
/** The most a 4x4 game can score (all tiles merged up to 131072). */
export const MAX_SCORE = 3_932_156;

export type ParsedSession = { ok: true; data: SessionData } | { ok: false; clientId: string | null; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isEpoch = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** The least a score can be if a tile of this value was made: merging 4s up to it, the cheapest route, scores (k-2)*2^k. */
export const minScoreFor = (tile: number): number => (Math.log2(tile) - 2) * tile;

/** `now` makes the check against future dates; leave it out for data read back from this device. */
export function parseSessionData(raw: unknown, now?: number): ParsedSession {
  if (!isObject(raw)) return { ok: false, clientId: null, reason: "Game must be an object." };
  const clientId = typeof raw.clientId === "string" && CLIENT_ID.test(raw.clientId) ? raw.clientId : null;
  if (clientId === null) return { ok: false, clientId: null, reason: "Invalid clientId." };
  const fail = (reason: string): ParsedSession => ({ ok: false, clientId, reason });

  const { startedAt, endedAt, score, highestTile, moves, durationMs, reached2048, gameOver, undosUsed } = raw;
  if (!isEpoch(startedAt) || !isEpoch(endedAt) || endedAt < startedAt) return fail("Invalid game times.");
  if (now !== undefined && endedAt > now + FUTURE_SLACK_MS) return fail("The game ends in the future.");
  if (!isInt(highestTile, 2, MAX_TILE) || !isPowerOfTwo(highestTile)) return fail("Invalid highest tile.");
  if (!isInt(score, 0, MAX_SCORE)) return fail("Invalid score.");
  if (!isInt(moves, 1, MAX_MOVES)) return fail("Invalid move count.");
  if (!isInt(durationMs, 0, MAX_DURATION_MS)) return fail("Invalid duration.");
  if (durationMs > endedAt - startedAt + DURATION_SLACK_MS) return fail("More time played than the game lasted.");
  if (typeof reached2048 !== "boolean" || typeof gameOver !== "boolean") return fail("Invalid flags.");
  if (!isInt(undosUsed, 0, MAX_MOVES)) return fail("Invalid undo count.");
  if (score < minScoreFor(highestTile)) return fail("The score is too low for the highest tile.");
  if (highestTile / 4 > moves + 2) return fail("Too few moves for the highest tile.");
  if (reached2048 !== highestTile >= WIN_TILE) return fail("The 2048 flag does not match the highest tile.");

  return { ok: true, data: { clientId, startedAt, endedAt, score, highestTile, moves, durationMs, reached2048, gameOver, undosUsed } };
}
