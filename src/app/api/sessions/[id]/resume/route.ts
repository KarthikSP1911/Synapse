import { NextResponse } from "next/server";
import { db } from "@/db";
import { practiceSessions } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { getCurrentUser, unauthorized } from "@/features/auth/server/auth";
import { parseId } from "@/lib/validation";

/**
 * Restarts the session clock. The time spent paused is added to `pausedMs`, which pushes a timed
 * session's deadline back by the same amount. Resuming a session that is not paused is a no-op.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    let pausedMs = session.pausedMs;
    if (session.pausedAt) {
      const added = Math.max(0, Date.now() - session.pausedAt.getTime());
      pausedMs += added;
      await db
        .update(practiceSessions)
        .set({ pausedAt: null, pausedMs })
        .where(and(eq(practiceSessions.id, sessionId), isNotNull(practiceSessions.pausedAt)));
    }

    return NextResponse.json({
      paused: false,
      pausedMs,
      startedAt: session.startedAt.toISOString(),
      durationSeconds: session.durationSeconds,
      serverNow: Date.now(),
    });
  } catch (error) {
    console.error("Failed to resume session:", error);
    return NextResponse.json({ error: "Failed to resume session" }, { status: 500 });
  }
}
