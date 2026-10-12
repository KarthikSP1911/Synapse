import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ProgressCharts from "@/components/progress-charts";
import RangeChart from "@/components/range-chart";
import { SkillIcon } from "@/components/skill-icon";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { Page, PageHeader, StatTile } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { GuestProgress } from "@/components/guest-progress";
import { ItemList, SkillFilterNav, accuracyColor, accuracyTone, seconds } from "@/components/progress-parts";
import { requireViewer } from "@/lib/auth";
import {
  getExerciseBreakdown,
  getMasteredItems,
  getRecentSessions,
  getSkillSummaries,
  getSquareCells,
  getUpcomingReviews,
  getWeakConcepts,
  getWeakItems,
  overviewOf,
  parseSkillFilter,
  type ConceptRow,
} from "@/lib/progress-queries";
import { squareRangeBuckets } from "@/lib/square-range";
import { SKILL_META, SKILL_ORDER, exerciseLabel, exponentConceptLabel, modeLabel, skillTitle } from "@/lib/skills/meta";
import { skillHref } from "@/lib/skills/routes";
import type { Skill } from "@/lib/skills/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Progress" };

function ConceptList({ concepts }: { concepts: ConceptRow[] }) {
  if (concepts.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Not enough data yet.</p>;
  return (
    <ul className="space-y-4">
      {concepts.map((c) => (
        <li key={c.concept} className="space-y-2">
          <div className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate font-mono text-sm font-semibold" title={c.concept}>
              {conceptLabel(c.concept)}
            </span>
            <span className="flex shrink-0 gap-3 font-mono text-xs tabular-nums text-muted-foreground">
              <span>{c.items} {c.items === 1 ? "question" : "questions"}</span>
              <span>{c.accuracy}%</span>
            </span>
          </div>
          <Progress value={c.weaknessScore} className="h-1.5 bg-secondary" indicatorColor="bg-destructive" aria-label={`${c.weaknessScore} out of 100`} />
        </li>
      ))}
    </ul>
  );
}

/** `percentage:pct:25` -> "25%", `fraction:3/4` -> "3/4", `square:17` -> "17²", `addition:2d+1d` -> "2-digit + 1-digit". */
function conceptLabel(concept: string): string {
  const [skill, ...rest] = concept.split(":");
  const tail = rest.join(":");
  if (skill === "addition" || skill === "subtraction" || skill === "division") {
    const sizes = /^(\d)d([+\-/])(\d)d$/.exec(tail);
    if (sizes) return `${sizes[1]}-digit ${sizes[2] === "-" ? "−" : sizes[2] === "/" ? "÷" : "+"} ${sizes[3]}-digit`;
  }
  if (skill === "percentage") return tail === "multi" ? "Multi-step changes" : `${tail.replace("pct:", "")}%`;
  if (skill === "square") return `${tail}²`;
  if (skill === "exponents") return exponentConceptLabel(tail);
  if (skill === "fraction") return tail.startsWith("compare:") ? tail.replace("compare:", "").replace("|", " vs ") : tail;
  return concept;
}

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const viewer = await requireViewer();
  const filter = parseSkillFilter((await searchParams).skill);
  if (viewer.kind === "guest") return <GuestProgress filter={filter} />;
  const userId = viewer.user.id;

  const [summaries, breakdown, weakItems, masteredItems, weakConcepts, reviews, recent, squareCells] = await Promise.all([
    getSkillSummaries(userId),
    getExerciseBreakdown(userId, filter),
    getWeakItems(userId, filter, 10),
    getMasteredItems(userId, filter, 5),
    getWeakConcepts(userId, filter, 8),
    getUpcomingReviews(userId, filter),
    getRecentSessions(userId, filter, 30),
    filter === "square" ? getSquareCells(userId) : Promise.resolve([]),
  ]);

  const overview = overviewOf(summaries, filter);
  const recentSessions = [...recent].reverse(); // oldest first for the chart
  const chartData = recentSessions.map((s) => ({
    label: s.startedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    accuracy: s.accuracy,
    avgSeconds: Math.round(s.averageResponseTimeMs / 100) / 10,
  }));
  const filterTitle = filter === "all" ? "all skills" : SKILL_META[filter as Skill].title.toLowerCase();
  const maxBox = Math.max(1, ...reviews.boxes);
  const maxUpcoming = Math.max(1, reviews.dueNow, ...reviews.upcoming.map((u) => u.count));

  return (
    <Page>
      <PageHeader
        eyebrow="Dashboard"
        title="Your progress"
        description="Track accuracy and speed over time, and see exactly which questions need more work."
        actions={
          <Link href={filter === "all" ? "/" : skillHref(filter)} className={buttonVariants({})}>
            Practice <ArrowRight />
          </Link>
        }
      />

      <SkillFilterNav active={filter} />

      {overview.attempts === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-lg font-semibold tracking-tight">No data yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {filter === "all"
              ? "Complete a practice session and your accuracy, speed and weak spots will show up here."
              : `You haven't answered any ${filterTitle} questions yet.`}
          </p>
          <Link href={filter === "all" ? "/" : skillHref(filter)} className={buttonVariants({ className: "mt-6" })}>
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

          {filter === "square" && (
            <Card>
              <CardHeader>
                <CardTitle>Recall by range</CardTitle>
                <CardDescription>Accuracy for squares and roots of numbers in each range. Empty bars have not been attempted.</CardDescription>
              </CardHeader>
              <CardContent>
                <RangeChart data={squareRangeBuckets(squareCells)} label="Square recall accuracy by range of numbers" />
              </CardContent>
            </Card>
          )}

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
                <ItemList items={masteredItems.filter((i) => i.weaknessScore <= 30)} bad={false} empty="Keep practising to master questions." showSkill={filter === "all"} />
              </CardContent>
            </Card>
          </div>

          {filter !== "multiplication" && (
            <Card>
              <CardHeader>
                <CardTitle>Weakest concepts</CardTitle>
                <CardDescription>
                  Related questions grouped by idea: a percentage, a fraction or a number to square. Based on every question that shares the concept.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConceptList concepts={weakConcepts} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Upcoming reviews</CardTitle>
              <CardDescription>When practised questions come back for spaced-repetition review.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-medium">Review schedule</h3>
                <ul className="space-y-3">
                  {[{ label: "Due now", count: reviews.dueNow }, ...reviews.upcoming].map((u) => (
                    <li key={u.label} className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span>{u.label}</span>
                        <span className="font-mono tabular-nums text-muted-foreground">{u.count}</span>
                      </div>
                      <Progress value={(u.count / maxUpcoming) * 100} className="h-1.5 bg-secondary" indicatorColor={u.label === "Due now" ? "bg-warning" : "bg-foreground"} aria-label={`${u.count} questions`} />
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-medium">Leitner boxes</h3>
                <ul className="space-y-3">
                  {reviews.boxes.map((count, i) => (
                    <li key={i} className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span>
                          Box {i + 1} <span className="text-muted-foreground">· every {[1, 2, 4, 8, 16][i]} {i === 0 ? "day" : "days"}</span>
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">{count}</span>
                      </div>
                      <Progress value={(count / maxBox) * 100} className="h-1.5 bg-secondary" indicatorColor="bg-foreground" aria-label={`${count} questions in box ${i + 1}`} />
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent sessions</CardTitle>
              <CardDescription>Select a session to review its results.</CardDescription>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions yet.</p>
              ) : (
                <ul className="-mx-2 divide-y divide-border">
                  {recent.slice(0, 10).map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/practice/${s.id}/summary`}
                        className="group flex items-center justify-between gap-4 rounded-md px-2 py-3 text-sm transition-colors hover:bg-accent"
                      >
                        <span className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                          <span className="font-medium">
                            {s.startedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </span>
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <SkillIcon skill={(s.skill as Skill) in SKILL_META ? (s.skill as Skill) : "multiplication"} className="size-3.5" />
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
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Page>
  );
}
