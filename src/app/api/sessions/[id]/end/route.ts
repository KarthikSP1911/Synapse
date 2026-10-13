import { NextResponse } from "next/server";
import { db } from "@/db";
import { practiceSessions } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getCurrentUser, unauthorized } from "@/features/auth/server/auth";
import { parseId } from "@/lib/validation";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const sessionId = parseId((await params).id);
  if (sessionId === null) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  try {
    const [session] = await db
      .select({ id: practiceSessions.id, pausedAt: practiceSessions.pausedAt, pausedMs: practiceSessions.pausedMs })
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, user.id)));
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Ending a paused session closes the open pause, so the elapsed-time figure excludes it.
    const now = new Date();
    const pausedMs = session.pausedAt ? session.pausedMs + Math.max(0, now.getTime() - session.pausedAt.getTime()) : session.pausedMs;
    await db
      .update(practiceSessions)
      .set({ endedAt: now, pausedAt: null, pausedMs })
      .where(and(eq(practiceSessions.id, sessionId), isNull(practiceSessions.endedAt)));

    return NextResponse.json({ ended: true });
  } catch (error) {
    console.error("Failed to end session:", error);
    return NextResponse.json({ error: "Failed to end session" }, { status: 500 });
  }
}
