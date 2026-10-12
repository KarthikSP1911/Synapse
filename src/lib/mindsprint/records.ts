import { MAX_ANSWER_CHARS, checkSequence } from "./arithmetic";
import { parseRoundConfig } from "./config";
import { LIMITS, OPERATIONS, type Flash, type Operation, type PlayedRound, type SessionData } from "./types";

/**
 * Checks a saved or uploaded session. Nothing in it is trusted: each round's settings must be valid, its
 * sequence must be one the generator could have produced for those settings (see `checkSequence`), and the
 * answer is only ever kept as text. Correctness and points are not part of the record: they are worked out again
 * from the sequence and the answer wherever they are needed.
 */

export const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;
/** Same ceiling as practice answers: nobody takes longer than ten minutes over one answer. */
export const MAX_RESPONSE_MS = 10 * 60 * 1000;
/** Local clocks drift; a session claiming to end further ahead than this is rejected. */
const FUTURE_SLACK_MS = 5 * 60 * 1000;

export type ParsedSession = { ok: true; data: SessionData } | { ok: false; clientId: string | null; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isEpoch = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

function parseFlashes(raw: unknown): Flash[] | null {
  if (!Array.isArray(raw)) return null;
  const flashes: Flash[] = [];
  for (const item of raw) {
    if (!isObject(item) || typeof item.value !== "string") return null;
    if (item.op !== null && !OPERATIONS.includes(item.op as Operation)) return null;
    flashes.push({ op: item.op as Operation | null, value: item.value });
  }
  return flashes;
}

/** `now` makes the check against future dates; leave it out for data read back from this device. */
export function parseSessionData(raw: unknown, now?: number): ParsedSession {
  if (!isObject(raw)) return { ok: false, clientId: null, reason: "Session must be an object." };
  const clientId = typeof raw.clientId === "string" && CLIENT_ID.test(raw.clientId) ? raw.clientId : null;
  if (clientId === null) return { ok: false, clientId: null, reason: "Invalid clientId." };
  const fail = (reason: string): ParsedSession => ({ ok: false, clientId, reason });

  const { startedAt, endedAt, rounds } = raw;
  if (!isEpoch(startedAt) || !isEpoch(endedAt) || endedAt < startedAt) return fail("Invalid session times.");
  if (now !== undefined && endedAt > now + FUTURE_SLACK_MS) return fail("The session ends in the future.");
  if (!Array.isArray(rounds) || rounds.length < LIMITS.rounds.min || rounds.length > LIMITS.rounds.max) return fail("Invalid rounds.");

  const played: PlayedRound[] = [];
  for (const [index, item] of rounds.entries()) {
    const label = `Round ${index + 1}`;
    if (!isObject(item)) return fail(`${label} must be an object.`);
    const config = parseRoundConfig(item.config);
    if (!config.ok) return fail(`${label}: ${config.error}`);
    const flashes = parseFlashes(item.flashes);
    if (!flashes) return fail(`${label}: invalid numbers.`);
    const problem = checkSequence(config.config, flashes);
    if (problem) return fail(`${label}: ${problem}`);
    const { answer, responseMs } = item;
    if (answer !== null && (typeof answer !== "string" || answer.length > MAX_ANSWER_CHARS)) return fail(`${label}: invalid answer.`);
    if (!Number.isInteger(responseMs) || (responseMs as number) < 0 || (responseMs as number) > MAX_RESPONSE_MS) return fail(`${label}: invalid response time.`);
    played.push({ config: config.config, flashes, answer: answer as string | null, responseMs: responseMs as number });
  }
  return { ok: true, data: { clientId, startedAt, endedAt, rounds: played } };
}
