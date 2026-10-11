import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { COMPRESSED_TAG, compressSegments, decompressSegments, gzipText } from "./compression";

describe("compressSegments", () => {
  it("round-trips the segments, including awkward text", () => {
    const texts = ["", "plain", '{"a":[1,2,3],"b":"line\nbreak"}', "emoji 🎉 and ünïcödé", "x".repeat(5000), "\n\n", "lz1:"];
    const stored = compressSegments(texts, "t");
    assert.ok(stored.startsWith(COMPRESSED_TAG));
    assert.deepEqual(decompressSegments(stored), texts);
  });

  it("round-trips no segments at all", () => {
    assert.deepEqual(decompressSegments(compressSegments([], "t")), []);
  });

  it("never lets compressed output contain the separator", () => {
    // Exhaustive-ish: every code unit up to the BMP edge, in one text, plus runs that provoke long codes.
    let all = "";
    for (let c = 0; c < 0xd800; c++) all += String.fromCharCode(c);
    const stored = compressSegments([all, "ab".repeat(4000)], "t");
    assert.equal(stored.slice(COMPRESSED_TAG.length).split("\n").length, 2);
    assert.deepEqual(decompressSegments(stored), [all, "ab".repeat(4000)]);
  });

  it("shrinks repetitive text a great deal", () => {
    const text = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ prompt: "What is 25% of 80?", skill: "percentage", n: i % 7 })));
    assert.ok(compressSegments([text], "t").length < text.length / 8);
  });

  it("gives the same result when a segment is served from the cache", () => {
    const texts = ["alpha ".repeat(200), "beta ".repeat(200)];
    const first = compressSegments(texts, "same");
    // Same key: both segments are cached. A new third segment must not disturb the others.
    assert.equal(compressSegments(texts, "same"), first);
    const grown = compressSegments([...texts, "gamma ".repeat(200)], "same");
    assert.deepEqual(decompressSegments(grown), [...texts, "gamma ".repeat(200)]);
    // A different key has its own cache but produces the same output.
    assert.equal(compressSegments(texts, "other"), first);
  });

  it("still compresses correctly after the cache has moved on to other texts", () => {
    const a = "first ".repeat(300);
    const b = "second ".repeat(300);
    compressSegments([a], "moving");
    compressSegments([b], "moving");
    assert.deepEqual(decompressSegments(compressSegments([a, b], "moving")), [a, b]);
  });
});

describe("decompressSegments", () => {
  it("does not recognise plain JSON, so older stored data can be read as it was", () => {
    assert.equal(decompressSegments('{"version":1}'), null);
    assert.equal(decompressSegments(""), null);
  });

  it("does not throw on damaged input", () => {
    for (const bad of ["lz1:\u0001\u0002", "lz1:garbage that is not lz", "lz1:\n\n", "lz1:" + "翿".repeat(40)]) {
      assert.doesNotThrow(() => decompressSegments(bad), bad);
    }
  });
});

describe("gzipText", () => {
  it("produces gzip that decompresses to the same text", async () => {
    const text = JSON.stringify({ sessions: Array.from({ length: 200 }, (_, i) => ({ questionId: "percentage:of:25:80", n: i })) });
    const packed = await gzipText(text);
    assert.ok(packed);
    assert.ok(packed.length < text.length / 5);
    assert.equal(gunzipSync(packed).toString("utf8"), text);
  });

  it("answers null where the browser cannot compress", async () => {
    const original = globalThis.CompressionStream;
    (globalThis as { CompressionStream?: unknown }).CompressionStream = undefined;
    try {
      assert.equal(await gzipText("anything"), null);
    } finally {
      (globalThis as { CompressionStream?: unknown }).CompressionStream = original;
    }
  });
});
