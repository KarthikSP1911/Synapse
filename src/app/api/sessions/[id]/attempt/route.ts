import { NextResponse } from "next/server";
import { db } from "@/db";
import { practiceSessions, questionAttempts, pairStatistics, tableStatistics } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { dueDateForBox, nextBox } from "@/lib/spaced-repetition";
import { MAX_RESPONSE_TIME_MS, TIMED_GRACE_MS, isOperand, isTimedOut, parseId, readJson } from "@/lib/validation";

const SLOW_RESPONSE_MS = 5000;

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

async function recordPair(left: number, right: number, isCorrect: boolean, responseTimeMs: number) {
  const [pair] = await db
    .select()
    .from(pairStatistics)
    .where(and(eq(pairStatistics.leftNumber, left), eq(pairStatistics.rightNumber, right)))
    .limit(1);

  if (!pair) {
    const box = nextBox(1, isCorrect);
    await db.insert(pairStatistics).values({
      leftNumber: left,
      rightNumber: right,
      totalAttempts: 1,
      correctAttempts: isCorrect ? 1 : 0,
      incorrectAttempts: isCorrect ? 0 : 1,
      accuracy: isCorrect ? 100 : 0,
      currentCorrectStreak: isCorrect ? 1 : 0,
      bestCorrectStreak: isCorrect ? 1 : 0,
      currentIncorrectStreak: isCorrect ? 0 : 1,
      averageResponseTimeMs: responseTimeMs,
      fastestResponseTimeMs: responseTimeMs,
      slowestResponseTimeMs: responseTimeMs,
      weaknessScore: isCorrect ? 20 : 80,
      box,
      dueAt: dueDateForBox(box),
      lastAttemptedAt: new Date(),
    });
    return;
  }

  const box = nextBox(pair.box, isCorrect);
  const total = pair.totalAttempts + 1;
  const correct = pair.correctAttempts + (isCorrect ? 1 : 0);
  const accuracy = Math.round((correct / total) * 100);
  const correctStreak = isCorrect ? pair.currentCorrectStreak + 1 : 0;
  const incorrectStreak = isCorrect ? 0 : pair.currentIncorrectStreak + 1;
  const avgTime = Math.round((pair.averageResponseTimeMs * pair.totalAttempts + responseTimeMs) / total);

  // Weakness score (0-100): error rate, penalised for slowness and error streaks.
  let weakness = 100 - accuracy;
  if (avgTime > SLOW_RESPONSE_MS) weakness += 10;
  if (incorrectStreak > 1) weakness += 10 * incorrectStreak;
  if (correctStreak > 3) weakness -= 20;

  await db
    .update(pairStatistics)
    .set({
      totalAttempts: total,
      correctAttempts: correct,
      incorrectAttempts: pair.incorrectAttempts + (isCorrect ? 0 : 1),
      accuracy,
      currentCorrectStreak: correctStreak,
      bestCorrectStreak: Math.max(pair.bestCorrectStreak, correctStreak),
      currentIncorrectStreak: incorrectStreak,
      averageResponseTimeMs: avgTime,
      fastestResponseTimeMs: Math.min(pair.fastestResponseTimeMs ?? responseTimeMs, responseTimeMs),
      slowestResponseTimeMs: Math.max(pair.slowestResponseTimeMs ?? responseTimeMs, responseTimeMs),
      weaknessScore: clampScore(weakness),
      box,
      dueAt: dueDateForBox(box),
      lastAttemptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(pairStatistics.leftNumber, left), eq(pairStatistics.rightNumber, right)));
}

async function recordTable(num: number, isCorrect: boolean, responseTimeMs: number) {
  const [table] = await db.select().from(tableStatistics).where(eq(tableStatistics.number, num)).limit(1);

  if (!table) {
    await db.insert(tableStatistics).values({
      number: num,
      totalAttempts: 1,
      correctAttempts: isCorrect ? 1 : 0,
      incorrectAttempts: isCorrect ? 0 : 1,
      accuracy: isCorrect ? 100 : 0,
      averageResponseTimeMs: responseTimeMs,
      weaknessScore: isCorrect ? 20 : 80,
      lastAttemptedAt: new Date(),
    });
    return;
  }

  const total = table.totalAttempts + 1;
  const correct = table.correctAttempts + (isCorrect ? 1 : 0);
  const accuracy = Math.round((correct / total) * 100);
  const avgTime = Math.round((table.averageResponseTimeMs * table.totalAttempts + responseTimeMs) / total);

  await db
    .update(tableStatistics)
    .set({
      totalAttempts: total,
      correctAttempts: correct,
      incorrectAttempts: table.incorrectAttempts + (isCorrect ? 0 : 1),
      accuracy,
      averageResponseTimeMs: avgTime,
      weaknessScore: clampScore(100 - accuracy + (avgTime > SLOW_RESPONSE_MS ? 10 : 0)),
      lastAttemptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tableStatistics.number, num));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = parseId((await params).id);
  if (sessionId === null) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const body = await readJson(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { left, right, userAnswer, responseTimeMs } = body;
  if (
    !isOperand(left) ||
    !isOperand(right) ||
    !Number.isSafeInteger(userAnswer) ||
    !Number.isInteger(responseTimeMs) ||
    (responseTimeMs as number) < 0
  ) {
    return NextResponse.json({ error: "Invalid attempt payload" }, { status: 400 });
  }
  const answer = userAnswer as number;
  const elapsedMs = Math.min(responseTimeMs as number, MAX_RESPONSE_TIME_MS);

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

    const correctAnswer = left * right;
    const isCorrect = answer === correctAnswer;

    await db.insert(questionAttempts).values({
      sessionId,
      leftNumber: left,
      rightNumber: right,
      correctAnswer,
      userAnswer: answer,
      isCorrect,
      responseTimeMs: elapsedMs,
    });

    const finished = (target !== null && session.actualQuestionCount + 1 >= target) || isTimedOut(session);

    // Session counters are updated in SQL so concurrent requests don't lose increments.
    await db
      .update(practiceSessions)
      .set({
        actualQuestionCount: sql`${practiceSessions.actualQuestionCount} + 1`,
        totalCorrect: sql`${practiceSessions.totalCorrect} + ${isCorrect ? 1 : 0}`,
        totalIncorrect: sql`${practiceSessions.totalIncorrect} + ${isCorrect ? 0 : 1}`,
        accuracy: sql`(${practiceSessions.totalCorrect} + ${isCorrect ? 1 : 0}) * 100 / (${practiceSessions.actualQuestionCount} + 1)`,
        averageResponseTimeMs: sql`(${practiceSessions.averageResponseTimeMs} * ${practiceSessions.actualQuestionCount} + ${elapsedMs}) / (${practiceSessions.actualQuestionCount} + 1)`,
        ...(finished ? { endedAt: new Date() } : {}),
      })
      .where(eq(practiceSessions.id, sessionId));

    await recordPair(left, right, isCorrect, elapsedMs);
    await recordTable(left, isCorrect, elapsedMs);
    if (left !== right) await recordTable(right, isCorrect, elapsedMs);

    return NextResponse.json({ isCorrect, correctAnswer, finished });
  } catch (error) {
    console.error("Failed to process attempt:", error);
    return NextResponse.json({ error: "Failed to process attempt" }, { status: 500 });
  }
}
