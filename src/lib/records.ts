/**
 * Building blocks for checking records that come from outside the process: uploads from a device and data read
 * back from localStorage. Nothing in such a record is trusted, so every parser starts from these.
 */

/** What a device generates for each finished session; also the key that makes re-uploads idempotent. */
export const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;
/** Local clocks drift; a session claiming to end further ahead than this is rejected. */
export const FUTURE_SLACK_MS = 5 * 60 * 1000;
/** Same ceiling as practice answers: nobody takes longer than ten minutes over one answer. */
export const MAX_RESPONSE_MS = 10 * 60 * 1000;
/** The longest a single game session may last (and so the most time a game may report as played). */
export const MAX_PLAYED_MS = 7 * 24 * 60 * 60 * 1000;

export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const isEpoch = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
export const isClientId = (v: unknown): v is string => typeof v === "string" && CLIENT_ID.test(v);

/** A record that failed validation. `clientId` is null when the record was too broken to identify. */
type Rejected = { ok: false; clientId: string | null; reason: string };
export type Parsed<T> = { ok: true; data: T } | Rejected;

/** The result of `openRecord`: the fields every finished-session record has, checked, plus a way to reject. */
type RecordHead = {
  ok: true;
  raw: Record<string, unknown>;
  clientId: string;
  startedAt: number;
  endedAt: number;
  /** Rejects the record, keeping its client id so the device can stop retrying it. */
  fail: (reason: string) => Rejected;
};

/**
 * Checks what every finished-session record starts with: an object, a client id, and a start and end time that
 * are in order. `noun` names the record in messages ("game" gives "Game must be an object."). `now` also rejects
 * records ending in the future; leave it out for data read back from this device.
 */
export function openRecord(raw: unknown, noun: "game" | "session", now?: number): RecordHead | Rejected {
  const reject = (clientId: string | null, reason: string): Rejected => ({ ok: false, clientId, reason });
  if (!isObject(raw)) return reject(null, `${noun[0].toUpperCase()}${noun.slice(1)} must be an object.`);
  if (!isClientId(raw.clientId)) return reject(null, "Invalid clientId.");
  const clientId = raw.clientId;
  const fail = (reason: string) => reject(clientId, reason);

  const { startedAt, endedAt } = raw;
  if (!isEpoch(startedAt) || !isEpoch(endedAt) || endedAt < startedAt) return fail(`Invalid ${noun} times.`);
  if (now !== undefined && endedAt > now + FUTURE_SLACK_MS) return fail(`The ${noun} ends in the future.`);
  return { ok: true, raw, clientId, startedAt, endedAt, fail };
}

/** Adapts a strict parser to the "valid copy or null" shape the local history store expects. */
export const dataOrNull =
  <T>(parse: (raw: unknown) => Parsed<T>) =>
  (raw: unknown): T | null => {
    const parsed = parse(raw);
    return parsed.ok ? parsed.data : null;
  };
