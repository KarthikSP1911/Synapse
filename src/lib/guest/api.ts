import { applyAttempt } from "@/lib/item-stats";
import { guestNextQuestion } from "@/lib/guest/engine";
import {
  MAX_ATTEMPTS_PER_SESSION,
  findSession,
  loadGuestData,
  saveGuestData,
  toItemStats,
  type GuestAttempt,
  type GuestData,
  type GuestSession,
  type GuestStat,
} from "@/lib/guest/storage";
import { MAX_REVIEW_QUESTIONS, isQuestionInSession, parseSessionRequest } from "@/lib/sessions";
import { checkAnswer } from "@/lib/skills/answers";
import { questionFromId, toPublicQuestion } from "@/lib/skills/build";
import { EXERCISE_TYPES, type Outcome } from "@/lib/skills/types";
import { MAX_RESPONSE_TIME_MS, QUESTION_LIMIT_SLACK_MS, TIMED_GRACE_MS, isTimedOut, parseId, sessionDeadline, type TimedSession } from "@/lib/validation";

/**
 * Guest mode has no server session, so this module answers the same requests as the `/api/sessions`
 * routes (same URLs, bodies, status codes and JSON) from localStorage instead. The practice screens call
 * `guestFetch` where a signed-in user's screens call `fetch`, and can tell no difference.
 *
 * Unlike the server, nothing here is a security boundary: a guest can only cheat themselves. The
 * checks are kept anyway so both modes behave identically (a stray request cannot corrupt the history).
 */

const json = (body: unknown, status = 200) => Response.json(body, { status });
const error = (message: string, status: number) => json({ error: message }, status);

/** The clock-related view of a stored session, in the shape the shared timing helpers expect. */
const timing = (s: GuestSession): TimedSession => ({
  mode: s.mode,
  durationSeconds: s.durationSeconds,
  startedAt: new Date(s.startedAt),
  pausedAt: s.pausedAt === null ? null : new Date(s.pausedAt),
  pausedMs: s.pausedMs,
});

/** The session as the API returns it: without the attempt log (`undefined` is dropped when serialised). */
const publicSession = (s: GuestSession) => ({ ...s, attempts: undefined });

