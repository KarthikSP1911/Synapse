import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Parsed } from "@/lib/records";
import { MAX_UPLOAD_SESSIONS, loadRecent, storeUploaded } from "./upload";

type Item = { clientId: string };

const parse = (raw: unknown): Parsed<Item> =>
  typeof raw === "string" && raw.startsWith("ok")
    ? { ok: true, data: { clientId: raw } }
    : { ok: false, clientId: typeof raw === "string" ? raw : null, reason: "bad" };

const quiet = () => {};

function setup(insert: (item: Item) => Promise<unknown> = async () => {}) {
  const inserted: string[] = [];
  const logs: string[] = [];
  return {
    inserted,
    logs,
    options: {
      label: "test sessions",
      parse,
      insert: async (item: Item) => {
        await insert(item);
        inserted.push(item.clientId);
      },
      log: (message: string) => logs.push(message),
    },
  };
}

describe("storeUploaded", () => {
  it("stores valid records and reports rejected ones without stopping", async () => {
    const { options, inserted } = setup();
    const reply = await storeUploaded({ sessions: ["ok-1", "nope", "ok-2", 5] }, options);
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body, {
      synced: [{ clientId: "ok-1" }, { clientId: "ok-2" }],
      rejected: [
        { clientId: "nope", reason: "bad" },
        { clientId: null, reason: "bad" },
      ],
    });
    assert.deepEqual(inserted, ["ok-1", "ok-2"]);
  });

  it("accepts an empty list", async () => {
    const reply = await storeUploaded({ sessions: [] }, setup().options);
    assert.deepEqual(reply, { status: 200, body: { synced: [], rejected: [] } });
  });

  it("rejects a body that is not { sessions: [...] }", async () => {
    for (const body of [null, {}, { sessions: "x" }, { sessions: {} }]) {
      const { options, inserted } = setup();
      assert.deepEqual(await storeUploaded(body, options), { status: 400, body: { error: "Expected { sessions: [...] }" } });
      assert.equal(inserted.length, 0);
    }
  });

  it("limits how many sessions one request may carry", async () => {
    const { options, inserted } = setup();
    const sessions = Array.from({ length: MAX_UPLOAD_SESSIONS + 1 }, (_, i) => `ok-${i}`);
    assert.deepEqual(await storeUploaded({ sessions }, options), { status: 400, body: { error: `At most ${MAX_UPLOAD_SESSIONS} sessions per request` } });
    assert.equal(inserted.length, 0);
    assert.equal((await storeUploaded({ sessions: sessions.slice(1) }, options)).status, 200);
  });

  it("answers 500 when storing fails, still listing what was saved before it", async () => {
    const { options, logs } = setup(async (item) => {
      if (item.clientId === "ok-2") throw new Error("db down");
    });
    const reply = await storeUploaded({ sessions: ["ok-1", "nope", "ok-2", "ok-3"] }, options);
    assert.equal(reply.status, 500);
    assert.deepEqual(reply.body, { error: "Failed to sync", synced: [{ clientId: "ok-1" }], rejected: [{ clientId: "nope", reason: "bad" }] });
    assert.deepEqual(logs, ["Failed to sync test sessions"]);
  });
});

describe("loadRecent", () => {
  it("wraps the records as { sessions }", async () => {
    const reply = await loadRecent({ label: "test sessions", noun: "sessions" }, async () => [{ a: 1 }], quiet);
    assert.deepEqual(reply, { status: 200, body: { sessions: [{ a: 1 }] } });
  });

  it("puts the log reference in a failure reply, so a report from a device can be matched to the server's log line", async () => {
    const reply = await storeUploaded({ sessions: [{ clientId: "ok-1" }] }, { label: "test sessions", parse: (raw) => ({ ok: true, data: raw as Item }), insert: async () => Promise.reject(new Error("db down")), log: () => "ref12345" });
    assert.equal(reply.status, 500);
    assert.equal(reply.body.reference, "ref12345");
    const loaded = await loadRecent({ label: "2048 games", noun: "games" }, () => Promise.reject(new Error("db down")), () => "ref67890");
    assert.equal(loaded.body.reference, "ref67890");
  });

  it("answers 500 with the noun of the game when loading fails", async () => {
    const logs: string[] = [];
    const reply = await loadRecent(
      { label: "2048 games", noun: "games" },
      async () => {
        throw new Error("db down");
      },
      (message) => logs.push(message)
    );
    assert.deepEqual(reply, { status: 500, body: { error: "Failed to load games" } });
    assert.deepEqual(logs, ["Failed to load 2048 games"]);
  });
});
