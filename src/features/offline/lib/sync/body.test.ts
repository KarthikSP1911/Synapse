import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { MAX_COMPRESSED_BYTES, MAX_DECOMPRESSED_BYTES, readSyncBody } from "./body";

const request = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/sync", { method: "POST", body, headers: { "Content-Type": "application/json", ...headers } });

const payload = { sessions: [{ clientId: "abcdefgh-1234", attempts: Array.from({ length: 50 }, (_, i) => ({ questionId: "square:value:12", at: i })) }] };

describe("readSyncBody", () => {
  it("reads a plain JSON body", async () => {
    assert.deepEqual(await readSyncBody(request(JSON.stringify(payload))), { ok: true, body: payload });
  });

  it("reads a gzipped body", async () => {
    const result = await readSyncBody(request(gzipSync(JSON.stringify(payload)), { "Content-Encoding": "gzip" }));
    assert.deepEqual(result, { ok: true, body: payload });
  });

  it("accepts the encoding name in any case and an explicit identity", async () => {
    assert.deepEqual(await readSyncBody(request(gzipSync(JSON.stringify(payload)), { "Content-Encoding": " GZIP " })), { ok: true, body: payload });
    assert.deepEqual(await readSyncBody(request(JSON.stringify(payload), { "Content-Encoding": "identity" })), { ok: true, body: payload });
  });

  it("treats a body that is not valid gzip, or not an object, as having no usable body", async () => {
    assert.deepEqual(await readSyncBody(request("{}", { "Content-Encoding": "gzip" })), { ok: true, body: null });
    assert.deepEqual(await readSyncBody(request(gzipSync("not json"), { "Content-Encoding": "gzip" })), { ok: true, body: null });
    assert.deepEqual(await readSyncBody(request(gzipSync("[1,2]"), { "Content-Encoding": "gzip" })), { ok: true, body: null });
    assert.deepEqual(await readSyncBody(request("not json")), { ok: true, body: null });
  });

  it("refuses encodings it does not read", async () => {
    for (const encoding of ["br", "deflate", "gzip, br"]) {
      const result = await readSyncBody(request("x", { "Content-Encoding": encoding }));
      assert.deepEqual(result.ok, false, encoding);
      assert.equal(!result.ok && result.status, 415);
    }
  });

  it("stops a tiny body that expands past the limit (a zip bomb)", async () => {
    // Highly repetitive data compresses a few thousand to one: a small request that would fill memory if inflated.
    const bomb = gzipSync(Buffer.alloc(MAX_DECOMPRESSED_BYTES + 1024 * 1024, "a"));
    assert.ok(bomb.length < 100 * 1024, `bomb is ${bomb.length} bytes`);
    const result = await readSyncBody(request(bomb, { "Content-Encoding": "gzip" }));
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.status, 413);
  });

  it("accepts a body right up to the limit", async () => {
    const text = JSON.stringify({ filler: "a".repeat(MAX_DECOMPRESSED_BYTES - 100) });
    assert.ok(text.length <= MAX_DECOMPRESSED_BYTES);
    const result = await readSyncBody(request(gzipSync(text), { "Content-Encoding": "gzip" }));
    assert.equal(result.ok && Object.keys(result.body ?? {}).join(), "filler");
  });

  it("refuses a compressed body larger than the limit without inflating it", async () => {
    // Random bytes do not compress, so this stays large after gzip.
    const big = gzipSync(randomBytes(MAX_COMPRESSED_BYTES + 1024));
    assert.ok(big.length > MAX_COMPRESSED_BYTES);
    const result = await readSyncBody(request(big, { "Content-Encoding": "gzip" }));
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.status, 413);
  });
});
