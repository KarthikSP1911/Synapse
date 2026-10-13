import { MASTERED_MAX_WEAKNESS, MASTERED_MIN_ATTEMPTS, WEAK_MIN_WEAKNESS } from "@/features/progress/lib/progress-shared";
import type { ExerciseBreakdown, ItemRow, SkillFilter, SkillSummary } from "@/features/progress/server/progress-queries";
import { SKILLS, type Skill } from "@/features/skills/lib/types";
import type { GuestData, GuestSession, GuestStat } from "@/lib/offline/guest/storage";

/**
 * Browser-side twins of the read queries in `progress-queries.ts`, computed from a guest's
 * localStorage data. They return the same row shapes, so the same display code can render either.
 * Only the figures the guest Progress page shows are implemented.
 */

const practised = (data: GuestData, filter: SkillFilter = "all"): GuestStat[] =>
  Object.values(data.stats).filter((s) => s.totalAttempts > 0 && (filter === "all" || s.skill === filter));

export function guestSkillSummaries(data: GuestData, now = Date.now()): Record<Skill, SkillSummary> {
  const summaries = {} as Record<Skill, SkillSummary>;
  for (const skill of SKILLS) {
    const rows = practised(data, skill);
    const attempts = rows.reduce((sum, r) => sum + r.totalAttempts, 0);
    const correct = rows.reduce((sum, r) => sum + r.correctAttempts, 0);
    const timeWeighted = rows.reduce((sum, r) => sum + r.averageResponseTimeMs * r.totalAttempts, 0);
    summaries[skill] = {
      skill,
      attempts,
      correct,
      accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : 0,
      averageResponseTimeMs: attempts > 0 ? Math.round(timeWeighted / attempts) : 0,
      due: rows.filter((r) => r.dueAt === null || r.dueAt <= now).length,
      mastered: rows.filter((r) => r.totalAttempts >= MASTERED_MIN_ATTEMPTS && r.weaknessScore <= MASTERED_MAX_WEAKNESS).length,
      weak: rows.filter((r) => r.weaknessScore > WEAK_MIN_WEAKNESS).length,
    };
  }
  return summaries;
}

export function guestExerciseBreakdown(data: GuestData, filter: SkillFilter): ExerciseBreakdown[] {
  const groups = new Map<string, GuestStat[]>();
  for (const row of practised(data, filter)) {
    const key = `${row.skill}:${row.exerciseType}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, rows]) => {
      const attempts = rows.reduce((sum, r) => sum + r.totalAttempts, 0);
      const correct = rows.reduce((sum, r) => sum + r.correctAttempts, 0);
      const timeWeighted = rows.reduce((sum, r) => sum + r.averageResponseTimeMs * r.totalAttempts, 0);
      return {
        skill: rows[0].skill,
        exerciseType: rows[0].exerciseType,
        attempts,
        accuracy: Math.round((correct / attempts) * 100),
        averageResponseTimeMs: Math.round(timeWeighted / attempts),
        items: rows.length,
        weak: rows.filter((r) => r.weaknessScore > WEAK_MIN_WEAKNESS).length,
      };
    });
}

const toItemRow = (s: GuestStat): ItemRow => ({
  questionId: s.questionId,
  skill: s.skill,
  exerciseType: s.exerciseType,
  prompt: s.prompt,
  attempts: s.totalAttempts,
  accuracy: s.accuracy,
  averageResponseTimeMs: s.averageResponseTimeMs,
  weaknessScore: s.weaknessScore,
  box: s.box,
});

export function guestWeakItems(data: GuestData, filter: SkillFilter, limit = 10): ItemRow[] {
  return practised(data, filter)
    .sort((a, b) => b.weaknessScore - a.weaknessScore || b.totalAttempts - a.totalAttempts)
    .slice(0, limit)
    .map(toItemRow);
}

export function guestMasteredItems(data: GuestData, filter: SkillFilter, limit = 5): ItemRow[] {
  return practised(data, filter)
    .filter((s) => s.totalAttempts >= MASTERED_MIN_ATTEMPTS)
    .sort((a, b) => a.weaknessScore - b.weaknessScore || b.totalAttempts - a.totalAttempts)
    .slice(0, limit)
    .map(toItemRow);
}

/** Sessions with at least one answer, newest first. */
export function guestRecentSessions(data: GuestData, filter: SkillFilter, limit: number): GuestSession[] {
  return data.sessions
    .filter((s) => s.actualQuestionCount > 0 && (filter === "all" || s.skill === filter))
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}
