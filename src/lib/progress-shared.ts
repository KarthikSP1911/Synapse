import type { SkillFilter, SkillSummary } from "@/lib/progress-queries";
import type { Skill } from "@/lib/skills/types";

/**
 * Pieces of the progress code that run in the browser as well as on the server (the guest pages), so
 * they must not import the database.
 */

/** Thresholds shared by the database queries and the browser-side guest figures, so both mean the same thing. */
export const MASTERED_MAX_WEAKNESS = 30;
export const MASTERED_MIN_ATTEMPTS = 5;
export const WEAK_MIN_WEAKNESS = 50;

/** Combines per-skill summaries into the figures for a filter. */
export function overviewOf(summaries: Record<Skill, SkillSummary>, filter: SkillFilter) {
  const picked = filter === "all" ? Object.values(summaries) : [summaries[filter]];
  const attempts = picked.reduce((sum, s) => sum + s.attempts, 0);
  const correct = picked.reduce((sum, s) => sum + s.correct, 0);
  const timeWeighted = picked.reduce((sum, s) => sum + s.averageResponseTimeMs * s.attempts, 0);
  return {
    attempts,
    correct,
    accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : 0,
    averageResponseTimeMs: attempts > 0 ? Math.round(timeWeighted / attempts) : 0,
    due: picked.reduce((sum, s) => sum + s.due, 0),
    weak: picked.reduce((sum, s) => sum + s.weak, 0),
    mastered: picked.reduce((sum, s) => sum + s.mastered, 0),
  };
}
