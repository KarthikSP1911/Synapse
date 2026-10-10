import { db } from "@/db";
import { pairStatistics, questionAttempts } from "@/db/schema";
import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

export interface Question {
  left: number;
  right: number;
}

export interface EngineSettings {
  /** Percentage (0-100) of questions drawn from the weakest selected pairs. */
  weakFocusPercent: number;
  /** How many of the session's latest questions must not repeat. */
  recentWindow: number;
}

const WEAK_SCORE_THRESHOLD = 50;
/** Chance of drawing a pair that is due for spaced-repetition review, when one exists. */
const DUE_PICK_PROBABILITY = 0.6;

const key = (q: Question) => `${q.left}x${q.right}`;

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Picks the next question for a session.
 *
 * - Review sessions (`pairList` set) ask each listed pair once, in random order,
 *   then fall back to random repeats.
 * - Otherwise, with `weakFocusPercent` chance the question comes from the weakest
 *   selected pairs (weighted by weakness); failing that, with a 60% chance from
 *   pairs that are due for spaced-repetition review; failing that, uniformly from
 *   the selected numbers.
 *
 * Recently asked pairs and the optional `exclude` pair (the question currently on
 * screen) are avoided unless that would leave nothing to ask.
 */
export async function getNextQuestion(
  sessionId: number,
  leftNumbers: number[],
  rightNumbers: number[],
  pairList: Question[] | null,
  settings: EngineSettings,
  exclude?: Question
): Promise<Question> {
  const isReview = pairList !== null && pairList.length > 0;

  const [recent, weakRows, dueRows] = await Promise.all([
    // Review sessions need every pair asked so far; others only the recent window.
    isReview || settings.recentWindow > 0
      ? db
          .select({ left: questionAttempts.leftNumber, right: questionAttempts.rightNumber })
          .from(questionAttempts)
          .where(eq(questionAttempts.sessionId, sessionId))
          .orderBy(desc(questionAttempts.createdAt))
          .limit(isReview ? 500 : settings.recentWindow)
      : Promise.resolve([]),
    isReview
      ? Promise.resolve([])
      : db
          .select()
          .from(pairStatistics)
          .where(sql`${pairStatistics.weaknessScore} > ${WEAK_SCORE_THRESHOLD}`)
          .orderBy(desc(pairStatistics.weaknessScore))
          .limit(200),
    isReview
      ? Promise.resolve([])
      : db
          .select({ left: pairStatistics.leftNumber, right: pairStatistics.rightNumber })
          .from(pairStatistics)
          .where(
            and(
              gt(pairStatistics.totalAttempts, 0),
              or(isNull(pairStatistics.dueAt), lte(pairStatistics.dueAt, sql`NOW()`))
            )
          )
          .limit(400),
  ]);

  if (isReview) {
    const asked = new Set(recent.map(key));
    const unasked = pairList.filter((p) => !asked.has(key(p)));
    const pool = unasked.length > 0 ? unasked : pairList;
    const fresh = pool.filter((p) => !exclude || key(p) !== key(exclude));
    return pickRandom(fresh.length > 0 ? fresh : pool);
  }

  const avoid = new Set(recent.map(key));
  if (exclude) avoid.add(key(exclude));

  const allPairs: Question[] = leftNumbers.flatMap((left) => rightNumbers.map((right) => ({ left, right })));
  const withoutRecent = (pairs: Question[]) => {
    const fresh = pairs.filter((p) => !avoid.has(key(p)));
    return fresh.length > 0 ? fresh : pairs;
  };

  // Only pairs that fall inside the user's selection are eligible.
  const selected = new Set(allPairs.map(key));
  const weakPairs = weakRows
    .map((w) => ({ left: w.leftNumber, right: w.rightNumber, weight: w.weaknessScore }))
    .filter((w) => selected.has(key(w)));

  if (weakPairs.length > 0 && Math.random() * 100 < settings.weakFocusPercent) {
    const pool = weakPairs.filter((w) => !avoid.has(key(w)));
    if (pool.length > 0) {
      let roll = Math.random() * pool.reduce((sum, w) => sum + w.weight, 0);
      for (const w of pool) {
        roll -= w.weight;
        if (roll <= 0) return { left: w.left, right: w.right };
      }
      return { left: pool[0].left, right: pool[0].right };
    }
  }

  const duePairs = dueRows.filter((d) => selected.has(key(d)) && !avoid.has(key(d)));
  if (duePairs.length > 0 && Math.random() < DUE_PICK_PROBABILITY) {
    return pickRandom(duePairs);
  }

  return pickRandom(withoutRecent(allPairs));
}
