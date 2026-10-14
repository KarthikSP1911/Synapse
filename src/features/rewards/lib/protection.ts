import { addDays } from "@/features/progress/lib/activity";
import type { OwnedShield } from "@/features/rewards/lib/types";

/**
 * Which missed days a Streak Shield should protect. Pure: it takes the days that were really active, the days
 * already protected, the shields owned and today's date, and answers with the shield to use on each day. The same
 * function runs in the browser for a guest and on the server for a signed-in user (which knows every device's days).
 *
 * The rules:
 *  - A missed day is a calendar day before today with no activity and no shield, in a gap that has a covered day
 *    (active or protected) just before it. Days before a user's first activity were never part of a streak.
 *  - Today is never missed: it is not over yet.
 *  - A gap is protected whole or not at all. Shields spent on the early days of a gap that cannot be covered would be
 *    wasted, because the streak breaks anyway, so they are kept.
 *  - A shield covers a day only if it was bought on or before that day. Buying one afterwards cannot bring back a
 *    streak that has already broken.
 *  - One shield per day, and the shield bought longest ago is used first.
 *  - A protected day is not an active day. It adds nothing to the number of days practised; it only stops the
 *    streak from breaking (see `streaks`).
 */

export interface ProtectionInput {
  /** Days with real activity. */
  activeDays: ReadonlySet<string>;
  /** Days a shield already protects. */
  protectedDays: ReadonlySet<string>;
  /** Shields not yet used. */
  shields: readonly OwnedShield[];
  today: string;
  /** How many days back to look. */
  lookbackDays: number;
}

export interface ProtectionPlan {
  /** The shield to use on each day, oldest day first. */
  assignments: { date: string; shieldKey: string }[];
  /** Gaps that no combination of owned shields could cover: the streak is broken there. */
  uncovered: string[][];
}

export function planProtection({ activeDays, protectedDays, shields, today, lookbackDays }: ProtectionInput): ProtectionPlan {
  const covered = (day: string) => activeDays.has(day) || protectedDays.has(day);
  const queue = [...shields].sort((a, b) => (a.boughtOn < b.boughtOn ? -1 : a.boughtOn > b.boughtOn ? 1 : 0));
  const used = new Set<string>();
  const assignments: ProtectionPlan["assignments"] = [];
  const uncovered: string[][] = [];

  const start = addDays(today, -Math.max(1, lookbackDays));
  const last = addDays(today, -1);

  const tryCover = (gap: string[]) => {
    const picked: { date: string; shieldKey: string }[] = [];
    const taken = new Set<string>();
    for (const date of gap) {
      const shield = queue.find((s) => !used.has(s.key) && !taken.has(s.key) && s.boughtOn <= date);
      if (!shield) {
        uncovered.push(gap);
        return;
      }
      taken.add(shield.key);
      picked.push({ date, shieldKey: shield.key });
    }
    for (const key of taken) used.add(key);
    assignments.push(...picked);
  };

  // A gap needs a covered day before it. Start from the day before the window: if it is covered, a gap at the start counts.
  let anchored = covered(addDays(start, -1));
  let gap: string[] = [];
  for (let day = start; day <= last; day = addDays(day, 1)) {
    if (covered(day)) {
      if (gap.length > 0) tryCover(gap);
      gap = [];
      anchored = true;
    } else if (anchored) {
      gap.push(day);
    }
  }
  if (gap.length > 0) tryCover(gap);

  return { assignments, uncovered };
}
