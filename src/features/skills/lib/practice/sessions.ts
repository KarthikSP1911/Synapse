import type { Focus, PracticeConfig, SessionMode, Skill } from "@/features/skills/lib/types";
import { FOCUSES, SKILLS, isSkill } from "@/features/skills/lib/types";
import { buildPool, parseConfig, poolHas } from "@/features/skills/lib/pools";
import {
  ALLOWED_DURATIONS,
  ALLOWED_QUESTION_COUNTS,
  ALLOWED_QUESTION_TIME_LIMITS,
  DEFAULT_RECENT_WINDOW,
  DEFAULT_WEAK_FOCUS_PERCENT,
  MAX_RECENT_WINDOW,
  MAX_WEAK_FOCUS_PERCENT,
  isIntInRange,
  isOperandList,
  parseId,
} from "@/lib/validation";

/** The parts of a stored session that decide which questions it may ask. */
export interface SessionShape {
  skill: string;
  mode: string;
  config: PracticeConfig | null;
  selectedLeftNumbers: number[];
  selectedRightNumbers: number[];
  questionList: string[] | null;
  /** Only multiplication reviews created before multi-skill support carry this; guest sessions never do. */
  pairList?: { left: number; right: number }[] | null;
}

export const MAX_REVIEW_QUESTIONS = 50;
export const MAX_REVIEW_DAYS = 30;

/** What a session may ask. Sessions from before multi-skill support carry no config: they are multiplication. */
export function sessionConfig(session: SessionShape): PracticeConfig | null {
  if (session.config) return session.config;
  if (session.mode === "review") return null;
  return {
    skill: "multiplication",
    exerciseTypes: ["multiply"],
    left: session.selectedLeftNumbers,
    right: session.selectedRightNumbers,
  };
}

/** The questions of a review session (older multiplication reviews stored pairs instead of ids). */
export function reviewQuestionIds(session: SessionShape): string[] {
  if (session.questionList?.length) return session.questionList;
  return (session.pairList ?? []).map((p) => `multiplication:${p.left}:${p.right}`);
}

/** Only questions a session can ask are accepted, so stray requests cannot skew the statistics. */
export function isQuestionInSession(session: SessionShape, questionId: string): boolean {
  if (session.mode === "review") return reviewQuestionIds(session).includes(questionId);
  const config = sessionConfig(session);
  return config !== null && poolHas(config, questionId);
}

export { isSkill };

// ---------------------------------------------------------------------------
// Session creation requests
// ---------------------------------------------------------------------------

interface NewPracticeSession {
  skill: Skill;
  mode: Exclude<SessionMode, "review">;
  focus: Focus;
  config: PracticeConfig;
  targetQuestionCount: number | null;
  durationSeconds: number | null;
  questionTimeLimitSeconds: number | null;
  weakFocusPercent: number;
  recentWindow: number;
  selectedLeftNumbers: number[];
  selectedRightNumbers: number[];
}

export interface ReviewRequest {
  /** Review the mistakes of one session... */
  sessionId?: number;
  /** ...or of the last N days; the skill is then required (multiplication when omitted, as before). */
  sinceDays?: number;
  skill?: Skill;
  exerciseType?: string;
}

type SessionRequest =
  | { ok: true; kind: "practice"; session: NewPracticeSession }
  | { ok: true; kind: "review"; review: ReviewRequest; weakFocusPercent: number; recentWindow: number; questionTimeLimitSeconds: number | null }
  | { ok: false; error: string };

const fail = (error: string): SessionRequest => ({ ok: false, error });

