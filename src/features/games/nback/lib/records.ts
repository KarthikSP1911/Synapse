import { MAX_PLAYED_MS, openRecord, type Parsed } from "@/lib/records";
import { isIntInRange } from "@/lib/validation";
import { activeStreams, parseConfig } from "./config";
import { generateSequence, paramsFromConfig } from "./generator";
import { scoreSession } from "./scoring";
import { GENERATOR_VERSION, STREAMS, STREAM_BIT, type SessionData } from "./types";

/**
 * Checks a saved or uploaded N-Back session. Nothing in it is trusted. The settings must be valid; the seed and
 * the generator version rebuild the exact sequence and its ground truth, and the responses are replayed through the
 * same scorer the game uses, so the outcome, the lives and the accuracy are worked out here and a doctored upload
 * cannot claim a better result than its responses earn. Points and coins are never part of the record.
 */

export type ParsedSession = Parsed<SessionData>;

/** Seeds are 31-bit so they fit a database integer. */
export const MAX_SEED = 2 ** 31 - 1;
/** The time spent in trials is the trials played times the trial length, give or take this much. */
const TIMING_SLACK_MS = 1000;
/** Playing time may exceed the wall-clock span by this much (rounding between saves). */
const ELAPSED_SLACK_MS = 5000;

const ALL_BITS = STREAMS.reduce((mask, s) => mask | STREAM_BIT[s], 0);

/**
 * `now` makes the check against future dates; leave it out for data read back from this device.
 * `verify` replays the session, which is only worth doing for uploads: a stored copy was already checked on the way in.
 */
export function parseSessionData(raw: unknown, { now, verify = false }: { now?: number; verify?: boolean } = {}): ParsedSession {
  const head = openRecord(raw, "session", now);
  if (!head.ok) return head;
  const { clientId, startedAt, endedAt, fail } = head;
  const { outcome, seed, generator, responses, durationMs } = head.raw;

  if (outcome !== "completed" && outcome !== "gameover") return fail("Invalid outcome.");
  const parsed = parseConfig(head.raw.config);
  if (!parsed.ok) return fail(parsed.error);
  const { config } = parsed;
  if (!isIntInRange(seed, 0, MAX_SEED)) return fail("Invalid seed.");
  if (generator !== GENERATOR_VERSION) return fail("Unknown sequence generator.");

  const active = activeStreams(config).reduce((mask, s) => mask | STREAM_BIT[s], 0);
  if (!Array.isArray(responses) || responses.length < 1 || responses.length > config.trials) return fail("Invalid responses.");
  if (!responses.every((r) => isIntInRange(r, 0, ALL_BITS) && (r & ~active) === 0)) return fail("A response marks a stream that is off.");
  if (outcome === "completed" && responses.length !== config.trials) return fail("A completed session plays every trial.");

  if (!isIntInRange(durationMs, 0, MAX_PLAYED_MS)) return fail("Invalid time played.");
  if (Math.abs(durationMs - responses.length * config.trialMs) > TIMING_SLACK_MS) return fail("The time played does not match the trials played.");
  if (durationMs > endedAt - startedAt + ELAPSED_SLACK_MS) return fail("More time played than the session lasted.");

  const data: SessionData = { clientId, startedAt, endedAt, outcome, config, seed, generator, responses: responses as number[], durationMs };
  if (verify) {
    const result = scoreSession({ config, trials: generateSequence(paramsFromConfig(config, seed)), responses: data.responses });
    if (result.outcome !== outcome) return fail("The outcome does not match the responses.");
    if (result.trialsPlayed !== responses.length) return fail("The session continued after the last life was lost.");
  }
  return { ok: true, data };
}
