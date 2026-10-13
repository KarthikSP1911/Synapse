import { MAX_RESPONSE_MS, isObject, openRecord, type Parsed } from "@/lib/records";
import { isIntInRange } from "@/lib/validation";
import { MAX_ANSWER_CHARS, checkSequence } from "./arithmetic";
import { parseRoundConfig } from "./config";
import { LIMITS, OPERATIONS, type Flash, type Operation, type PlayedRound, type SessionData } from "./types";

/**
 * Checks a saved or uploaded session. Nothing in it is trusted: each round's settings must be valid, its
 * sequence must be one the generator could have produced for those settings (see `checkSequence`), and the
 * answer is only ever kept as text. Correctness and points are not part of the record: they are worked out again
 * from the sequence and the answer wherever they are needed.
 */

export type ParsedSession = Parsed<SessionData>;

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
  const head = openRecord(raw, "session", now);
  if (!head.ok) return head;
  const { clientId, startedAt, endedAt, fail } = head;

  const { rounds } = head.raw;
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
    if (!isIntInRange(responseMs, 0, MAX_RESPONSE_MS)) return fail(`${label}: invalid response time.`);
    played.push({ config: config.config, flashes, answer: answer as string | null, responseMs });
  }
  return { ok: true, data: { clientId, startedAt, endedAt, rounds: played } };
}
