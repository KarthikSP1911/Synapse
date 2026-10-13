import type { Focus, PoolItem } from "@/features/skills/lib/types";
import { isDue } from "@/features/skills/lib/practice/spaced-repetition";

/** Items scoring above this count as weak. */
export const WEAK_SCORE_THRESHOLD = 50;
/** Chance of drawing an item that is due for spaced-repetition review, when one exists. */
export const DUE_PICK_PROBABILITY = 0.6;
/** Unseen questions inherit this share of their concept's weakness score. */
const CONCEPT_WEIGHT = 0.5;
/** A concept needs this many attempts before it can lift its unseen variations. */
export const MIN_CONCEPT_ATTEMPTS = 3;

export interface StatLite {
  weaknessScore: number;
  totalAttempts: number;
  dueAt: Date | null;
}

interface SelectionInput {
  pool: readonly PoolItem[];
  /** Performance history keyed by question id (any skill; only pool ids are consulted). */
  stats: ReadonlyMap<string, StatLite>;
  /** Average weakness per concept, so an unseen variation of a weak concept can be favoured. */
  conceptWeakness?: ReadonlyMap<string, number>;
  /** The session's latest questions, which must not repeat while alternatives exist. */
  recentIds: readonly string[];
  /** Every question already asked this session; unseen ones are preferred for the plain random draw. */
  seenIds?: ReadonlySet<string>;
  /** The question currently on screen. */
  excludeId?: string;
  /** Percentage (0-100) of draws taken from weak items. */
  weakFocusPercent: number;
  focus?: Focus;
  now?: Date;
  rng?: () => number;
}

function pickRandom<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

/**
 * Picks the next question for a fixed-pool session.
 *
 *  1. "weak" / "due" focus draws only from weak or due items first.
 *  2. Otherwise, with `weakFocusPercent` chance the item is drawn from the weak ones, weighted by
 *     weakness; failing that, with a 60% chance from items due for review; failing that, a uniform
 *     draw that favours unseen questions and balances the enabled exercise types.
 *  3. Recently asked items and the one on screen are avoided unless nothing else is left, and any
 *     step with no eligible item falls through to the next, so the pool can never run dry.
 */
export function selectNext(input: SelectionInput): PoolItem {
  const { pool, stats, conceptWeakness, weakFocusPercent, focus = "adaptive" } = input;
  const rng = input.rng ?? Math.random;
  const now = input.now ?? new Date();
  if (pool.length === 0) throw new RangeError("Cannot select from an empty pool");

  const avoid = new Set(input.recentIds);
  if (input.excludeId) avoid.add(input.excludeId);
  const seen = input.seenIds ?? new Set<string>();

  const weak: Array<{ item: PoolItem; weight: number }> = [];
  const due: PoolItem[] = [];
  for (const item of pool) {
    const stat = stats.get(item.id);
    if (stat && stat.totalAttempts > 0) {
      if (stat.weaknessScore > WEAK_SCORE_THRESHOLD) weak.push({ item, weight: stat.weaknessScore });
      if (isDue(stat.dueAt, now)) due.push(item);
    } else {
      const inherited = (conceptWeakness?.get(item.concept) ?? 0) * CONCEPT_WEIGHT;
      if (inherited > WEAK_SCORE_THRESHOLD * CONCEPT_WEIGHT) weak.push({ item, weight: inherited });
    }
  }

  const pickWeak = (): PoolItem | null => {
    const candidates = weak.filter((w) => !avoid.has(w.item.id));
    if (candidates.length === 0) return null;
    let roll = rng() * candidates.reduce((sum, w) => sum + w.weight, 0);
    for (const w of candidates) {
      roll -= w.weight;
      if (roll <= 0) return w.item;
    }
    return candidates[0].item;
  };
  const pickDue = (): PoolItem | null => {
    const candidates = due.filter((d) => !avoid.has(d.id));
    return candidates.length > 0 ? pickRandom(candidates, rng) : null;
  };
  const pickUniform = (): PoolItem => {
    const fresh = pool.filter((p) => !avoid.has(p.id));
    const candidates = fresh.length > 0 ? fresh : pool;
    const unseen = candidates.filter((p) => !seen.has(p.id));
    const eligible = unseen.length > 0 ? unseen : candidates;
    // Choose the exercise type first so a type with a huge pool does not drown out the others.
    const types = [...new Set(eligible.map((p) => p.exerciseType))];
    const type = pickRandom(types, rng);
    return pickRandom(
      eligible.filter((p) => p.exerciseType === type),
      rng
    );
  };

  if (focus === "weak") {
    const picked = pickWeak();
    if (picked) return picked;
  } else if (focus === "due") {
    const picked = pickDue();
    if (picked) return picked;
  }

  if (weak.length > 0 && rng() * 100 < weakFocusPercent) {
    const picked = pickWeak();
    if (picked) return picked;
  }
  if (due.length > 0 && rng() < DUE_PICK_PROBABILITY) {
    const picked = pickDue();
    if (picked) return picked;
  }
  return pickUniform();
}

/**
 * Review sessions ask each listed question once in random order, then fall back to repeats.
 * `askedIds` is every question already asked in the session.
 */
export function selectReview(
  questionIds: readonly string[],
  askedIds: ReadonlySet<string>,
  excludeId?: string,
  rng: () => number = Math.random
): string {
  if (questionIds.length === 0) throw new RangeError("Cannot select from an empty review list");
  const unasked = questionIds.filter((id) => !askedIds.has(id));
  const pool = unasked.length > 0 ? unasked : questionIds;
  const fresh = pool.filter((id) => id !== excludeId);
  return pickRandom(fresh.length > 0 ? fresh : pool, rng);
}
