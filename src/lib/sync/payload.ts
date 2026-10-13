import { CLIENT_ID, FUTURE_SLACK_MS, isEpoch, isObject } from "@/lib/records";
import { MAX_REVIEW_QUESTIONS, isQuestionInSession, parseSessionRequest, type SessionShape } from "@/lib/sessions";
import { checkAnswer } from "@/lib/skills/answers";
import { questionFromId } from "@/lib/skills/build";
import { OUTCOMES, type Focus, type Outcome, type PracticeConfig, type Question, type SessionMode, type Skill } from "@/lib/skills/types";
import {
  ALLOWED_QUESTION_TIME_LIMITS,
  MAX_RECENT_WINDOW,
  MAX_RESPONSE_TIME_MS,
  MAX_WEAK_FOCUS_PERCENT,
  isIntInRange,
} from "@/lib/validation";

/**
 * What a browser uploads to `POST /api/sync`: the practice sessions it ran on the device, with every
 * attempt it recorded. Nothing in it is trusted. In particular the reported outcome of an answered
 * question is ignored: correctness is decided again here from the raw answer, exactly as for a live
 * answer, so a doctored upload cannot claim answers the user never got right.
 */

export const MAX_SYNC_SESSIONS = 20;
export const MAX_SYNC_ATTEMPTS = 1000;
const MAX_PAUSED_MS = 24 * 60 * 60 * 1000;

export interface ValidAttempt {
  question: Question;
  outcome: Outcome;
  hinted: boolean;
  /** The raw answer; null when skipped or timed out. */
  userAnswer: string | null;
  responseTimeMs: number;
  /** When it was answered, as epoch ms. Also the key that makes re-uploads idempotent. */
  at: number;
}

/** The columns of a session that come from the upload, after validation. */
export interface SessionFields {
  skill: Skill;
  mode: SessionMode;
  focus: Focus;
  config: PracticeConfig | null;
  targetQuestionCount: number | null;
  durationSeconds: number | null;
  questionTimeLimitSeconds: number | null;
  weakFocusPercent: number;
  recentWindow: number;
  selectedLeftNumbers: number[];
  selectedRightNumbers: number[];
  questionList: string[] | null;
}

export interface ValidSession {
  clientId: string;
  fields: SessionFields;
  startedAt: number;
  endedAt: number | null;
  pausedMs: number;
  attempts: ValidAttempt[];
}

export type SessionResult = { ok: true; session: ValidSession } | { ok: false; clientId: string | null; reason: string };

/** The request body as a list of sessions, or an error for the whole request. */
export function parseSyncBody(body: unknown): { ok: true; sessions: unknown[] } | { ok: false; error: string } {
  if (!isObject(body) || !Array.isArray(body.sessions)) return { ok: false, error: "Expected { sessions: [...] }" };
  if (body.sessions.length > MAX_SYNC_SESSIONS) return { ok: false, error: `At most ${MAX_SYNC_SESSIONS} sessions per request` };
  return { ok: true, sessions: body.sessions };
}

