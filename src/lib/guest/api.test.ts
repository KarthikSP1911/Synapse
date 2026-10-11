import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { guestFetch } from "./api";
import { guestSkillSummaries, guestWeakItems } from "./progress";
import { GUEST_STORAGE_KEY, loadGuestData } from "./storage";
import { questionFromId } from "@/lib/skills/build";

// A minimal in-memory localStorage; node has none.
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

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

const post = (url: string, body?: unknown) =>
  guestFetch(url, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });

const multiplicationSession = {
  skill: "multiplication",
  mode: "fixed",
  targetQuestionCount: 10,
  config: { skill: "multiplication", left: [6], right: [7] },
};

/** Starts a session and returns its id. */
async function start(body: Record<string, unknown> = multiplicationSession): Promise<number> {
  const res = await post("/api/sessions", body);
  assert.equal(res.status, 201, JSON.stringify(await res.clone().json()));
  return (await res.json()).id;
}

async function nextQuestion(id: number, exclude?: string) {
  const res = await guestFetch(`/api/sessions/${id}/next${exclude ? `?exclude=${encodeURIComponent(exclude)}` : ""}`);
  assert.equal(res.status, 200);
  return res.json();
}

/** The correct answer, derived the way the server would: from the question id alone. */
const correct = (questionId: string) => questionFromId(questionId)!.answerText;

