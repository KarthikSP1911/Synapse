import { NextResponse } from "next/server";
import { db } from "@/db";
import { practiceSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recordAttempt } from "@/lib/attempts";
import { checkAnswer } from "@/lib/skills/answers";
import { questionFromId } from "@/lib/skills/build";
import type { Outcome } from "@/lib/skills/types";
import { isQuestionInSession } from "@/lib/sessions";
import {
  MAX_RESPONSE_TIME_MS,
  QUESTION_LIMIT_SLACK_MS,
  TIMED_GRACE_MS,
  isOperand,
  isTimedOut,
  parseId,
  readJson,
} from "@/lib/validation";

/**
 * Body: { questionId, userAnswer, responseTimeMs, hinted?, outcome? }
 *  - `outcome` is "answered" (default), "skipped" or "timed_out"; the latter two carry no answer.
 *  - Older multiplication clients may send { left, right, userAnswer } instead of questionId.
 * The server rebuilds the question from its id and decides correctness itself.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = parseId((await params).id);
  if (sessionId === null) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const body = await readJson(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { left, right, responseTimeMs, hinted = false, outcome: reported = "answered" } = body;
  const questionId = body.questionId ?? (isOperand(left) && isOperand(right) ? `multiplication:${left}:${right}` : undefined);
  const userAnswer = typeof body.userAnswer === "number" && Number.isSafeInteger(body.userAnswer) ? String(body.userAnswer) : body.userAnswer;

  if (
    typeof questionId !== "string" ||
    !Number.isInteger(responseTimeMs) ||
    (responseTimeMs as number) < 0 ||
    typeof hinted !== "boolean" ||
    (reported !== "answered" && reported !== "skipped" && reported !== "timed_out") ||
    (reported === "answered" && typeof userAnswer !== "string")
  ) {
    return NextResponse.json({ error: "Invalid attempt payload" }, { status: 400 });
  }
  const elapsedMs = Math.min(responseTimeMs as number, MAX_RESPONSE_TIME_MS);

  const question = questionFromId(questionId);
  if (!question) {
    return NextResponse.json({ error: "Unknown question" }, { status: 400 });
  }

  try {
    const [session] = await db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId));
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Fixed and review sessions have a target; endless and timed ones do not.
    const target = session.targetQuestionCount;
    if (target !== null && session.actualQuestionCount >= target) {
      return NextResponse.json({ error: "Session already completed" }, { status: 409 });
    }
    if (isTimedOut(session, TIMED_GRACE_MS)) {
      return NextResponse.json({ error: "Session already completed" }, { status: 409 });
    }
    if (session.pausedAt) {
      return NextResponse.json({ error: "Session is paused" }, { status: 409 });
    }

    if (!isQuestionInSession(session, question.id)) {
      return NextResponse.json({ error: "Question is not part of this session" }, { status: 400 });
    }

    let outcome: Outcome;
    if (reported === "answered") {
      const check = checkAnswer(question, userAnswer);
      if (check.status === "invalid") {
        return NextResponse.json({ error: check.reason }, { status: 400 });
      }
      outcome = check.status;
    } else if (reported === "skipped") {
      outcome = "skipped";
    } else {
      // A timeout is only believable when the session has a per-question limit and it really elapsed.
      const limitMs = (session.questionTimeLimitSeconds ?? 0) * 1000;
      if (limitMs === 0 || elapsedMs < limitMs - QUESTION_LIMIT_SLACK_MS) {
        return NextResponse.json({ error: "Question has not timed out" }, { status: 400 });
      }
      outcome = "timed_out";
    }

    const finished = (target !== null && session.actualQuestionCount + 1 >= target) || isTimedOut(session);

    await recordAttempt({
      sessionId,
      question,
      outcome,
      hinted,
      userAnswer: reported === "answered" ? (userAnswer as string) : null,
      responseTimeMs: elapsedMs,
      finished,
    });

    return NextResponse.json({
      isCorrect: outcome === "correct",
      outcome,
      correctAnswer: question.answerText,
      explanation: question.explanation ?? null,
      finished,
    });
  } catch (error) {
    console.error("Failed to process attempt:", error);
    return NextResponse.json({ error: "Failed to process attempt" }, { status: 500 });
  }
}
