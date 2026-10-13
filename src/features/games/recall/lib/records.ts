import { MAX_RESPONSE_MS, isObject, openRecord, type Parsed } from "@/lib/records";
import { isIntInRange } from "@/lib/validation";
import { parseConfig } from "./config";
import { isItem, nextLength } from "./sequence";
import { scoreRound } from "./scoring";
import type { PlayedRound, SessionData } from "./types";

/**
 * Checks a saved or uploaded session. Nothing in it is trusted: the settings must be valid, every item must be a
 * full-width digit string for the mode ("07", not 7), and each round's length must be what the settings and the
 * previous round's result call for (so a doctored upload cannot claim a longer sequence than was played). Points
 * are not part of the record: they are worked out again wherever they are needed.
 */

export type ParsedSession = Parsed<SessionData>;

/** `now` makes the check against future dates; leave it out for data read back from this device. */
export function parseSessionData(raw: unknown, now?: number): ParsedSession {
  const head = openRecord(raw, "session", now);
  if (!head.ok) return head;
  const { clientId, startedAt, endedAt, fail } = head;

  const { rounds } = head.raw;
  const parsed = parseConfig(head.raw.config);
  if (!parsed.ok) return fail(parsed.error);
  const { config } = parsed;
  if (!Array.isArray(rounds) || rounds.length !== config.rounds) return fail("The number of rounds does not match the settings.");

  const played: PlayedRound[] = [];
  for (const [index, item] of rounds.entries()) {
    const label = `Round ${index + 1}`;
    if (!isObject(item)) return fail(`${label} must be an object.`);
    const { sequence, answer, responseMs } = item;
    if (!Array.isArray(sequence) || !sequence.every((s) => isItem(config.mode, s))) return fail(`${label}: invalid sequence.`);
    const previous = played[index - 1];
    const expected = nextLength(config, previous ? { length: previous.sequence.length, perfect: scoreRound(config, previous).perfect } : null);
    if (sequence.length !== expected) return fail(`${label}: expected ${expected} items, got ${sequence.length}.`);
    if (answer !== null && (!Array.isArray(answer) || answer.length !== sequence.length || !answer.every((a) => isItem(config.mode, a)))) return fail(`${label}: invalid answer.`);
    if (!isIntInRange(responseMs, 0, MAX_RESPONSE_MS)) return fail(`${label}: invalid response time.`);
    played.push({ sequence: sequence as string[], answer: answer as string[] | null, responseMs });
  }
  return { ok: true, data: { clientId, startedAt, endedAt, config, rounds: played } };
}
