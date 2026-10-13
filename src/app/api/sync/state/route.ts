import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { questionStats } from "@/db/schema";
import { getCurrentUser, unauthorized } from "@/features/auth/server/auth";

export const dynamic = "force-dynamic";

/** Caps the snapshot so a huge history cannot make the first load heavy. The most recently practised come first. */
const MAX_STATS = 20000;

/**
 * The user's per-question statistics, so the device can pick adaptive questions and schedule reviews from
 * the same history the account has, even with no connection. Dates are epoch milliseconds.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  try {
    const rows = await db
      .select()
      .from(questionStats)
      .where(eq(questionStats.userId, user.id))
      .orderBy(desc(questionStats.lastAttemptedAt))
      .limit(MAX_STATS);
    const stats = rows.map((r) => ({
      questionId: r.questionId,
      skill: r.skill,
      exerciseType: r.exerciseType,
      concept: r.concept,
      difficulty: r.difficulty,
      prompt: r.prompt,
      totalAttempts: r.totalAttempts,
      correctAttempts: r.correctAttempts,
      incorrectAttempts: r.incorrectAttempts,
      hintedAttempts: r.hintedAttempts,
      accuracy: r.accuracy,
      averageResponseTimeMs: r.averageResponseTimeMs,
      fastestResponseTimeMs: r.fastestResponseTimeMs,
      slowestResponseTimeMs: r.slowestResponseTimeMs,
      currentCorrectStreak: r.currentCorrectStreak,
      currentIncorrectStreak: r.currentIncorrectStreak,
      bestCorrectStreak: r.bestCorrectStreak,
      weaknessScore: r.weaknessScore,
      box: r.box,
      dueAt: r.dueAt?.getTime() ?? null,
      lastAttemptedAt: r.lastAttemptedAt?.getTime() ?? null,
    }));
    return NextResponse.json({ userId: user.id, stats });
  } catch (error) {
    console.error("Failed to load sync state:", error);
    return NextResponse.json({ error: "Failed to load sync state" }, { status: 500 });
  }
}
