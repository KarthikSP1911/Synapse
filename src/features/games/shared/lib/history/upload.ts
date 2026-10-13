import type { Parsed } from "@/lib/records";

/** The most sessions one upload carries; the device sends longer lists in batches. */
export const MAX_UPLOAD_SESSIONS = 10;
/** The most sessions sent back to a device at once. */
export const MAX_PULL = 100;

/** A reply, kept free of any framework type so the logic below can be tested on its own. */
export interface UploadReply {
  status: number;
  body: Record<string, unknown>;
}

interface UploadOptions<Data> {
  /** What a record is called in log lines, e.g. "2048 games". */
  label: string;
  parse: (raw: unknown) => Parsed<Data>;
  /** Stores one validated record. The same client id arriving twice must leave the first copy alone. */
  insert: (data: Data) => Promise<unknown>;
  /** Injected for tests. */
  log?: (message: string, error: unknown) => void;
}

/**
 * Validates and stores a device's uploaded sessions. Every record is checked on its own: a bad one is listed
 * under `rejected` (retrying cannot help) and does not stop the others. A failure to store is a 500 that still
 * reports what was saved before it, so the device only retries the rest.
 */
export async function storeUploaded<Data extends { clientId: string }>(
  body: Record<string, unknown> | null,
  { label, parse, insert, log = console.error }: UploadOptions<Data>
): Promise<UploadReply> {
  if (!body || !Array.isArray(body.sessions)) return { status: 400, body: { error: "Expected { sessions: [...] }" } };
  if (body.sessions.length > MAX_UPLOAD_SESSIONS) return { status: 400, body: { error: `At most ${MAX_UPLOAD_SESSIONS} sessions per request` } };

  const synced: { clientId: string }[] = [];
  const rejected: { clientId: string | null; reason: string }[] = [];
  try {
    for (const raw of body.sessions) {
      const parsed = parse(raw);
      if (!parsed.ok) {
        rejected.push({ clientId: parsed.clientId, reason: parsed.reason });
        continue;
      }
      await insert(parsed.data);
      synced.push({ clientId: parsed.data.clientId });
    }
  } catch (error) {
    log(`Failed to sync ${label}:`, error);
    return { status: 500, body: { error: "Failed to sync", synced, rejected } };
  }
  return { status: 200, body: { synced, rejected } };
}

/** The latest records as `{ sessions }`, or a 500 naming what could not be loaded. */
export async function loadRecent(
  { label, noun }: { label: string; noun: "games" | "sessions" },
  recent: () => Promise<unknown[]>,
  log: (message: string, error: unknown) => void = console.error
): Promise<UploadReply> {
  try {
    return { status: 200, body: { sessions: await recent() } };
  } catch (error) {
    log(`Failed to load ${label}:`, error);
    return { status: 500, body: { error: `Failed to load ${noun}` } };
  }
}
