import { NextResponse } from "next/server";
import { serverFailure } from "@/lib/http";
import { db } from "@/db";
import { practiceSessions } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getCurrentUser, unauthorized } from "@/features/auth/server/auth";
import { isTimedOut, parseId } from "@/lib/validation";

/** Stops the session clock. Pausing an already paused session is a no-op. */
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
    if (session.endedAt || isTimedOut(session)) {
      return NextResponse.json({ error: "Session already completed" }, { status: 409 });
    }

    // Conditional update: a second pause request (or a race with resume) cannot overwrite the first.
    await db
      .update(practiceSessions)
      .set({ pausedAt: new Date() })
      .where(and(eq(practiceSessions.id, sessionId), isNull(practiceSessions.pausedAt), isNull(practiceSessions.endedAt)));

    return NextResponse.json({ paused: true });
  } catch (error) {
    return serverFailure("Failed to pause session", error, { route: "/api/sessions/[id]/pause", method: "POST" });
  }
}
