"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Flame, Trophy } from "lucide-react";
import { StatTile } from "@/components/layout/page-header";
import { useLocalStore } from "@/features/auth/components/viewer-provider";
import { dayKey } from "@/features/progress/lib/activity";
import { guestActivityDays, localActivityDays } from "@/features/progress/lib/local-activity";
import { browserTimeZone, summarizeStreaks } from "@/features/progress/lib/streak";
import { cn } from "@/lib/utils";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The activity streak tiles of the profile: current streak, longest streak and active days. They sit in the page's
 * stat grid, so this renders three tiles side by side with the others.
 *
 * A signed-in user passes the days the account knows (`serverDays`, in their time zone `timeZone`); the tiles show
 * those straight away and then add what this device holds that the server may not have yet (days played offline).
 * The page may also be an old cached copy, so "today" is worked out here, in the same zone, not taken from the server.
 * A guest passes neither: their days live in this browser and appear once it has read them.
 */
export function StreakTiles({ serverDays, timeZone, initialToday }: { serverDays?: readonly string[]; timeZone?: string; initialToday?: string }) {
  const store = useLocalStore();
  const [local, setLocal] = useState<{ days: readonly string[]; today: string } | null>(null);

  const refresh = useCallback(() => {
    if (!store) return;
    const zone = timeZone ?? browserTimeZone();
    setLocal({ days: timeZone ? [...localActivityDays(store, timeZone)] : guestActivityDays(store), today: dayKey(new Date(), zone) });
  }, [store, timeZone]);

  // After mount, so the first render matches the server's; and again when the tab is shown, so a streak notices that midnight passed.
  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const today = local?.today ?? initialToday;
  const known = today !== undefined && (serverDays !== undefined || local !== null);
  const summary = known ? summarizeStreaks([...(serverDays ?? []), ...(local?.days ?? [])], today) : null;
  const current = summary?.current ?? 0;

  return (
    <>
      <StatTile
        label="Current streak"
        value={summary ? plural(current, "day") : "—"}
        tone={current > 0 ? "success" : undefined}
        icon={<Flame className={cn("size-5", current > 0 ? "text-warning" : "text-muted-foreground")} aria-hidden />}
        hint={!summary ? undefined : summary.todayDone ? "extended today" : current > 0 ? "keep it going today" : "finish an activity to start one"}
      />
      <StatTile
        label="Longest streak"
        value={summary ? plural(summary.longest, "day") : "—"}
        icon={<Trophy className="size-5 text-muted-foreground" aria-hidden />}
        hint={!summary ? undefined : summary.longest === 0 ? "your best run will show here" : current === summary.longest ? "your best so far" : "your best run"}
      />
      <StatTile label="Active days" value={summary ? summary.activeLastYear : "—"} icon={<CalendarDays className="size-5 text-muted-foreground" aria-hidden />} hint="in the last year" />
    </>
  );
}
