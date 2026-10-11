import { MIN_CONCEPT_ATTEMPTS, WEAK_SCORE_THRESHOLD, selectNext, selectReview, type StatLite } from "@/lib/selection";
import { reviewQuestionIds, sessionConfig } from "@/lib/sessions";
import { questionFromId } from "@/lib/skills/build";
import { buildPool } from "@/lib/skills/pools";
import type { Focus, Question } from "@/lib/skills/types";
import type { GuestSession, GuestStat } from "@/lib/guest/storage";

/**
 * Picks a guest session's next question: the browser-side twin of `getNextQuestion`, which reads the
 * same inputs (the session's history and the statistics for its skill) from memory instead of SQL.
 * The choice itself is made by the shared `selectNext` / `selectReview`.
 */
export function guestNextQuestion(session: GuestSession, stats: Record<string, GuestStat>, excludeId?: string): Question {
  // Most recent first, like the server's history query.
  const askedIds = session.attempts.map((a) => a.questionId).reverse();

  if (session.mode === "review") {
    return rebuild(selectReview(reviewQuestionIds(session), new Set(askedIds), excludeId));
  }

  const config = sessionConfig(session);
  if (!config) throw new Error(`Session ${session.id} has no practice configuration`);
  const pool = buildPool(config);

  // Narrowed to this skill and, where the configuration says so, its exercise types and difficulty,
  // so one skill's history can never distort another's.
  const scoped = Object.values(stats).filter(
    (s) =>
      s.totalAttempts > 0 &&
      s.skill === config.skill &&
      config.exerciseTypes.some((t) => t === s.exerciseType) &&
      (!("difficulty" in config) || s.difficulty === config.difficulty)
  );

  const lite = new Map<string, StatLite>();
  const concepts = new Map<string, { weakness: number; items: number; attempts: number }>();
  for (const s of scoped) {
    lite.set(s.questionId, { weaknessScore: s.weaknessScore, totalAttempts: s.totalAttempts, dueAt: s.dueAt === null ? null : new Date(s.dueAt) });
    const c = concepts.get(s.concept) ?? { weakness: 0, items: 0, attempts: 0 };
    c.weakness += s.weaknessScore;
    c.items += 1;
    c.attempts += s.totalAttempts;
    concepts.set(s.concept, c);
  }
  const conceptWeakness = new Map<string, number>();
  for (const [concept, c] of concepts) {
    const average = c.weakness / c.items;
    if (average > WEAK_SCORE_THRESHOLD && c.attempts >= MIN_CONCEPT_ATTEMPTS) conceptWeakness.set(concept, average);
  }

  const item = selectNext({
    pool,
    stats: lite,
    conceptWeakness,
    recentIds: session.recentWindow > 0 ? askedIds.slice(0, session.recentWindow) : [],
    seenIds: new Set(askedIds),
    excludeId,
    weakFocusPercent: session.weakFocusPercent,
    focus: session.focus as Focus,
  });
  return rebuild(item.id);
}

function rebuild(id: string): Question {
  const question = questionFromId(id);
  if (!question) throw new Error(`Stored question id is no longer valid: ${id}`);
  return question;
}
