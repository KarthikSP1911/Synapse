"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Page } from "@/components/page-header";
import { SessionSummary, type ExerciseTypeRow } from "@/components/session-summary";
import { buttonVariants } from "@/components/ui/button";
import type { LocalStore } from "@/lib/guest/api";
import { findSession, loadGuestData, type GuestSession } from "@/lib/guest/storage";

/** A locally stored session's summary: the same page as for accounts, with the figures read from this browser. */
export default function GuestSummary({ sessionId, store }: { sessionId: number; store: LocalStore }) {
  // Local data only exists in the browser, so it is read after mount. `undefined` means not read yet.
  const [state, setState] = useState<{ session: GuestSession | undefined; bestPrevious: number | null } | undefined>();

  useEffect(() => {
    const timer = setTimeout(() => {
      const data = loadGuestData(store.key);
      const session = findSession(data, sessionId);
      let bestPrevious: number | null = null;
      if (session && session.mode === "timed" && session.durationSeconds) {
        // Personal best among earlier timed sessions of the same skill and length.
        bestPrevious = Math.max(
          0,
          ...data.sessions
            .filter(
              (s) =>
                s.id !== session.id &&
                s.mode === "timed" &&
                s.skill === session.skill &&
                s.durationSeconds === session.durationSeconds &&
                s.endedAt !== null &&
                s.actualQuestionCount > 0
            )
            .map((s) => s.totalCorrect)
        );
      }
      setState({ session, bestPrevious });
    }, 0);
    return () => clearTimeout(timer);
  }, [sessionId, store.key]);

  if (!state) {
    return (
      <div className="grid min-h-[50dvh] place-items-center" role="status">
        <div className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  }

  const { session, bestPrevious } = state;
  if (!session) {
    return (
      <Page narrow>
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-lg font-semibold tracking-tight">Session not found</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Practice is saved in this browser, so this session is gone if the site data was cleared or it was started on another device.
          </p>
          <Link href="/" className={buttonVariants({ className: "mt-6" })}>
            Start a session
          </Link>
        </div>
      </Page>
    );
  }

  const groups = new Map<string, GuestSession["attempts"]>();
  for (const a of session.attempts) groups.set(a.exerciseType, [...(groups.get(a.exerciseType) ?? []), a]);
  const byType: ExerciseTypeRow[] = [...groups]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([exerciseType, attempts]) => ({
      exerciseType,
      attempted: attempts.length,
      correct: attempts.filter((a) => a.isCorrect).length,
      averageResponseTimeMs: attempts.reduce((sum, a) => sum + a.responseTimeMs, 0) / attempts.length,
    }));

  return (
    <SessionSummary
      local
      sessionId={session.id}
      session={{ ...session, startedAt: new Date(session.startedAt), endedAt: session.endedAt === null ? null : new Date(session.endedAt) }}
      missed={session.attempts.filter((a) => !a.isCorrect)}
      byType={byType}
      bestPrevious={bestPrevious}
    />
  );
}
