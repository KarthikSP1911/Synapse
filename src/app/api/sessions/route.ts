import { NextResponse } from "next/server";
import { db } from "@/db";
import { practiceSessions } from "@/db/schema";
import { readJson } from "@/lib/validation";
import { getMistakeQuestionIds } from "@/features/skills/server/mistakes";
import { parseSessionRequest } from "@/features/skills/lib/practice/sessions";
import { and, eq } from "drizzle-orm";
import { getCurrentUser, unauthorized } from "@/features/auth/server/auth";
import { isSkill } from "@/features/skills/lib/practice/sessions";
import { EXERCISE_TYPES } from "@/features/skills/lib/types";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await readJson(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseSessionRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    if (parsed.kind === "review") {
      const { review } = parsed;
      let skill = review.skill ?? "multiplication";
      if (review.sessionId !== undefined) {
        // Reviewing one session's mistakes: the skill is the session's own.
        const [source] = await db
          .select({ skill: practiceSessions.skill })
          .from(practiceSessions)
          .where(and(eq(practiceSessions.id, review.sessionId), eq(practiceSessions.userId, user.id)));
        if (!source) return NextResponse.json({ error: "Session not found" }, { status: 404 });
        if (!isSkill(source.skill)) return NextResponse.json({ error: "Session has an unknown skill" }, { status: 400 });
        skill = source.skill;
      }
      if (review.exerciseType && !(EXERCISE_TYPES[skill] as readonly string[]).includes(review.exerciseType)) {
        return NextResponse.json({ error: `Unknown exercise type for ${skill}` }, { status: 400 });
      }

      const questionIds = await getMistakeQuestionIds({ ...review, skill, userId: user.id });
      if (questionIds.length === 0) {
        return NextResponse.json({ error: "No mistakes to review" }, { status: 400 });
      }

      const [session] = await db
        .insert(practiceSessions)
        .values({
          userId: user.id,
          skill,
          mode: "review",
          targetQuestionCount: questionIds.length,
          questionList: questionIds,
          questionTimeLimitSeconds: parsed.questionTimeLimitSeconds,
          weakFocusPercent: parsed.weakFocusPercent,
          recentWindow: parsed.recentWindow,
          selectedLeftNumbers: [],
          selectedRightNumbers: [],
        })
        .returning();
      return NextResponse.json(session, { status: 201 });
    }

    const [session] = await db.insert(practiceSessions).values({ ...parsed.session, userId: user.id }).returning();
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Failed to create session:", error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
