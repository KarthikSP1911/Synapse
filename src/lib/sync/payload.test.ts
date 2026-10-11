import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_SYNC_SESSIONS, parseSyncBody, validateSession } from "./payload";

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

const attempt = (over: Record<string, unknown> = {}) => ({
  questionId: "multiplication:6:7",
  userAnswerText: "42",
  outcome: "correct",
  hinted: false,
  responseTimeMs: 2000,
  at: NOW - 60_000,
  ...over,
});

const session = (over: Record<string, unknown> = {}) => ({
  clientId: "11111111-2222-3333-4444-555555555555",
  skill: "multiplication",
  mode: "fixed",
  focus: "adaptive",
  config: { skill: "multiplication", left: [6], right: [7] },
  targetQuestionCount: 10,
  durationSeconds: null,
  questionTimeLimitSeconds: 0,
  weakFocusPercent: 30,
  recentWindow: 5,
  questionList: null,
  startedAt: NOW - 120_000,
  endedAt: NOW - 30_000,
  pausedMs: 0,
  attempts: [attempt()],
  ...over,
});

function valid(raw: unknown) {
  const result = validateSession(raw, NOW);
  if (!result.ok) assert.fail(`rejected: ${result.reason}`);
  return result.session;
}

describe("parseSyncBody", () => {
  it("accepts a list of sessions and rejects anything else", () => {
    assert.equal(parseSyncBody({ sessions: [] }).ok, true);
    assert.equal(parseSyncBody(null).ok, false);
    assert.equal(parseSyncBody({ sessions: "no" }).ok, false);
    assert.equal(parseSyncBody({ sessions: new Array(MAX_SYNC_SESSIONS + 1).fill({}) }).ok, false);
  });
});

describe("validateSession", () => {
  it("accepts a well-formed session", () => {
    const s = valid(session());
    assert.equal(s.attempts.length, 1);
    assert.equal(s.attempts[0].outcome, "correct");
    assert.equal(s.fields.config?.skill, "multiplication");
  });

  it("decides correctness again from the raw answer, ignoring the reported outcome", () => {
    const s = valid(session({ attempts: [attempt({ userAnswerText: "41", outcome: "correct" })] }));
    assert.equal(s.attempts[0].outcome, "incorrect");
  });

  it("drops answers that are not valid input, questions outside the session and unknown questions", () => {
    const s = valid(
      session({
        attempts: [
          attempt({ userAnswerText: "abc", at: NOW - 5000 }),
          attempt({ questionId: "multiplication:2:3", at: NOW - 4000 }),
          attempt({ questionId: "nonsense", at: NOW - 3000 }),
          attempt({ at: NOW - 2000 }),
        ],
      })
    );
    assert.deepEqual(s.attempts.map((a) => a.at), [NOW - 2000]);
  });

  it("keeps one attempt per timestamp, so a re-sent attempt is not counted twice", () => {
    const s = valid(session({ attempts: [attempt(), attempt()] }));
    assert.equal(s.attempts.length, 1);
  });

  it("sorts attempts by the time they happened", () => {
    const s = valid(session({ attempts: [attempt({ at: NOW - 1000 }), attempt({ at: NOW - 9000 })] }));
    assert.deepEqual(s.attempts.map((a) => a.at), [NOW - 9000, NOW - 1000]);
  });

  it("does not accept more attempts than a fixed session asks for", () => {
    const attempts = Array.from({ length: 15 }, (_, i) => attempt({ at: NOW - 100_000 + i * 1000 }));
    assert.equal(valid(session({ attempts })).attempts.length, 10);
  });

  it("accepts skips, and timeouts only when the session has a per-question limit", () => {
    const skipped = attempt({ userAnswerText: null, outcome: "skipped", at: NOW - 3000 });
    const timedOut = attempt({ userAnswerText: null, outcome: "timed_out", at: NOW - 2000 });
    assert.equal(valid(session({ attempts: [skipped, timedOut] })).attempts.map((a) => a.outcome).join(), "skipped");
    assert.equal(valid(session({ questionTimeLimitSeconds: 10, attempts: [skipped, timedOut] })).attempts.map((a) => a.outcome).join(), "skipped,timed_out");
  });

  it("drops an answered attempt that carries no answer", () => {
    assert.equal(valid(session({ attempts: [attempt({ userAnswerText: null, outcome: "correct" })] })).attempts.length, 0);
  });

  it("clamps an attempt dated in the future to now", () => {
    assert.equal(valid(session({ attempts: [attempt({ at: NOW + 3_600_000 })] })).attempts[0].at, NOW);
  });

  it("rejects bad client ids, dates and settings", () => {
    for (const bad of [
      session({ clientId: "short" }),
      session({ clientId: undefined }),
      session({ startedAt: "yesterday" }),
      session({ startedAt: NOW + 3_600_000 }),
      session({ endedAt: NOW - 500_000 }),
      session({ pausedMs: -1 }),
      session({ mode: "bogus" }),
      session({ config: { skill: "multiplication", left: [], right: [7] } }),
      session({ attempts: "none" }),
      null,
    ]) {
      assert.equal(validateSession(bad, NOW).ok, false, JSON.stringify(bad));
    }
  });

  it("accepts a review session made of valid questions and rejects invalid ones", () => {
    const review = session({ mode: "review", skill: "multiplication", config: null, targetQuestionCount: 1, questionList: ["multiplication:6:7"] });
    assert.equal(valid(review).fields.mode, "review");
    assert.equal(validateSession(session({ ...review, questionList: ["nonsense"] }), NOW).ok, false);
    assert.equal(validateSession(session({ ...review, questionList: [] }), NOW).ok, false);
  });
});
