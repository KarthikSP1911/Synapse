import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FUTURE_SLACK_MS, dataOrNull, isClientId, isEpoch, isObject, openRecord, type Parsed } from "./records";

const valid = { clientId: "abcd-1234", startedAt: 1_000, endedAt: 2_000 };

describe("primitives", () => {
  it("isObject accepts plain objects only", () => {
    assert.equal(isObject({}), true);
    for (const v of [null, undefined, [], "x", 1, true]) assert.equal(isObject(v), false);
  });

  it("isEpoch accepts positive safe integers only", () => {
    assert.equal(isEpoch(1), true);
    for (const v of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null]) assert.equal(isEpoch(v), false);
  });

  it("isClientId enforces 8 to 64 letters, digits and dashes", () => {
    assert.equal(isClientId("abcd-1234"), true);
    assert.equal(isClientId("a".repeat(64)), true);
    for (const v of ["short", "a".repeat(65), "has space 1234", "ünïcödé-123", 12345678, null]) assert.equal(isClientId(v), false);
  });
});

describe("openRecord", () => {
  it("returns the checked head of a valid record", () => {
    const head = openRecord({ ...valid, extra: 1 }, "game");
    assert.ok(head.ok);
    assert.equal(head.clientId, valid.clientId);
    assert.equal(head.startedAt, 1_000);
    assert.equal(head.endedAt, 2_000);
    assert.equal(head.raw.extra, 1);
  });

  it("names the record in the messages and cannot identify an unidentifiable one", () => {
    assert.deepEqual(openRecord(null, "game"), { ok: false, clientId: null, reason: "Game must be an object." });
    assert.deepEqual(openRecord([], "session"), { ok: false, clientId: null, reason: "Session must be an object." });
    assert.deepEqual(openRecord({ ...valid, clientId: "x" }, "session"), { ok: false, clientId: null, reason: "Invalid clientId." });
  });

  it("keeps the client id when the times are wrong, so the device can stop retrying", () => {
    for (const times of [{ startedAt: "1" }, { endedAt: 0 }, { startedAt: 3_000 }]) {
      assert.deepEqual(openRecord({ ...valid, ...times }, "game"), { ok: false, clientId: valid.clientId, reason: "Invalid game times." });
    }
  });

  it("rejects an end beyond the clock slack, but only when `now` is given", () => {
    const record = { ...valid, endedAt: 10_000 + FUTURE_SLACK_MS + 1 };
    assert.ok(openRecord(record, "game").ok);
    assert.deepEqual(openRecord(record, "session", 10_000), { ok: false, clientId: valid.clientId, reason: "The session ends in the future." });
    assert.ok(openRecord({ ...valid, endedAt: 10_000 + FUTURE_SLACK_MS }, "game", 10_000).ok);
  });

  it("hands back a `fail` that keeps the client id", () => {
    const head = openRecord(valid, "game");
    assert.ok(head.ok);
    assert.deepEqual(head.fail("Because."), { ok: false, clientId: valid.clientId, reason: "Because." });
  });
});

describe("dataOrNull", () => {
  const parse = (raw: unknown): Parsed<number> => (typeof raw === "number" ? { ok: true, data: raw } : { ok: false, clientId: null, reason: "no" });

  it("unwraps a valid parse and turns a rejection into null", () => {
    const adapted = dataOrNull(parse);
    assert.equal(adapted(5), 5);
    assert.equal(adapted(0), 0);
    assert.equal(adapted("5"), null);
  });
});
