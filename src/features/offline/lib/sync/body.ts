import { gunzipSync } from "node:zlib";
import { readJson } from "@/lib/validation";

/**
 * Reads the JSON body of `POST /api/sync`, which the browser gzips when the upload is large (see
 * `upload` in `./client.ts`). Plain JSON is still accepted.
 *
 * The limits matter because a tiny gzip body can expand enormously (a "zip bomb"): the compressed size is
 * checked first, and decompression itself is stopped at the output limit instead of after the fact. A
 * legitimate batch (at most 1000 attempts, about 150 KB of JSON) is far below both.
 */

export const MAX_COMPRESSED_BYTES = 1024 * 1024;
export const MAX_DECOMPRESSED_BYTES = 4 * 1024 * 1024;

export type SyncBody = { ok: true; body: Record<string, unknown> | null } | { ok: false; status: 413 | 415; error: string };

export async function readSyncBody(request: Request): Promise<SyncBody> {
  const encoding = request.headers.get("content-encoding")?.trim().toLowerCase() ?? "";
  if (encoding === "" || encoding === "identity") return { ok: true, body: await readJson(request) };
  if (encoding !== "gzip") return { ok: false, status: 415, error: `Unsupported Content-Encoding: ${encoding}` };

  const compressed = Buffer.from(await request.arrayBuffer());
  if (compressed.length > MAX_COMPRESSED_BYTES) return { ok: false, status: 413, error: "Request body too large" };
  try {
    const parsed: unknown = JSON.parse(gunzipSync(compressed, { maxOutputLength: MAX_DECOMPRESSED_BYTES }).toString("utf8"));
    return { ok: true, body: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null };
  } catch (error) {
    // Output past the limit throws a RangeError; anything else here is a body that is not valid gzip or JSON.
    if (error instanceof RangeError) return { ok: false, status: 413, error: "Request body too large" };
    return { ok: true, body: null };
  }
}