export function validateSession(raw: unknown, now = Date.now()): SessionResult {
  if (!isObject(raw)) return { ok: false, clientId: null, reason: "Session must be an object" };
  const clientId = typeof raw.clientId === "string" && CLIENT_ID.test(raw.clientId) ? raw.clientId : null;
  if (clientId === null) return { ok: false, clientId: null, reason: "Invalid clientId" };
  const fail = (reason: string): SessionResult => ({ ok: false, clientId, reason });

  const { startedAt, endedAt, pausedMs = 0, attempts } = raw;
  if (!isEpoch(startedAt) || startedAt > now + FUTURE_SLACK_MS) return fail("Invalid startedAt");
  if (endedAt !== null && endedAt !== undefined && (!isEpoch(endedAt) || endedAt < startedAt)) return fail("Invalid endedAt");
  if (!isIntInRange(pausedMs, 0, MAX_PAUSED_MS)) return fail("Invalid pausedMs");
  if (!Array.isArray(attempts) || attempts.length > MAX_SYNC_ATTEMPTS) return fail("Invalid attempts");

  let fields: SessionFields;
  if (raw.mode === "review") {
    const list = raw.questionList;
    const skill = raw.skill;
    if (!Array.isArray(list) || list.length === 0 || list.length > MAX_REVIEW_QUESTIONS || !list.every((id) => typeof id === "string" && questionFromId(id))) {
      return fail("Invalid review question list");
    }
    const weakFocusPercent = raw.weakFocusPercent ?? 30;
    const recentWindow = raw.recentWindow ?? 5;
    const limit = raw.questionTimeLimitSeconds ?? 0;
    if (
      !isIntInRange(weakFocusPercent, 0, MAX_WEAK_FOCUS_PERCENT) ||
      !isIntInRange(recentWindow, 0, MAX_RECENT_WINDOW) ||
      !ALLOWED_QUESTION_TIME_LIMITS.includes(limit as (typeof ALLOWED_QUESTION_TIME_LIMITS)[number])
    ) {
      return fail("Invalid review settings");
    }
    const first = questionFromId(list[0] as string);
    if (!first || skill !== first.skill) return fail("Invalid review skill");
    fields = {
      skill: first.skill,
      mode: "review",
      focus: "adaptive",
      // A review has no pool configuration; the session carries its questions instead.
      config: null,
      targetQuestionCount: list.length,
      durationSeconds: null,
      questionTimeLimitSeconds: (limit as number) || null,
      weakFocusPercent,
      recentWindow,
      selectedLeftNumbers: [],
      selectedRightNumbers: [],
      questionList: list as string[],
    };
  } else {
    const parsed = parseSessionRequest({
      mode: raw.mode,
      skill: raw.skill,
      focus: raw.focus,
      config: raw.config,
      targetQuestionCount: raw.targetQuestionCount,
      durationSeconds: raw.durationSeconds,
      questionTimeLimitSeconds: raw.questionTimeLimitSeconds ?? 0,
      weakFocusPercent: raw.weakFocusPercent,
      recentWindow: raw.recentWindow,
    });
    if (!parsed.ok) return fail(parsed.error);
    if (parsed.kind !== "practice") return fail("Unexpected session kind");
    fields = { ...parsed.session, questionList: null };
  }

  const shape: SessionShape = { ...fields, questionList: fields.questionList };
  const valid: ValidAttempt[] = [];
  const seen = new Set<number>();
  const target = fields.targetQuestionCount;

  for (const a of attempts) {
    if (!isObject(a)) continue;
    const { questionId, userAnswerText, hinted, responseTimeMs, at, outcome: reported } = a;
    if (typeof questionId !== "string" || typeof hinted !== "boolean" || !isEpoch(at) || !Number.isInteger(responseTimeMs) || (responseTimeMs as number) < 0) continue;
    const question = questionFromId(questionId);
    if (!question || !isQuestionInSession(shape, question.id)) continue;
    // Two attempts with the same timestamp are one attempt re-sent; the timestamp is what makes uploads idempotent.
    const when = Math.min(at, now);
    if (seen.has(when)) continue;
    if (target !== null && valid.length >= target) break;

    const elapsed = Math.min(responseTimeMs as number, MAX_RESPONSE_TIME_MS);
    let outcome: Outcome;
    let answer: string | null = null;
    if (typeof userAnswerText === "string") {
      const check = checkAnswer(question, userAnswerText);
      if (check.status === "invalid") continue;
      outcome = check.status;
      answer = userAnswerText;
    } else if (reported === "skipped") {
      outcome = "skipped";
    } else if (reported === "timed_out") {
      const limitMs = (fields.questionTimeLimitSeconds ?? 0) * 1000;
      if (limitMs === 0) continue;
      outcome = "timed_out";
    } else {
      continue;
    }
    if (!OUTCOMES.includes(outcome)) continue;
    seen.add(when);
    valid.push({ question, outcome, hinted, userAnswer: answer, responseTimeMs: elapsed, at: when });
  }

  valid.sort((x, y) => x.at - y.at);
  return {
    ok: true,
    session: {
      clientId,
      fields,
      startedAt,
      endedAt: endedAt === null || endedAt === undefined ? null : Math.min(endedAt as number, now),
      pausedMs,
      attempts: valid,
    },
  };
}
