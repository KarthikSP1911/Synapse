import { NextResponse } from "next/server";
import { db } from "@/db";
import { practiceSessions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getNextQuestion } from "@/lib/question-engine";
import { toPublicQuestion } from "@/lib/skills/build";
import { isOperand, isTimedOut, parseId, sessionDeadline } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const sessionId = parseId((await params).id);
  if (sessionId === null) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  try {
    const [session] = await db.select().from(practiceSessions).where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, user.id)));

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const isComplete =
      session.endedAt !== null ||
      isTimedOut(session) ||
      (session.targetQuestionCount !== null && session.actualQuestionCount >= session.targetQuestionCount);

    if (isComplete) {
      if (!session.endedAt) {
        // A timed session ended when its clock ran out, not when this request happened to arrive.
        const endedAt = sessionDeadline(session) ?? new Date();
        await db.update(practiceSessions).set({ endedAt }).where(eq(practiceSessions.id, sessionId));
      }
      return NextResponse.json({ finished: true });
    }

    // The question on screen is excluded so the next one never repeats it. Older clients sent its operands.
    const searchParams = new URL(request.url).searchParams;
    const left = Number(searchParams.get("left"));
    const right = Number(searchParams.get("right"));
    const excludeId = searchParams.get("exclude") ?? (isOperand(left) && isOperand(right) ? `multiplication:${left}:${right}` : undefined);

    const question = await getNextQuestion(session, excludeId);
    return NextResponse.json({
      question: toPublicQuestion(question),
      // Kept for older multiplication clients.
      ...(question.skill === "multiplication" ? { left: question.left, right: question.right } : {}),
      skill: session.skill,
      mode: session.mode,
      startedAt: session.startedAt.toISOString(),
      // Lets the client correct for a clock that differs from the server's when counting down.
      serverNow: Date.now(),
      durationSeconds: session.durationSeconds,
      pausedMs: session.pausedMs,
      paused: session.pausedAt !== null,
      questionTimeLimitSeconds: session.questionTimeLimitSeconds,
      targetQuestionCount: session.targetQuestionCount,
      answeredCount: session.actualQuestionCount,
    });
  } catch (error) {
    console.error("Failed to get next question:", error);
    return NextResponse.json({ error: "Failed to get next question" }, { status: 500 });
  }
}
