import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";
import { ActivityHeatmap } from "@/features/progress/components/activity-heatmap";
import { Page, StatTile } from "@/components/layout/page-header";
import { SkillIcon } from "@/components/common/skill-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StreakTiles } from "@/features/progress/components/streak-tiles";
import { ShieldPanel } from "@/features/rewards/components/shield-panel";
import { dbRun } from "@/features/rewards/server/db-run";
import { getSnapshot } from "@/features/rewards/server/wallet";
import { buildHeatmap, dayKey, streaks } from "@/features/progress/lib/activity";
import { requireViewer } from "@/features/auth/server/auth";
import { logoutAction } from "@/features/auth/server/auth-actions";
import { getActivityByDay, getActivityDays, getSkillSummaries, getTotalAnswered } from "@/features/progress/server/progress-queries";
import { SKILL_META, SKILL_ORDER } from "@/features/skills/lib/meta";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

const WEEKS = 53;
const accuracyColor = (accuracy: number) => (accuracy >= 85 ? "text-success" : accuracy >= 60 ? "text-warning" : "text-destructive");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A guest has no account to read from: the streak comes from this browser (see StreakTiles). */
function GuestProfile() {
  return (
    <Page>
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <UserRound className="size-7" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Profile</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Guest</h1>
          <p className="text-sm text-muted-foreground">Your progress is saved in this browser only.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StreakTiles />
      </div>

      <ShieldPanel />

      <Card>
        <CardHeader>
          <CardTitle>Keep your streak across devices</CardTitle>
          <CardDescription>
            A guest&rsquo;s practice and streak stay in this browser and are not carried over to a new account. Create an account to keep them wherever you
            practise.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/signup" className={buttonVariants({})}>
            Create an account
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "outline" })}>
            Log in
          </Link>
        </CardContent>
      </Card>
    </Page>
  );
}

export default async function ProfilePage() {
  const viewer = await requireViewer();
  if (viewer.kind === "guest") return <GuestProfile />;
  const user = viewer.user;
  const today = dayKey(new Date(), user.timezone);

  const [counts, activityDays, summaries, totalAnswered, protectedDays] = await Promise.all([
    getActivityByDay(user.id, user.timezone, WEEKS * 7),
    getActivityDays(user.id, user.timezone),
    getSkillSummaries(user.id),
    getTotalAnswered(user.id),
    // The days shields protected. If the wallet tables are not there yet (the migration has not been run), the profile still opens.
    getSnapshot(dbRun, user.id).then(
      (snapshot) => snapshot.uses.map((use) => use.date),
      (error) => {
        console.error("Could not read the wallet for the profile:", error);
        return [] as string[];
      }
    ),
  ]);

  const heatmap = buildHeatmap(counts, today, WEEKS);
  const { activeDays } = streaks(counts, today);
  const yearTotal = heatmap.weeks.flat().reduce((sum, d) => sum + d.count, 0);
  const summary = `Practice activity over the last year: ${plural(yearTotal, "question")} answered on ${plural(activeDays, "day")}.`;

  return (
    <Page>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <UserRound className="size-7" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Profile</p>
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl" title={user.email}>
              {user.email}
            </h1>
            <p className="text-sm text-muted-foreground">
              Member since {user.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
            </p>
          </div>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="outline">
            Log out
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StreakTiles serverDays={activityDays} serverProtectedDays={protectedDays} timeZone={user.timezone} initialToday={today} />
        <StatTile label="Questions answered" value={totalAnswered.toLocaleString()} hint="all time" />
      </div>

      <ShieldPanel />

      <Card>
        <CardHeader>
          <CardTitle>Practice calendar</CardTitle>
          <CardDescription>
            {yearTotal === 0
              ? "Your practice will fill in here, one square per day."
              : `${plural(yearTotal, "question")} answered in the last year. Darker squares are busier days. Days follow your time zone (${user.timezone}).`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityHeatmap heatmap={heatmap} summary={summary} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By skill</CardTitle>
          <CardDescription>Each skill is tracked on its own.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="pb-2 font-medium">Skill</th>
                <th scope="col" className="pb-2 text-right font-medium">Answered</th>
                <th scope="col" className="pb-2 text-right font-medium">Accuracy</th>
                <th scope="col" className="pb-2 text-right font-medium">Mastered</th>
                <th scope="col" className="pb-2 text-right font-medium">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SKILL_ORDER.map((skill) => {
                const s = summaries[skill];
                const practised = s.attempts > 0;
                return (
                  <tr key={skill}>
                    <th scope="row" className="py-2.5 text-left font-medium">
                      <Link href={`/progress?skill=${skill}`} className="inline-flex items-center gap-2 hover:underline">
                        <SkillIcon skill={skill} className="size-4 text-muted-foreground" />
                        {SKILL_META[skill].title}
                      </Link>
                    </th>
                    <td className="py-2.5 text-right font-mono tabular-nums">{s.attempts.toLocaleString()}</td>
                    <td className={cn("py-2.5 text-right font-mono tabular-nums", practised && accuracyColor(s.accuracy))}>
                      {practised ? `${s.accuracy}%` : "—"}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{practised ? s.mastered : "—"}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{practised ? s.due : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Link href="/progress" className={buttonVariants({ variant: "outline", className: "mt-5" })}>
            Full progress <ArrowRight />
          </Link>
        </CardContent>
      </Card>
    </Page>
  );
}
