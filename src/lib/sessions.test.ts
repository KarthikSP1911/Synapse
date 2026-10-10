import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isQuestionInSession, parseSessionRequest, reviewQuestionIds, sessionConfig, type SessionShape } from "./sessions";
import { isTimedOut, sessionDeadline, TIMED_GRACE_MS } from "./validation";

const practice = (body: Record<string, unknown>) => {
  const r = parseSessionRequest(body);
  assert.ok(r.ok && r.kind === "practice", JSON.stringify(r));
  return r.session;
};
const error = (body: Record<string, unknown>) => {
  const r = parseSessionRequest(body);
  assert.ok(!r.ok, "expected an error");
  return r.error;
};

describe("session requests", () => {
  it("accepts the original multiplication payload unchanged", () => {
    const s = practice({ mode: "fixed", targetQuestionCount: 20, selectedLeftNumbers: [2, 3], selectedRightNumbers: [4, 5] });
    assert.equal(s.skill, "multiplication");
    assert.equal(s.focus, "adaptive");
    assert.equal(s.weakFocusPercent, 30);
    assert.equal(s.recentWindow, 5);
    assert.deepEqual(s.selectedLeftNumbers, [2, 3]);
    assert.equal(s.targetQuestionCount, 20);
    assert.equal(s.durationSeconds, null);
    assert.equal(s.questionTimeLimitSeconds, null);
  });

  it("accepts a skill config for every skill and every mode", () => {
    const base = { mode: "endless" };
    assert.equal(practice({ ...base, skill: "square", config: { skill: "square", exerciseTypes: ["value"], rangeMin: 1, rangeMax: 20 } }).skill, "square");
    assert.equal(
      practice({ ...base, skill: "fraction", config: { skill: "fraction", exerciseTypes: ["simplify", "of"], difficulty: "beginner" } }).skill,
      "fraction"
    );
    const pct = practice({
      mode: "timed",
      durationSeconds: 60,
      focus: "weak",
      questionTimeLimitSeconds: 20,
      skill: "percentage",
      config: { skill: "percentage", exerciseTypes: ["of"], difficulty: "beginner", baseMin: 10, baseMax: 200 },
    });
    assert.equal(pct.durationSeconds, 60);
    assert.equal(pct.focus, "weak");
    assert.equal(pct.questionTimeLimitSeconds, 20);
    assert.deepEqual(pct.selectedLeftNumbers, []);
    for (const targetQuestionCount of [10, 20, 30, 50, 100]) {
      practice({ mode: "fixed", targetQuestionCount, skill: "square", config: { skill: "square", exerciseTypes: ["root"], rangeMin: 1, rangeMax: 10 } });
    }
  });

  it("rejects invalid input", () => {
    const sq = { skill: "square", config: { skill: "square", exerciseTypes: ["value"], rangeMin: 1, rangeMax: 20 } };
    assert.match(error({ mode: "nope" }), /mode/);
    assert.match(error({ mode: "fixed", targetQuestionCount: 15, ...sq }), /targetQuestionCount/);
    assert.match(error({ mode: "timed", durationSeconds: 45, ...sq }), /durationSeconds/);
    assert.match(error({ mode: "endless", skill: "algebra" }), /skill/);
    assert.match(error({ mode: "endless", focus: "everything", ...sq }), /focus/);
    assert.match(error({ mode: "endless", weakFocusPercent: 90, ...sq }), /settings/);
    assert.match(error({ mode: "endless", questionTimeLimitSeconds: 7, ...sq }), /questionTimeLimitSeconds/);
    assert.match(error({ mode: "endless", selectedLeftNumbers: [], selectedRightNumbers: [1] }), /between 1 and 20/);
    assert.match(error({ mode: "endless", skill: "percentage", config: sq.config }), /match/);
    assert.match(error({ mode: "endless", skill: "square", config: { skill: "square", exerciseTypes: ["value"], rangeMin: 0, rangeMax: 20 } }), /range/i);
  });

  it("refuses a configuration whose pool is empty", () => {
    const message = error({
      mode: "endless",
      skill: "percentage",
      config: { skill: "percentage", exerciseTypes: ["of"], difficulty: "beginner", baseMin: 1, baseMax: 1 },
    });
    assert.match(message, /No questions/);
  });

  it("parses review requests from a session or a number of days", () => {
    const bySession = parseSessionRequest({ mode: "review", reviewSessionId: 7 });
    assert.ok(bySession.ok && bySession.kind === "review");
    assert.deepEqual(bySession.review, { sessionId: 7 });
    const byDays = parseSessionRequest({ mode: "review", reviewRecentDays: 7, skill: "fraction", exerciseType: "compare" });
    assert.ok(byDays.ok && byDays.kind === "review");
    assert.deepEqual(byDays.review, { sinceDays: 7, skill: "fraction", exerciseType: "compare" });

    assert.ok(!parseSessionRequest({ mode: "review" }).ok);
    assert.ok(!parseSessionRequest({ mode: "review", reviewSessionId: 1, reviewRecentDays: 7 }).ok);
    assert.ok(!parseSessionRequest({ mode: "review", reviewRecentDays: 31 }).ok);
    assert.ok(!parseSessionRequest({ mode: "review", reviewSessionId: "abc" }).ok);
    assert.ok(!parseSessionRequest({ mode: "review", reviewRecentDays: 7, skill: "bogus" }).ok);
  });
});

