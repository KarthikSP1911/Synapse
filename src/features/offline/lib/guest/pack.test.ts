import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLocalFetch } from "./api";
import { packData, unpackData } from "./pack";
import { loadGuestData, userStorageKey, type GuestData } from "./storage";
import { questionFromId } from "@/features/skills/lib/build";

class MemoryStorage {
  private items = new Map<string, string>();
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

const KEY = userStorageKey(3);
const local = createLocalFetch({ key: KEY, syncable: true });

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

const post = (url: string, body?: unknown) =>
  local(url, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });

const CONFIGS = [
  { skill: "multiplication", left: [6, 7, 8], right: [7, 9, 12] },
  { skill: "percentage", difficulty: "intermediate", exerciseTypes: ["of", "what", "change", "convert"], baseMin: 10, baseMax: 500 },
  { skill: "fraction", difficulty: "intermediate", exerciseTypes: ["simplify", "of", "compare", "convert"] },
  { skill: "square", exerciseTypes: ["value", "root", "missing"], rangeMin: 2, rangeMax: 30 },
];

/** Plays real sessions through the local API: right answers, wrong answers and skips, across every skill. */
async function practise(answersPerSession = 12): Promise<GuestData> {
  for (const config of CONFIGS) {
    const created = await post("/api/sessions", { skill: config.skill, mode: "endless", config });
    const { id } = await created.json();
    for (let i = 0; i < answersPerSession; i++) {
      const next = await (await local(`/api/sessions/${id}/next`)).json();
      const q = questionFromId(next.question.id)!;
      const choice = q.answerFormat.kind === "choice";
      const body =
        i % 4 === 3
          ? { questionId: q.id, outcome: "skipped", responseTimeMs: 2500 }
          : i % 4 === 2
            ? { questionId: q.id, userAnswer: choice ? q.choices!.find((c) => c.value !== q.expected)!.value : "7919", responseTimeMs: 1800 }
            : { questionId: q.id, userAnswer: choice ? (q.expected as string) : q.answerText, hinted: i % 5 === 0, responseTimeMs: 1200 + i * 37 };
      assert.equal((await post(`/api/sessions/${id}/attempt`, body)).status, 200);
    }
    if (config.skill !== "square") await post(`/api/sessions/${id}/end`);
  }
  return loadGuestData(KEY);
}

const packedSize = (texts: string[]) => texts.reduce((n, t) => n + t.length, 0);

describe("packData / unpackData", () => {
  it("reads back exactly what real practice produced", async () => {
    const data = await practise();
    assert.ok(data.sessions.length === CONFIGS.length && data.sessions.every((s) => s.attempts.length > 0));
    assert.ok(Object.keys(data.stats).length > 10);
    assert.deepEqual(unpackData(packData(data)), data);
  });

  it("keeps the account the data belongs to", async () => {
    const data = { ...(await practise(3)), userId: 3 };
    assert.equal(unpackData(packData(data))?.userId, 3);
    assert.equal("userId" in (unpackData(packData({ ...data, userId: undefined })) ?? {}), false);
  });

  it("stores a small fraction of the plain JSON", async () => {
    const data = await practise(40);
    assert.ok(packedSize(packData(data)) < JSON.stringify(data).length / 4);
  });

  it("stores a record as it was when its text differs from what the id says", async () => {
    const data = await practise(6);
    // E.g. wording kept from an older generator, or statistics pulled from the server.
    data.sessions[0].attempts[0].prompt = "an older wording";
    data.sessions[1].attempts[1].correctAnswerText = "different";
    data.sessions[2].attempts[2].isCorrect = !data.sessions[2].attempts[2].isCorrect;
    const [firstStatId, secondStatId] = Object.keys(data.stats);
    data.stats[firstStatId].prompt = "stats wording";
    data.stats[secondStatId].concept = "another:concept";
    assert.deepEqual(unpackData(packData(data)), data);
  });

  it("keeps attempts and statistics for ids it cannot interpret, with their times intact", async () => {
    const data = await practise(5);
    const session = data.sessions[0];
    session.attempts[2] = { ...session.attempts[2], questionId: "retired:1:2" };
    data.stats["retired:1:2"] = { ...data.stats[Object.keys(data.stats)[0]], questionId: "retired:1:2" };
    assert.deepEqual(unpackData(packData(data)), data);
  });

  it("stores a statistics row whose key differs from its own question id", async () => {
    const data = await practise(3);
    const [id] = Object.keys(data.stats);
    data.stats["odd-key"] = { ...data.stats[id] };
    assert.deepEqual(unpackData(packData(data)), data);
  });

  it("drops what a newer version can no longer interpret, without shifting later times", async () => {
    const data = await practise(5);
    const texts = packData(data);
    // Hand-edit the first session's text, as if its middle answer was for a question that no longer exists.
    const [session, attempts] = JSON.parse(texts[1 + 16]) as [unknown, unknown[][]];
    attempts[2][0] = "retired:1:2";
    texts[1 + 16] = JSON.stringify([session, attempts]);

    const back = unpackData(texts)!;
    const kept = back.sessions[0].attempts;
    assert.equal(kept.length, data.sessions[0].attempts.length - 1);
    assert.ok(!kept.some((a) => a.questionId === "retired:1:2"));
    // Every attempt after the dropped one still has its original time.
    assert.deepEqual(
      kept.map((a) => a.at),
      data.sessions[0].attempts.filter((_, i) => i !== 2).map((a) => a.at)
    );
  });

  it("changes only the statistics shard that holds the answered question", async () => {
    const data = await practise(20);
    const before = packData(data);
    const [id] = Object.keys(data.stats);
    data.stats[id] = { ...data.stats[id], totalAttempts: data.stats[id].totalAttempts + 1 };
    const after = packData(data);
    assert.equal(after.length, before.length);
    assert.deepEqual(
      after.flatMap((text, i) => (text === before[i] ? [] : [i])).length,
      1,
      "one text changes"
    );
  });

  it("answers null for texts that are not in this layout", () => {
    assert.equal(unpackData([]), null);
    assert.equal(unpackData(["not json"]), null);
    assert.equal(unpackData(['{"v":1,"nextId":1,"shards":0}']), null);
    assert.equal(unpackData(['{"v":2,"nextId":"x","shards":0}']), null);
    assert.equal(unpackData(['{"v":2,"nextId":1,"shards":16}']), null, "missing shard texts");
    assert.equal(unpackData(['{"v":2,"nextId":1,"shards":0}', "[not json"]), null);
  });
});
