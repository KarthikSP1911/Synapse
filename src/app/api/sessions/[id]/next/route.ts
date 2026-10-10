import { NextResponse } from "next/server";
import { db } from "@/db";
import { practiceSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getNextQuestion } from "@/lib/question-engine";
import { isOperand, isTimedOut, parseId } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = parseId((await params).id);
  if (sessionId === null) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  try {
    const [session] = await db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId));

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const isComplete =
      isTimedOut(session) ||
      (session.targetQuestionCount !== null && session.actualQuestionCount >= session.targetQuestionCount);

    if (isComplete) {
      if (!session.endedAt) {
        // A timed session ended when its clock ran out, not when this request happened to arrive.
        const endedAt =
          isTimedOut(session) && session.durationSeconds !== null
            ? new Date(session.startedAt.getTime() + session.durationSeconds * 1000)
            : new Date();
        await db.update(practiceSessions).set({ endedAt }).where(eq(practiceSessions.id, sessionId));
      }
      return NextResponse.json({ finished: true });
    }

    const searchParams = new URL(request.url).searchParams;
    const left = Number(searchParams.get("left"));
    const right = Number(searchParams.get("right"));
    const exclude = isOperand(left) && isOperand(right) ? { left, right } : undefined;

    const question = await getNextQuestion(
      sessionId,
      session.selectedLeftNumbers,
      session.selectedRightNumbers,
      session.pairList,
      { weakFocusPercent: session.weakFocusPercent, recentWindow: session.recentWindow },
      exclude
    );
    return NextResponse.json({
      ...question,
      startedAt: session.startedAt.toISOString(),
      // Lets the client correct for a clock that differs from the server's when counting down.
      serverNow: Date.now(),
      durationSeconds: session.durationSeconds,
      targetQuestionCount: session.targetQuestionCount,
      answeredCount: session.actualQuestionCount,
    });
  } catch (error) {
    console.error("Failed to get next question:", error);
    return NextResponse.json({ error: "Failed to get next question" }, { status: 500 });
  }
}
