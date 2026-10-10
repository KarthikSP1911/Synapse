import { NextResponse } from "next/server";
import { db } from "@/db";
import { practiceSessions } from "@/db/schema";
import {
  ALLOWED_DURATIONS,
  ALLOWED_QUESTION_COUNTS,
  DEFAULT_RECENT_WINDOW,
  DEFAULT_WEAK_FOCUS_PERCENT,
  MAX_RECENT_WINDOW,
  MAX_WEAK_FOCUS_PERCENT,
  isIntInRange,
  isOperandList,
  parseId,
  readJson,
} from "@/lib/validation";
import { MAX_REVIEW_DAYS, getMistakePairs } from "@/lib/mistakes";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    mode,
    targetQuestionCount,
    durationSeconds,
    selectedLeftNumbers,
    selectedRightNumbers,
    reviewSessionId,
    reviewRecentDays,
    weakFocusPercent = DEFAULT_WEAK_FOCUS_PERCENT,
    recentWindow = DEFAULT_RECENT_WINDOW,
  } = body;

  if (mode !== "fixed" && mode !== "endless" && mode !== "timed" && mode !== "review") {
    return NextResponse.json({ error: "mode must be 'fixed', 'endless', 'timed' or 'review'" }, { status: 400 });
  }
  if (mode === "timed" && !ALLOWED_DURATIONS.includes(durationSeconds as (typeof ALLOWED_DURATIONS)[number])) {
    return NextResponse.json(
      { error: `durationSeconds must be one of ${ALLOWED_DURATIONS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!isIntInRange(weakFocusPercent, 0, MAX_WEAK_FOCUS_PERCENT) || !isIntInRange(recentWindow, 0, MAX_RECENT_WINDOW)) {
    return NextResponse.json({ error: "Invalid settings values" }, { status: 400 });
  }
  if (
    mode === "fixed" &&
    !ALLOWED_QUESTION_COUNTS.includes(targetQuestionCount as (typeof ALLOWED_QUESTION_COUNTS)[number])
  ) {
    return NextResponse.json(
      { error: `targetQuestionCount must be one of ${ALLOWED_QUESTION_COUNTS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    if (mode === "review") {
      // Exactly one source: the mistakes of one session, or of the last N days.
      const hasSession = reviewSessionId !== undefined;
      const hasDays = reviewRecentDays !== undefined;
      const sessionId = hasSession ? parseId(String(reviewSessionId)) : null;
      if (hasSession === hasDays || (hasSession && sessionId === null) || (hasDays && !isIntInRange(reviewRecentDays, 1, MAX_REVIEW_DAYS))) {
        return NextResponse.json(
          { error: `Review needs either reviewSessionId or reviewRecentDays (1-${MAX_REVIEW_DAYS})` },
          { status: 400 }
        );
      }

      const pairs = await getMistakePairs(
        hasSession ? { sessionId: sessionId as number } : { sinceDays: reviewRecentDays as number }
      );
      if (pairs.length === 0) {
        return NextResponse.json({ error: "No mistakes to review" }, { status: 400 });
      }

      const [session] = await db
        .insert(practiceSessions)
        .values({
          mode,
          targetQuestionCount: pairs.length,
          pairList: pairs,
          weakFocusPercent,
          recentWindow,
          selectedLeftNumbers: [...new Set(pairs.map((p) => p.left))],
          selectedRightNumbers: [...new Set(pairs.map((p) => p.right))],
        })
        .returning();
      return NextResponse.json(session, { status: 201 });
    }

    if (!isOperandList(selectedLeftNumbers) || !isOperandList(selectedRightNumbers)) {
      return NextResponse.json({ error: "Selected numbers must be integers between 1 and 20" }, { status: 400 });
    }

    const [session] = await db
      .insert(practiceSessions)
      .values({
        mode,
        targetQuestionCount: mode === "fixed" ? (targetQuestionCount as number) : null,
        durationSeconds: mode === "timed" ? (durationSeconds as number) : null,
        weakFocusPercent,
        recentWindow,
        selectedLeftNumbers: [...new Set(selectedLeftNumbers)],
        selectedRightNumbers: [...new Set(selectedRightNumbers)],
      })
      .returning();

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Failed to create session:", error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