/** The request body as an object, or null when it is missing or not a JSON object. */
function readBody(init: RequestInit): Record<string, unknown> | null {
  try {
    const body: unknown = JSON.parse(typeof init.body === "string" ? init.body : "null");
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function guestFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { pathname, searchParams } = new URL(url, "http://guest.invalid");
  const method = (init.method ?? "GET").toUpperCase();

  try {
    if (pathname === "/api/sessions" && method === "POST") {
      const body = readBody(init);
      return body ? createSession(body) : error("Invalid JSON body", 400);
    }

    const match = /^\/api\/sessions\/(\d+)\/(next|attempt|end|pause|resume)$/.exec(pathname);
    if (!match) return error("Not found", 404);
    const id = parseId(match[1]);
    if (id === null) return error("Invalid session id", 400);

    const data = loadGuestData();
    const session = findSession(data, id);
    if (!session) return error("Session not found", 404);

    switch (match[2]) {
      case "next":
        return nextQuestion(data, session, searchParams.get("exclude") ?? undefined);
      case "attempt": {
        const body = readBody(init);
        return body ? recordAttempt(data, session, body) : error("Invalid JSON body", 400);
      }
      case "end":
        return endSession(data, session);
      case "pause":
        return pauseSession(data, session);
      default:
        return resumeSession(data, session);
    }
  } catch (err) {
    console.error("Guest request failed:", err);
    return error("Something went wrong in guest mode", 500);
  }
}

// ---------------------------------------------------------------------------

function createSession(body: Record<string, unknown>): Response {
  const parsed = parseSessionRequest(body);
  if (!parsed.ok) return error(parsed.error, 400);

  const data = loadGuestData();
  const base = {
    id: data.nextId,
    actualQuestionCount: 0,
    totalCorrect: 0,
    totalIncorrect: 0,
    accuracy: 0,
    averageResponseTimeMs: 0,
    startedAt: Date.now(),
    endedAt: null,
    pausedAt: null,
    pausedMs: 0,
    attempts: [],
  };
  let session: GuestSession;

  if (parsed.kind === "review") {
    const { review } = parsed;
    let skill = review.skill ?? "multiplication";
    if (review.sessionId !== undefined) {
      const source = findSession(data, review.sessionId);
      if (!source) return error("Session not found", 404);
      skill = source.skill;
    }
    if (review.exerciseType && !(EXERCISE_TYPES[skill] as readonly string[]).includes(review.exerciseType)) {
      return error(`Unknown exercise type for ${skill}`, 400);
    }
    const questionIds = mistakeQuestionIds(data, { ...review, skill });
    if (questionIds.length === 0) return error("No mistakes to review", 400);

    session = {
      ...base,
      skill,
      mode: "review",
      focus: "adaptive",
      config: null,
      targetQuestionCount: questionIds.length,
      durationSeconds: null,
      questionTimeLimitSeconds: parsed.questionTimeLimitSeconds,
      weakFocusPercent: parsed.weakFocusPercent,
      recentWindow: parsed.recentWindow,
      questionList: questionIds,
      selectedLeftNumbers: [],
      selectedRightNumbers: [],
    };
  } else {
    session = { ...base, ...parsed.session, questionList: null };
  }

  data.nextId += 1;
  data.sessions.push(session);
  // The session lives only in this browser, so if it cannot be stored there is nothing to practise on.
  if (!saveGuestData(data)) return error("This browser is not letting Mathz save guest progress.", 500);
  return json(publicSession(session), 201);
}

/**
 * Distinct questions answered wrong (incorrect, skipped or timed out), most recent mistake first and
 * capped, optionally limited to one session, a look-back window, a skill and an exercise type.
 */
function mistakeQuestionIds(
  data: GuestData,
  scope: { sessionId?: number; sinceDays?: number; skill?: string; exerciseType?: string }
): string[] {
  const since = scope.sinceDays === undefined ? 0 : Date.now() - scope.sinceDays * 24 * 60 * 60 * 1000;
  const lastMissed = new Map<string, number>();
  for (const session of data.sessions) {
    if (scope.sessionId !== undefined && session.id !== scope.sessionId) continue;
    for (const a of session.attempts) {
      if (a.isCorrect || a.at < since) continue;
      if (scope.skill && a.skill !== scope.skill) continue;
      if (scope.exerciseType && a.exerciseType !== scope.exerciseType) continue;
      lastMissed.set(a.questionId, Math.max(lastMissed.get(a.questionId) ?? 0, a.at));
    }
  }
  return [...lastMissed]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .filter((id) => questionFromId(id) !== null)
    .slice(0, MAX_REVIEW_QUESTIONS);
}

function nextQuestion(data: GuestData, session: GuestSession, excludeId?: string): Response {
  const complete =
    session.endedAt !== null ||
    isTimedOut(timing(session)) ||
    (session.targetQuestionCount !== null && session.actualQuestionCount >= session.targetQuestionCount);

  if (complete) {
    if (session.endedAt === null) {
      // A timed session ended when its clock ran out, not when this request happened to arrive.
      session.endedAt = sessionDeadline(timing(session))?.getTime() ?? Date.now();
      saveGuestData(data);
    }
    return json({ finished: true });
  }

  const question = guestNextQuestion(session, data.stats, excludeId);
  return json({
    question: toPublicQuestion(question),
    skill: session.skill,
    mode: session.mode,
    startedAt: new Date(session.startedAt).toISOString(),
    serverNow: Date.now(),
    durationSeconds: session.durationSeconds,
    pausedMs: session.pausedMs,
    paused: session.pausedAt !== null,
    questionTimeLimitSeconds: session.questionTimeLimitSeconds,
    targetQuestionCount: session.targetQuestionCount,
    answeredCount: session.actualQuestionCount,
  });
}

function recordAttempt(data: GuestData, session: GuestSession, body: Record<string, unknown>): Response {
  const { questionId, responseTimeMs, hinted = false, outcome: reported = "answered" } = body;
  const userAnswer = typeof body.userAnswer === "number" && Number.isSafeInteger(body.userAnswer) ? String(body.userAnswer) : body.userAnswer;

  if (
    typeof questionId !== "string" ||
    typeof responseTimeMs !== "number" ||
    !Number.isInteger(responseTimeMs) ||
    responseTimeMs < 0 ||
    typeof hinted !== "boolean" ||
    (reported !== "answered" && reported !== "skipped" && reported !== "timed_out") ||
    (reported === "answered" && typeof userAnswer !== "string")
  ) {
    return error("Invalid attempt payload", 400);
  }
  const elapsedMs = Math.min(responseTimeMs, MAX_RESPONSE_TIME_MS);

  const question = questionFromId(questionId);
  if (!question) return error("Unknown question", 400);

  const target = session.targetQuestionCount;
  if (target !== null && session.actualQuestionCount >= target) return error("Session already completed", 409);
  if (isTimedOut(timing(session), TIMED_GRACE_MS)) return error("Session already completed", 409);
  if (session.pausedAt !== null) return error("Session is paused", 409);
  if (!isQuestionInSession(session, question.id)) return error("Question is not part of this session", 400);

  let outcome: Outcome;
  if (reported === "answered") {
    const check = checkAnswer(question, userAnswer);
    if (check.status === "invalid") return error(check.reason, 400);
    outcome = check.status;
  } else if (reported === "skipped") {
    outcome = "skipped";
  } else {
    // A timeout is only believable when the session has a per-question limit and it really elapsed.
    const limitMs = (session.questionTimeLimitSeconds ?? 0) * 1000;
    if (limitMs === 0 || elapsedMs < limitMs - QUESTION_LIMIT_SLACK_MS) return error("Question has not timed out", 400);
    outcome = "timed_out";
  }

  const now = Date.now();
  const isCorrect = outcome === "correct";
  const finished = (target !== null && session.actualQuestionCount + 1 >= target) || isTimedOut(timing(session));

  const attempt: GuestAttempt = {
    questionId: question.id,
    skill: question.skill,
    exerciseType: question.exerciseType,
    difficulty: question.difficulty,
    prompt: question.prompt,
    correctAnswerText: question.answerText,
    userAnswerText: reported === "answered" ? (userAnswer as string) : null,
    isCorrect,
    outcome,
    hinted,
    responseTimeMs: elapsedMs,
    at: now,
  };
  session.attempts.push(attempt);
  if (session.attempts.length > MAX_ATTEMPTS_PER_SESSION) session.attempts.splice(0, session.attempts.length - MAX_ATTEMPTS_PER_SESSION);

  // The same integer arithmetic the database uses for the running session figures.
  const count = session.actualQuestionCount;
  session.averageResponseTimeMs = Math.floor((session.averageResponseTimeMs * count + elapsedMs) / (count + 1));
  session.totalCorrect += isCorrect ? 1 : 0;
  session.totalIncorrect += isCorrect ? 0 : 1;
  session.actualQuestionCount = count + 1;
  session.accuracy = Math.floor((session.totalCorrect * 100) / session.actualQuestionCount);
  if (finished) session.endedAt = now;

  const next = applyAttempt(toItemStats(data.stats[question.id]), { outcome, hinted, responseTimeMs: elapsedMs }, question.skill, new Date(now));
  const stat: GuestStat = {
    ...next,
    dueAt: next.dueAt === null ? null : next.dueAt.getTime(),
    lastAttemptedAt: next.lastAttemptedAt === null ? null : next.lastAttemptedAt.getTime(),
    questionId: question.id,
    skill: question.skill,
    exerciseType: question.exerciseType,
    concept: question.concept,
    difficulty: question.difficulty,
    prompt: question.prompt,
  };
  data.stats[question.id] = stat;

  saveGuestData(data);
  return json({
    isCorrect,
    outcome,
    correctAnswer: question.answerText,
    explanation: question.explanation ?? null,
    finished,
  });
}

function endSession(data: GuestData, session: GuestSession): Response {
  if (session.endedAt === null) {
    const now = Date.now();
    // Ending a paused session closes the open pause, so the elapsed-time figure excludes it.
    if (session.pausedAt !== null) session.pausedMs += Math.max(0, now - session.pausedAt);
    session.pausedAt = null;
    session.endedAt = now;
    saveGuestData(data);
  }
  return json({ ended: true });
}

function pauseSession(data: GuestData, session: GuestSession): Response {
  if (session.endedAt !== null || isTimedOut(timing(session))) return error("Session already completed", 409);
  if (session.pausedAt === null) {
    session.pausedAt = Date.now();
    saveGuestData(data);
  }
  return json({ paused: true });
}

function resumeSession(data: GuestData, session: GuestSession): Response {
  if (session.pausedAt !== null) {
    session.pausedMs += Math.max(0, Date.now() - session.pausedAt);
    session.pausedAt = null;
    saveGuestData(data);
  }
  return json({
    paused: false,
    pausedMs: session.pausedMs,
    startedAt: new Date(session.startedAt).toISOString(),
    durationSeconds: session.durationSeconds,
    serverNow: Date.now(),
  });
}
