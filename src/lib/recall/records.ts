import { CLIENT_ID, MAX_RESPONSE_MS } from "@/lib/mindsprint/records";
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

/** Local clocks drift; a session claiming to end further ahead than this is rejected. */
const FUTURE_SLACK_MS = 5 * 60 * 1000;

export type ParsedSession = { ok: true; data: SessionData } | { ok: false; clientId: string | null; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isEpoch = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

/** `now` makes the check against future dates; leave it out for data read back from this device. */
export function parseSessionData(raw: unknown, now?: number): ParsedSession {
  if (!isObject(raw)) return { ok: false, clientId: null, reason: "Session must be an object." };
  const clientId = typeof raw.clientId === "string" && CLIENT_ID.test(raw.clientId) ? raw.clientId : null;
  if (clientId === null) return { ok: false, clientId: null, reason: "Invalid clientId." };
  const fail = (reason: string): ParsedSession => ({ ok: false, clientId, reason });

  const { startedAt, endedAt, rounds } = raw;
  if (!isEpoch(startedAt) || !isEpoch(endedAt) || endedAt < startedAt) return fail("Invalid session times.");
  if (now !== undefined && endedAt > now + FUTURE_SLACK_MS) return fail("The session ends in the future.");
  const parsed = parseConfig(raw.config);
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
    if (!Number.isInteger(responseMs) || (responseMs as number) < 0 || (responseMs as number) > MAX_RESPONSE_MS) return fail(`${label}: invalid response time.`);
    played.push({ sequence: sequence as string[], answer: answer as string[] | null, responseMs: responseMs as number });
  }
  return { ok: true, data: { clientId, startedAt, endedAt, config, rounds: played } };
}