const baseSession = (over: Partial<SessionShape>): SessionShape => ({
  skill: "multiplication",
  mode: "fixed",
  config: null,
  selectedLeftNumbers: [3],
  selectedRightNumbers: [4, 5],
  questionList: null,
  pairList: null,
  ...over,
});

describe("session membership", () => {
  it("treats sessions from before multi-skill support as multiplication", () => {
    const old = baseSession({});
    assert.equal(sessionConfig(old)?.skill, "multiplication");
    assert.ok(isQuestionInSession(old, "multiplication:3:4"));
    assert.ok(isQuestionInSession(old, "multiplication:3:5"));
    assert.ok(!isQuestionInSession(old, "multiplication:4:3"));
    assert.ok(!isQuestionInSession(old, "square:value:3"));
  });

  it("only accepts questions inside a skill's pool", () => {
    const sq = baseSession({
      skill: "square",
      config: { skill: "square", exerciseTypes: ["value"], rangeMin: 10, rangeMax: 12 },
    });
    assert.ok(isQuestionInSession(sq, "square:value:11"));
    assert.ok(!isQuestionInSession(sq, "square:value:13"));
    assert.ok(!isQuestionInSession(sq, "square:root:121")); // exercise type not enabled
    assert.ok(!isQuestionInSession(sq, "multiplication:3:4"));
  });

  it("limits review sessions to their question list, including legacy pair lists", () => {
    const review = baseSession({ mode: "review", questionList: ["square:value:9", "fraction:simplify:12:16"] });
    assert.ok(isQuestionInSession(review, "square:value:9"));
    assert.ok(!isQuestionInSession(review, "square:value:10"));
    const legacy = baseSession({ mode: "review", pairList: [{ left: 6, right: 7 }] });
    assert.deepEqual(reviewQuestionIds(legacy), ["multiplication:6:7"]);
    assert.ok(isQuestionInSession(legacy, "multiplication:6:7"));
    assert.equal(sessionConfig(legacy), null);
  });
});

describe("timed sessions with pauses", () => {
  const startedAt = new Date("2026-03-01T12:00:00Z");
  const at = (seconds: number) => startedAt.getTime() + seconds * 1000;
  const timed = { mode: "timed", durationSeconds: 60, startedAt };

  it("times out when the duration has passed", () => {
    assert.equal(isTimedOut(timed, 0, at(59)), false);
    assert.equal(isTimedOut(timed, 0, at(61)), true);
    assert.equal(isTimedOut(timed, TIMED_GRACE_MS, at(61)), false);
    assert.equal(isTimedOut(timed, TIMED_GRACE_MS, at(63)), true);
  });

  it("pushes the deadline back by the time spent paused", () => {
    const paused = { ...timed, pausedMs: 30_000 };
    assert.equal(sessionDeadline(paused)?.getTime(), at(90));
    assert.equal(isTimedOut(paused, 0, at(80)), false);
    assert.equal(isTimedOut(paused, 0, at(91)), true);
  });

  it("never times out while paused", () => {
    assert.equal(isTimedOut({ ...timed, pausedAt: new Date(at(30)) }, 0, at(600)), false);
  });

  it("only timed sessions have a deadline", () => {
    assert.equal(sessionDeadline({ mode: "fixed", durationSeconds: null, startedAt }), null);
    assert.equal(isTimedOut({ mode: "endless", durationSeconds: null, startedAt }, 0, at(99999)), false);
  });
});