/** Validates the body of POST /api/sessions. Nothing in it is trusted. */
export function parseSessionRequest(body: Record<string, unknown>): SessionRequest {
  const {
    mode,
    skill = "multiplication",
    focus = "adaptive",
    config,
    targetQuestionCount,
    durationSeconds,
    questionTimeLimitSeconds = 0,
    selectedLeftNumbers,
    selectedRightNumbers,
    reviewSessionId,
    reviewRecentDays,
    exerciseType,
    weakFocusPercent = DEFAULT_WEAK_FOCUS_PERCENT,
    recentWindow = DEFAULT_RECENT_WINDOW,
  } = body;

  if (mode !== "fixed" && mode !== "endless" && mode !== "timed" && mode !== "review") {
    return fail("mode must be 'fixed', 'endless', 'timed' or 'review'");
  }
  if (!isSkill(skill)) return fail(`skill must be one of ${SKILLS.join(", ")}`);
  if (!FOCUSES.includes(focus as Focus)) return fail(`focus must be one of ${FOCUSES.join(", ")}`);
  if (mode === "timed" && !ALLOWED_DURATIONS.includes(durationSeconds as (typeof ALLOWED_DURATIONS)[number])) {
    return fail(`durationSeconds must be one of ${ALLOWED_DURATIONS.join(", ")}`);
  }
  if (!isIntInRange(weakFocusPercent, 0, MAX_WEAK_FOCUS_PERCENT) || !isIntInRange(recentWindow, 0, MAX_RECENT_WINDOW)) {
    return fail("Invalid settings values");
  }
  if (!ALLOWED_QUESTION_TIME_LIMITS.includes(questionTimeLimitSeconds as (typeof ALLOWED_QUESTION_TIME_LIMITS)[number])) {
    return fail(`questionTimeLimitSeconds must be one of ${ALLOWED_QUESTION_TIME_LIMITS.join(", ")}`);
  }
  if (mode === "fixed" && !ALLOWED_QUESTION_COUNTS.includes(targetQuestionCount as (typeof ALLOWED_QUESTION_COUNTS)[number])) {
    return fail(`targetQuestionCount must be one of ${ALLOWED_QUESTION_COUNTS.join(", ")}`);
  }
  const timeLimit = (questionTimeLimitSeconds as number) || null;

  if (mode === "review") {
    // Exactly one source: the mistakes of one session, or of the last N days.
    const hasSession = reviewSessionId !== undefined;
    const hasDays = reviewRecentDays !== undefined;
    const sessionId = hasSession ? parseId(String(reviewSessionId)) : null;
    if (hasSession === hasDays || (hasSession && sessionId === null) || (hasDays && !isIntInRange(reviewRecentDays, 1, MAX_REVIEW_DAYS))) {
      return fail(`Review needs either reviewSessionId or reviewRecentDays (1-${MAX_REVIEW_DAYS})`);
    }
    if (exerciseType !== undefined && typeof exerciseType !== "string") return fail("exerciseType must be a string");
    return {
      ok: true,
      kind: "review",
      review: {
        ...(hasSession ? { sessionId: sessionId as number } : { sinceDays: reviewRecentDays as number }),
        ...(body.skill !== undefined ? { skill } : {}),
        ...(exerciseType ? { exerciseType } : {}),
      },
      weakFocusPercent,
      recentWindow,
      questionTimeLimitSeconds: timeLimit,
    };
  }

  // Older clients send the multiplication operands at the top level instead of a config.
  const rawConfig =
    config ??
    (skill === "multiplication" ? { skill, left: selectedLeftNumbers, right: selectedRightNumbers } : undefined);
  if (skill === "multiplication" && config === undefined && (!isOperandList(selectedLeftNumbers) || !isOperandList(selectedRightNumbers))) {
    return fail("Selected numbers must be integers between 1 and 20");
  }
  const parsed = parseConfig(rawConfig);
  if (!parsed.ok) return fail(parsed.error);
  if (parsed.config.skill !== skill) return fail("config.skill must match skill");
  if (buildPool(parsed.config).length === 0) {
    return fail("No questions match these options. Try a wider number range or a different difficulty.");
  }

  return {
    ok: true,
    kind: "practice",
    session: {
      skill,
      mode,
      focus: focus as Focus,
      config: parsed.config,
      targetQuestionCount: mode === "fixed" ? (targetQuestionCount as number) : null,
      durationSeconds: mode === "timed" ? (durationSeconds as number) : null,
      questionTimeLimitSeconds: timeLimit,
      weakFocusPercent,
      recentWindow,
      selectedLeftNumbers: parsed.config.skill === "multiplication" ? parsed.config.left : [],
      selectedRightNumbers: parsed.config.skill === "multiplication" ? parsed.config.right : [],
    },
  };
}
