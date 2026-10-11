import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { COMPRESSED_TAG } from "@/lib/compression";
import { createLocalFetch, guestFetch } from "./api";
import { GUEST_STORAGE_KEY, emptyGuestData, loadGuestData, saveGuestData, userStorageKey } from "./storage";

class MemoryStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
});

const post = (url: string, body?: unknown) =>
  guestFetch(url, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });

async function playGuest(answers: number): Promise<void> {
  const { id } = await (await post("/api/sessions", { skill: "multiplication", mode: "endless", config: { skill: "multiplication", left: [6, 7], right: [7, 8] } })).json();
  for (let i = 0; i < answers; i++) {
    const { question } = await (await guestFetch(`/api/sessions/${id}/next`)).json();
    const [, left, right] = question.id.split(":");
    await post(`/api/sessions/${id}/attempt`, { questionId: question.id, userAnswer: String(Number(left) * Number(right)), responseTimeMs: 1500 });
  }
}

describe("stored practice data", () => {
  it("is compressed on disk and reads back unchanged", async () => {
    await playGuest(30);
    const stored = storage.getItem(GUEST_STORAGE_KEY)!;
    assert.ok(stored.startsWith(COMPRESSED_TAG));

    const data = loadGuestData();
    assert.equal(data.sessions[0].attempts.length, 30);
    assert.ok(stored.length < JSON.stringify(data).length / 8, `${stored.length} vs ${JSON.stringify(data).length}`);
  });

  it("still reads data saved as plain JSON before compression existed, and compresses it on the next save", async () => {
    await playGuest(5);
    const data = loadGuestData();
    storage.setItem(GUEST_STORAGE_KEY, JSON.stringify(data));
    assert.deepEqual(loadGuestData(), data);

    assert.ok(saveGuestData(data));
    assert.ok(storage.getItem(GUEST_STORAGE_KEY)!.startsWith(COMPRESSED_TAG));
    assert.deepEqual(loadGuestData(), data);
  });

  it("keeps practising seamlessly across the plain-to-compressed upgrade", async () => {
    await playGuest(4);
    storage.setItem(GUEST_STORAGE_KEY, JSON.stringify(loadGuestData()));
    await playGuest(3);
    const data = loadGuestData();
    assert.deepEqual(
      data.sessions.map((s) => s.attempts.length),
      [4, 3]
    );
    assert.equal(data.nextId, 3);
  });

  it("starts empty, rather than failing, when the stored value is damaged", () => {
    for (const bad of [`${COMPRESSED_TAG}\u0001garbage`, `${COMPRESSED_TAG}`, "lz1:\n\n\n", "{not json", "null", '{"version":2,"sessions":"x"}']) {
      storage.setItem(GUEST_STORAGE_KEY, bad);
      assert.deepEqual(loadGuestData(), emptyGuestData(), bad);
    }
  });

  it("keeps two accounts on one device apart", async () => {
    const a = createLocalFetch({ key: userStorageKey(1), syncable: true });
    const b = createLocalFetch({ key: userStorageKey(2), syncable: true });
    const config = { skill: "square", exerciseTypes: ["value"], rangeMin: 2, rangeMax: 12 };
    await a("/api/sessions", { method: "POST", body: JSON.stringify({ skill: "square", mode: "endless", config }) });
    await a("/api/sessions", { method: "POST", body: JSON.stringify({ skill: "square", mode: "endless", config }) });
    await b("/api/sessions", { method: "POST", body: JSON.stringify({ skill: "square", mode: "endless", config }) });
    assert.equal(loadGuestData(userStorageKey(1)).sessions.length, 2);
    assert.equal(loadGuestData(userStorageKey(2)).sessions.length, 1);
  });

  it("makes room by shedding old sessions when the browser refuses a write, as before", async () => {
    await playGuest(3);
    await playGuest(3);
    let refusals = 1;
    const real = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (refusals-- > 0) throw new Error("QuotaExceededError");
      real(key, value);
    };
    const data = loadGuestData();
    assert.ok(saveGuestData(data));
    assert.equal(loadGuestData().sessions.length, 1);
  });
});
