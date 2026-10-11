import { compressToUTF16, decompressFromUTF16 } from "lz-string";

/**
 * String compression for the two places Mathz moves bulk text around: the browser's localStorage
 * (which has a small quota and only stores strings) and the upload of practice done offline.
 */

// ---------------------------------------------------------------------------
// localStorage: independently compressed segments
// ---------------------------------------------------------------------------

/** Marks a stored value as compressed segments, so older plain-JSON values can still be recognised and read. */
export const COMPRESSED_TAG = "lz1:";
/**
 * Joins the segments. `compressToUTF16` only ever emits code units of 32 and above, so a line break
 * can never appear inside a compressed segment.
 */
const SEPARATOR = "\n";

/**
 * Compressed output for the texts seen by the latest `compressSegments` call of each key. Compression is a
 * pure function of its input, so a hit can never be stale; it only saves the (comparatively slow) work of
 * compressing again what did not change since the last save. Only the latest call is kept, so it stays
 * about as large as one saved value.
 */
const recent = new Map<string, Map<string, string>>();

/**
 * Compresses each text on its own and joins the results into one string that `decompressSegments`
 * reverses. Splitting the data into segments is what lets a save after one answer skip all the segments
 * that did not change. `cacheKey` separates unrelated stores (for example two accounts on one device).
 */
export function compressSegments(texts: readonly string[], cacheKey: string): string {
  const previous = recent.get(cacheKey);
  const current = new Map<string, string>();
  const parts = texts.map((text) => {
    const packed = current.get(text) ?? previous?.get(text) ?? compressToUTF16(text);
    current.set(text, packed);
    return packed;
  });
  recent.set(cacheKey, current);
  return COMPRESSED_TAG + parts.join(SEPARATOR);
}

/** The texts a `compressSegments` result was made from, or null when the value is not (intact) compressed data. */
export function decompressSegments(stored: string): string[] | null {
  if (!stored.startsWith(COMPRESSED_TAG)) return null;
  try {
    const body = stored.slice(COMPRESSED_TAG.length);
    if (body === "") return [];
    const texts: string[] = [];
    for (const part of body.split(SEPARATOR)) {
      // lz-string answers null (or garbage) for input that is not a valid compressed stream.
      const text = decompressFromUTF16(part);
      if (typeof text !== "string") return null;
      texts.push(text);
    }
    return texts;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Network: gzip
// ---------------------------------------------------------------------------

/** Below this size the gzip header and the extra work cost more than they save. */
export const GZIP_MIN_CHARS = 1024;

/** The text as gzip bytes, or null when the browser cannot compress (older browsers lack `CompressionStream`) or fails. */
export async function gzipText(text: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}
