"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import ProgressCharts from "@/features/progress/components/progress-charts";
import { Page, PageHeader, StatTile } from "@/components/layout/page-header";
import { ItemList, SkillFilterNav, accuracyColor, accuracyTone, seconds } from "@/features/progress/components/progress-parts";
import { SkillIcon } from "@/components/common/skill-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  guestExerciseBreakdown,
  guestMasteredItems,
  guestRecentSessions,
  guestSkillSummaries,
  guestWeakItems,
} from "@/lib/offline/guest/progress";
import { clearGuestData, loadGuestData, type GuestData } from "@/lib/offline/guest/storage";
import { summaryHref } from "@/lib/offline/local-store";
import { overviewOf } from "@/features/progress/lib/progress-shared";
import type { SkillFilter } from "@/features/progress/server/progress-queries";
import { SKILL_META, SKILL_ORDER, exerciseLabel, modeLabel, skillTitle } from "@/features/skills/lib/meta";
import { skillHref } from "@/features/skills/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The guest version of the Progress page: the same figures as for accounts, read from this browser.
 * Spaced-repetition schedules and concept breakdowns need the full server-side history, so they are left out.
 */
export function GuestProgress({ filter }: { filter: SkillFilter }) {
  // Guest data only exists in the browser, so it is read after mount. `null` means not read yet.
  const [data, setData] = useState<GuestData | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setData(loadGuestData()), 0);
    return () => clearTimeout(timer);
  }, []);

  const practiceHref = filter === "all" ? "/" : skillHref(filter);
  const header = (
    <>
      <PageHeader
        eyebrow="Guest progress"
        title="Your progress"
        description="Track accuracy and speed over time, and see exactly which questions need more work."
        actions={
          <Link href={practiceHref} className={buttonVariants({})}>
            Practice <ArrowRight />
          </Link>
        }
      />
      <p className="flex items-start gap-2 rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          You are practising as a guest, so this is saved in this browser only. Clearing site data removes it, and it is not carried over if you{" "}
          <Link href="/signup" className="text-link underline-offset-4 hover:underline">
            create an account
          </Link>
          .
        </span>
      </p>
      <SkillFilterNav active={filter} />
    </>
  );

  if (!data) {
    return (
      <Page>
        {header}
        <div className="grid h-40 place-items-center" role="status">
          <div className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
        </div>
      </Page>
    );
  }

  const summaries = guestSkillSummaries(data);
  const overview = overviewOf(summaries, filter);
  const breakdown = guestExerciseBreakdown(data, filter);
  const weakItems = guestWeakItems(data, filter, 10);
  const masteredItems = guestMasteredItems(data, filter, 5).filter((i) => i.weaknessScore <= 30);
  const recent = guestRecentSessions(data, filter, 30);
  const chartData = [...recent].reverse().map((s) => ({
    label: new Date(s.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    accuracy: s.accuracy,
    avgSeconds: Math.round(s.averageResponseTimeMs / 100) / 10,
  }));
  const filterTitle = filter === "all" ? "all skills" : SKILL_META[filter].title.toLowerCase();

  const clear = () => {
    clearGuestData();
    setData(loadGuestData());
    setConfirming(false);
  };

  return (
    <Page>
      {header}

      {overview.attempts === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-lg font-semibold tracking-tight">No data yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {filter === "all"
              ? "Complete a practice session and your accuracy, speed and weak spots will show up here."
              : `You haven't answered any ${filterTitle} questions yet.`}
          </p>
          <Link href={practiceHref} className={buttonVariants({ className: "mt-6" })}>
            Start your first session
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile label="Total questions" value={overview.attempts.toLocaleString()} />
            <StatTile label="Overall accuracy" value={`${overview.accuracy}%`} tone={accuracyTone(overview.accuracy)} />
            <StatTile label="Avg response time" value={`${(overview.averageResponseTimeMs / 1000).toFixed(2)}s`} />
            <StatTile label="Due for review" value={overview.due} hint="questions scheduled by spaced repetition" />
          </div>

          {filter === "all" && (
            <Card>
              <CardHeader>
                <CardTitle>By skill</CardTitle>
                <CardDescription>Each skill is tracked on its own, so one never distorts another.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="pb-2 font-medium">Skill</th>
                      <th scope="col" className="pb-2 text-right font-medium">Answered</th>
                      <th scope="col" className="pb-2 text-right font-medium">Accuracy</th>
                      <th scope="col" className="pb-2 text-right font-medium">Avg time</th>
                      <th scope="col" className="pb-2 text-right font-medium">Weak</th>
                      <th scope="col" className="pb-2 text-right font-medium">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {SKILL_ORDER.map((skill) => {
                      const s = summaries[skill];
                      return (
                        <tr key={skill}>
                          <th scope="row" className="py-2.5 text-left font-medium">
                            <Link href={`/progress?skill=${skill}`} className="inline-flex items-center gap-2 hover:underline">
                              <SkillIcon skill={skill} className="size-4 text-muted-foreground" />
                              {SKILL_META[skill].title}
                            </Link>
                          </th>
                          <td className="py-2.5 text-right font-mono tabular-nums">{s.attempts.toLocaleString()}</td>
                          <td className={cn("py-2.5 text-right font-mono tabular-nums", s.attempts > 0 && accuracyColor(s.accuracy))}>
                            {s.attempts > 0 ? `${s.accuracy}%` : "—"}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums">{s.attempts > 0 ? `${seconds(s.averageResponseTimeMs)}s` : "—"}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">{s.attempts > 0 ? s.weak : "—"}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">{s.attempts > 0 ? s.due : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Trend</CardTitle>
              <CardDescription>Accuracy and average response time across your last 30 {filter === "all" ? "" : `${filterTitle} `}sessions.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProgressCharts data={chartData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Performance by exercise type</CardTitle>
              <CardDescription>Accuracy for each kind of question, with how many you have answered and how fast.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                {breakdown.map((row) => (
                  <li key={`${row.skill}:${row.exerciseType}`} className="space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-sm font-medium">
                        {filter === "all" && <span className="text-muted-foreground">{SKILL_META[row.skill].short} · </span>}
                        {exerciseLabel(row.skill, row.exerciseType)}
                      </span>
                      <span className="flex gap-3 font-mono text-xs tabular-nums text-muted-foreground">
                        <span>{row.attempts.toLocaleString()} answered</span>
                        <span className={accuracyColor(row.accuracy)}>{row.accuracy}%</span>
                        <span>{seconds(row.averageResponseTimeMs)}s</span>
                        <span>{row.weak} weak</span>
                      </span>
                    </div>
                    <Progress
                      value={row.accuracy}
                      className="h-1.5 bg-secondary"
                      indicatorColor={row.accuracy >= 85 ? "bg-success" : row.accuracy >= 60 ? "bg-warning" : "bg-destructive"}
                      aria-label={`${row.accuracy}% accuracy`}
                    />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-destructive" /> Needs work
                </CardTitle>
                <CardDescription>Your ten weakest questions, based on accuracy and speed.</CardDescription>
              </CardHeader>
              <CardContent>
                <ItemList items={weakItems} bad empty="No data available yet. Start practising!" showSkill={filter === "all"} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-success" /> Mastered
                </CardTitle>
                <CardDescription>Questions you answer quickly and correctly (5+ attempts).</CardDescription>
              </CardHeader>
              <CardContent>
                <ItemList items={masteredItems} bad={false} empty="Keep practising to master questions." showSkill={filter === "all"} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent sessions</CardTitle>
              <CardDescription>Select a session to review its results.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="-mx-2 divide-y divide-border">
                {recent.slice(0, 10).map((s) => (
                  <li key={s.id}>
                    <Link
                      href={summaryHref(s.id)}
                      className="group flex items-center justify-between gap-4 rounded-md px-2 py-3 text-sm transition-colors hover:bg-accent"
                    >
                      <span className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                        <span className="font-medium">
                          {new Date(s.startedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <SkillIcon skill={s.skill} className="size-3.5" />
                          {skillTitle(s.skill)} · {modeLabel(s)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 font-mono text-xs tabular-nums">
                        <span className="text-muted-foreground">
                          {s.totalCorrect}/{s.actualQuestionCount}
                        </span>
                        <span className={accuracyColor(s.accuracy)}>{s.accuracy}%</span>
                        <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
            {confirming ? (
              <>
                <span className="text-sm text-muted-foreground">Delete all guest progress from this browser?</span>
                <Button variant="destructive" size="sm" onClick={clear}>
                  Yes, delete it
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
                Clear guest progress
              </Button>
            )}
          </div>
        </>
      )}
    </Page>
  );
}
