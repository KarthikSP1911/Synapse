import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { activityDaysKey, backfillActivityDays, loadActivityDays, parseActivityDays, recordActivityDay } from "./activity-days";

// A minimal in-memory localStorage; node has none.
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

const guest = { key: "mathz:guest:v1", syncable: false };
const account = { key: "mathz:user:v1:7", syncable: true };
const at = (iso: string) => Date.parse(iso);

describe("parseActivityDays", () => {
  it("keeps valid days, sorted and without repeats", () => {
    assert.deepEqual(parseActivityDays({ days: ["2026-10-12", "2026-10-10", "2026-10-12"], backfilled: true }), { days: ["2026-10-10", "2026-10-12"], backfilled: true });
  });

  it("drops anything that is not a real day and reads damaged data as empty", () => {
    assert.deepEqual(parseActivityDays({ days: ["2026-02-30", "x", 5, null, "2026-10-12"] }), { days: ["2026-10-12"], backfilled: false });
    for (const bad of [null, undefined, 5, "text", [], { days: "2026-10-12" }, { days: {} }]) {
      assert.deepEqual(parseActivityDays(bad), { days: [], backfilled: false });
    }
  });
});

describe("recordActivityDay", () => {
  it("records the day of an activity in the given zone", () => {
    assert.equal(recordActivityDay(guest, at("2026-10-13T20:00:00Z"), "UTC"), true);
    assert.equal(recordActivityDay(guest, at("2026-10-13T20:00:00Z"), "Asia/Kolkata"), true);
    assert.deepEqual(loadActivityDays(guest.key), ["2026-10-13", "2026-10-14"]);
  });

  it("keeps days sorted whatever order they arrive in", () => {
    for (const iso of ["2026-10-13T10:00:00Z", "2026-10-11T10:00:00Z", "2026-10-12T10:00:00Z"]) recordActivityDay(guest, at(iso), "UTC");
    assert.deepEqual(loadActivityDays(guest.key), ["2026-10-11", "2026-10-12", "2026-10-13"]);
  });

  it("is safe to repeat: retries and reloads leave one entry per day", () => {
    for (let i = 0; i < 5; i++) assert.equal(recordActivityDay(guest, at("2026-10-13T10:00:00Z") + i * 1000, "UTC"), true);
    assert.deepEqual(loadActivityDays(guest.key), ["2026-10-13"]);
  });

  it("never records for a signed-in store, whose days come from the account", () => {
    assert.equal(recordActivityDay(account, at("2026-10-13T10:00:00Z"), "UTC"), false);
    assert.equal(storage.items.size, 0);
    assert.deepEqual(loadActivityDays(account.key), []);
  });

  it("keeps separate records per store key", () => {
    recordActivityDay(guest, at("2026-10-13T10:00:00Z"), "UTC");
    const other = { key: "mathz:guest:v2", syncable: false };
    assert.deepEqual(loadActivityDays(other.key), []);
  });

  it("refuses a time that is not a date", () => {
    assert.equal(recordActivityDay(guest, Number.NaN, "UTC"), false);
    assert.equal(recordActivityDay(guest, 8.64e15 + 1, "UTC"), false);
    assert.equal(storage.items.size, 0);
  });

  it("starts fresh over damaged stored data", () => {
    storage.setItem(activityDaysKey(guest.key), "{not json");
    assert.equal(recordActivityDay(guest, at("2026-10-13T10:00:00Z"), "UTC"), true);
    assert.deepEqual(loadActivityDays(guest.key), ["2026-10-13"]);
  });

  it("reports false when the browser refuses to store, without throwing", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
      setItem() {
        throw new Error("QuotaExceededError");
      },
    };
    assert.equal(recordActivityDay(guest, at("2026-10-13T10:00:00Z"), "UTC"), false);
    assert.deepEqual(loadActivityDays(guest.key), []);
  });

  it("reads as empty when storage is unavailable", () => {
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    assert.deepEqual(loadActivityDays(guest.key), []);
  });
});

describe("backfillActivityDays", () => {
  it("adds the days of earlier sessions once, then leaves the record alone", () => {
    recordActivityDay(guest, at("2026-10-13T10:00:00Z"), "UTC");
    let calls = 0;
    const derive = () => {
      calls += 1;
      return ["2026-10-10", "2026-10-11", "2026-10-13"];
    };
    assert.deepEqual(backfillActivityDays(guest, derive), ["2026-10-10", "2026-10-11", "2026-10-13"]);
    assert.equal(calls, 1);

    // Later calls do not look at the saved sessions again: in another time zone they could count a day twice.
    assert.deepEqual(backfillActivityDays(guest, () => ["2026-10-14"]), ["2026-10-10", "2026-10-11", "2026-10-13"]);
    assert.equal(calls, 1);
  });

  it("keeps days recorded after the backfill", () => {
    backfillActivityDays(guest, () => ["2026-10-10"]);
    recordActivityDay(guest, at("2026-10-12T10:00:00Z"), "UTC");
    assert.deepEqual(backfillActivityDays(guest, () => []), ["2026-10-10", "2026-10-12"]);
  });

  it("ignores values that are not days and never touches a signed-in store", () => {
    assert.deepEqual(backfillActivityDays(guest, () => ["2026-10-10", "nope", "2026-02-30"]), ["2026-10-10"]);
    let called = false;
    assert.deepEqual(
      backfillActivityDays(account, () => {
        called = true;
        return ["2026-10-10"];
      }),
      []
    );
    assert.equal(called, false);
    assert.equal(storage.items.has(activityDaysKey(account.key)), false);
  });

  it("still answers with the days when the browser refuses to store them", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
      setItem() {
        throw new Error("QuotaExceededError");
      },
    };
    assert.deepEqual(backfillActivityDays(guest, () => ["2026-10-10"]), ["2026-10-10"]);
  });
});