describe("guest sessions", () => {
  it("creates numbered sessions without leaking the attempt log", async () => {
    const first = await post("/api/sessions", multiplicationSession);
    const body = await first.json();
    assert.equal(body.id, 1);
    assert.equal(body.attempts, undefined);
    assert.equal(await start(), 2);
  });

  it("rejects invalid requests with the same errors as the server", async () => {
    const res = await post("/api/sessions", { mode: "sprint" });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /mode must be/);
    assert.equal((await guestFetch("/api/sessions", { method: "POST", body: "not json" })).status, 400);
    assert.equal((await guestFetch("/api/sessions/99/next")).status, 404);
  });

  it("serves a question, scores the answer and tracks the session", async () => {
    const id = await start();
    const { question, targetQuestionCount } = await nextQuestion(id);
    assert.equal(question.id, "multiplication:6:7");
    assert.equal(targetQuestionCount, 10);
    assert.equal(question.answer, undefined, "the answer must not reach the screen");

    const right = await (await post(`/api/sessions/${id}/attempt`, { questionId: question.id, userAnswer: "42", responseTimeMs: 1200 })).json();
    assert.equal(right.isCorrect, true);
    assert.equal(right.correctAnswer, "42");
    assert.equal(right.finished, false);

    const wrong = await (await post(`/api/sessions/${id}/attempt`, { questionId: question.id, userAnswer: "41", responseTimeMs: 3000 })).json();
    assert.equal(wrong.isCorrect, false);
    assert.equal(wrong.outcome, "incorrect");

    const [session] = loadGuestData().sessions;
    assert.equal(session.actualQuestionCount, 2);
    assert.equal(session.totalCorrect, 1);
    assert.equal(session.accuracy, 50);
    assert.equal(session.averageResponseTimeMs, 2100);
  });

  it("finishes a fixed session at its target and then reports it finished", async () => {
    const id = await start({ ...multiplicationSession, targetQuestionCount: 10 });
    let finished = false;
    for (let i = 0; i < 10; i++) {
      const { question } = await nextQuestion(id);
      const res = await (await post(`/api/sessions/${id}/attempt`, { questionId: question.id, userAnswer: correct(question.id), responseTimeMs: 500 })).json();
      finished = res.finished;
    }
    assert.equal(finished, true);
    assert.deepEqual(await nextQuestion(id), { finished: true });
    assert.equal((await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:6:7", userAnswer: "42", responseTimeMs: 1 })).status, 409);
  });

  it("refuses malformed attempts, foreign questions and answers that cannot be parsed", async () => {
    const id = await start();
    assert.equal((await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:6:7", responseTimeMs: -1, userAnswer: "42" })).status, 400);
    assert.equal((await post(`/api/sessions/${id}/attempt`, { questionId: "nonsense", responseTimeMs: 10, userAnswer: "42" })).status, 400);
    // A valid question that this session can never ask would skew the statistics.
    assert.equal((await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:2:3", responseTimeMs: 10, userAnswer: "6" })).status, 400);
    assert.equal((await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:6:7", responseTimeMs: 10, userAnswer: "abc" })).status, 400);
    assert.equal(loadGuestData().sessions[0].actualQuestionCount, 0);
  });

  it("only accepts a timeout that really elapsed", async () => {
    const id = await start({ ...multiplicationSession, questionTimeLimitSeconds: 10 });
    const early = await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:6:7", outcome: "timed_out", responseTimeMs: 2000 });
    assert.equal(early.status, 400);
    const late = await (await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:6:7", outcome: "timed_out", responseTimeMs: 10500 })).json();
    assert.equal(late.outcome, "timed_out");
  });

  it("stops the clock while paused and blocks answers", async () => {
    const id = await start({ mode: "timed", durationSeconds: 60, skill: "multiplication", config: { skill: "multiplication", left: [6], right: [7] } });
    assert.equal((await (await post(`/api/sessions/${id}/pause`)).json()).paused, true);
    assert.equal((await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:6:7", userAnswer: "42", responseTimeMs: 10 })).status, 409);
    const resumed = await (await post(`/api/sessions/${id}/resume`)).json();
    assert.equal(resumed.paused, false);
    assert.equal(resumed.durationSeconds, 60);
    assert.equal((await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:6:7", userAnswer: "42", responseTimeMs: 10 })).status, 200);
  });

  it("ends a session early and keeps it ended", async () => {
    const id = await start();
    await post(`/api/sessions/${id}/end`);
    assert.deepEqual(await nextQuestion(id), { finished: true });
    assert.notEqual(loadGuestData().sessions[0].endedAt, null);
  });
});

describe("guest review", () => {
  async function sessionWithMistake() {
    const id = await start({ ...multiplicationSession, config: { skill: "multiplication", left: [6, 7], right: [8] } });
    await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:6:8", userAnswer: "40", responseTimeMs: 900 });
    await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:7:8", userAnswer: "56", responseTimeMs: 900 });
    return id;
  }

  it("retries only the questions that were missed", async () => {
    const id = await sessionWithMistake();
    const res = await post("/api/sessions", { mode: "review", reviewSessionId: id });
    assert.equal(res.status, 201);
    const review = await res.json();
    assert.equal(review.mode, "review");
    assert.deepEqual(review.questionList, ["multiplication:6:8"]);
    assert.equal(review.targetQuestionCount, 1);
    assert.equal((await nextQuestion(review.id)).question.id, "multiplication:6:8");
  });

  it("reviews recent mistakes across sessions, and says so when there are none", async () => {
    assert.equal((await post("/api/sessions", { mode: "review", reviewRecentDays: 7 })).status, 400);
    await sessionWithMistake();
    const res = await post("/api/sessions", { mode: "review", reviewRecentDays: 7, skill: "multiplication" });
    assert.deepEqual((await res.json()).questionList, ["multiplication:6:8"]);
    assert.equal((await post("/api/sessions", { mode: "review", reviewRecentDays: 7, skill: "square" })).status, 400);
    assert.equal((await post("/api/sessions", { mode: "review", reviewSessionId: 99 })).status, 404);
  });
});

describe("guest statistics", () => {
  it("builds per-question stats that feed the progress figures", async () => {
    const id = await start();
    await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:6:7", userAnswer: "41", responseTimeMs: 4000 });
    await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:6:7", userAnswer: "42", responseTimeMs: 2000 });

    const data = loadGuestData();
    const stat = data.stats["multiplication:6:7"];
    assert.equal(stat.totalAttempts, 2);
    assert.equal(stat.correctAttempts, 1);
    assert.equal(stat.accuracy, 50);
    assert.equal(stat.averageResponseTimeMs, 3000);

    const summaries = guestSkillSummaries(data);
    assert.equal(summaries.multiplication.attempts, 2);
    assert.equal(summaries.multiplication.accuracy, 50);
    assert.equal(summaries.square.attempts, 0);
    assert.equal(guestWeakItems(data, "all")[0].questionId, "multiplication:6:7");
  });

  it("survives corrupt or foreign data in storage", async () => {
    localStorage.setItem(GUEST_STORAGE_KEY, "{not json");
    assert.deepEqual(loadGuestData().sessions, []);
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ version: 2, sessions: "x" }));
    assert.deepEqual(loadGuestData().sessions, []);
    assert.equal(await start(), 1);
  });
});
