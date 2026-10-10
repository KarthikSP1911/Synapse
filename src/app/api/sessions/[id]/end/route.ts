import { NextResponse } from "next/server";
import { db } from "@/db";
import { practiceSessions } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { parseId } from "@/lib/validation";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = parseId((await params).id);
  if (sessionId === null) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  try {
    const [session] = await db.select({ id: practiceSessions.id }).from(practiceSessions).where(eq(practiceSessions.id, sessionId));
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await db
      .update(practiceSessions)
      .set({ endedAt: new Date() })
      .where(and(eq(practiceSessions.id, sessionId), isNull(practiceSessions.endedAt)));

    return NextResponse.json({ ended: true });
  } catch (error) {
    console.error("Failed to end session:", error);
    return NextResponse.json({ error: "Failed to end session" }, { status: 500 });
  }
}
