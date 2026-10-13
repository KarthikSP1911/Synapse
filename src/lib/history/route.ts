import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import type { Parsed } from "@/lib/records";
import { readJson } from "@/lib/validation";
import { MAX_PULL, loadRecent, storeUploaded, type UploadReply } from "./upload";

export interface HistoryRouteOptions<Data> {
  /** What a record is called in log lines, e.g. "2048 games". */
  label: string;
  /** The word replies use for a record. */
  noun: "games" | "sessions";
  /** Strictly validates one uploaded record (it may check the clock, replay the data, and so on). */
  parse: (raw: unknown) => Parsed<Data>;
  /** Stores one record for the user, ignoring a client id the account already has (retries, two tabs). */
  insert: (userId: number, data: Data) => Promise<unknown>;
  /** The account's latest records, newest first, shaped as a device reads them back (dates in epoch ms). */
  recent: (userId: number, limit: number) => Promise<unknown[]>;
}

const reply = ({ status, body }: UploadReply) => NextResponse.json(body, { status });

/**
 * The `POST` (upload) and `GET` (pull) handlers every game's `/api/sync/<game>` route shares. The browser side is
 * `createHistorySync` in `./sync.ts`. A route file only supplies what differs per game.
 *
 * POST body: `{ sessions: [...] }`. Reply: `{ synced: [{ clientId }], rejected: [{ clientId, reason }] }`. A rejected
 * record is permanently invalid (retrying cannot help); a server failure is a 5xx instead.
 */
export function createHistoryRoute<Data extends { clientId: string }>({ label, noun, parse, insert, recent }: HistoryRouteOptions<Data>) {
  return {
    async POST(request: Request) {
      const user = await getCurrentUser();
      if (!user) return unauthorized();
      return reply(await storeUploaded(await readJson(request), { label, parse, insert: (data) => insert(user.id, data) }));
    },

    async GET() {
      const user = await getCurrentUser();
      if (!user) return unauthorized();
      return reply(await loadRecent({ label, noun }, () => recent(user.id, MAX_PULL)));
    },
  };
}
