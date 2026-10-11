import Link from "next/link";
import { ArrowRight, BarChart3, Check, Lightbulb, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Page, StatTile } from "@/components/page-header";
import ReviewButton from "@/components/review-button";
import { SkillIcon } from "@/components/skill-icon";
import { exerciseLabel, modeLabel, skillTitle } from "@/lib/skills/meta";
import { questionFromId } from "@/lib/skills/build";
import type { Skill } from "@/lib/skills/types";

export interface SummarySession {
  skill: Skill;
  mode: string;
  durationSeconds: number | null;
  targetQuestionCount: number | null;
  totalCorrect: number;
  totalIncorrect: number;
  actualQuestionCount: number;
  accuracy: number;
  averageResponseTimeMs: number;
  pausedMs: number;
  startedAt: Date;
  endedAt: Date | null;
}

export interface MissedQuestion {
  questionId: string;
  prompt: string;
  correctAnswerText: string;
  outcome: string;
  userAnswerText: string | null;
  hinted: boolean;
}

export interface ExerciseTypeRow {
  exerciseType: string;
  attempted: number;
  correct: number;
  averageResponseTimeMs: number;
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

function verdict(accuracy: number) {
  if (accuracy >= 95) return "Outstanding";
  if (accuracy >= 85) return "Great work";
  if (accuracy >= 70) return "Solid session";
  if (accuracy >= 50) return "Getting there";
  return "Keep practising";
}

const missLabel: Record<string, string> = { incorrect: "", skipped: "Skipped", timed_out: "Timed out" };

/**
 * The results of one practice session. Shared by the signed-in page (data from the database) and the
 * guest page (data from the browser), so both look and read the same.
 */
export function SessionSummary({
  session,
  missed,
  byType,
  bestPrevious,
  sessionId,
  local = false,
}: {
  session: SummarySession;
  missed: MissedQuestion[];
  byType: ExerciseTypeRow[];
  /** Best score among earlier timed sessions of the same skill and length; null for other modes. */
  bestPrevious: number | null;
  sessionId: number;
  /** The figures come from this browser's local store rather than the server. */
  local?: boolean;
}) {
  const skill = session.skill;
  const isRecord = bestPrevious !== null && session.totalCorrect > bestPrevious;

  // Time on task excludes any time the session spent paused.
  const elapsed = session.endedAt
    ? formatDuration(session.endedAt.getTime() - session.startedAt.getTime() - session.pausedMs)
    : "—";
  const answered = session.actualQuestionCount > 0;
  const typeLabels = byType.map((t) => exerciseLabel(skill, t.exerciseType));

  return (
    <Page narrow>
      <div className="space-y-3">
        <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <SkillIcon skill={skill} className="size-3.5" />
          <span>{skillTitle(skill)}</span>
          <span aria-hidden>·</span>
          <span>{modeLabel(session)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {answered ? verdict(session.accuracy) : "Session summary"}
          </h1>
          {isRecord && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning">
              <Trophy className="size-3.5" /> New personal best
            </span>
          )}
        </div>
        {typeLabels.length > 0 && <p className="text-muted-foreground">{typeLabels.join(" · ")}</p>}
        {bestPrevious !== null && bestPrevious > 0 && (
          <p className="text-muted-foreground">Previous best for this length: {bestPrevious} correct.</p>
        )}
      </div>

      {!answered ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No questions were answered in this session.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <StatTile
              label={session.mode === "timed" ? "Score" : "Correct"}
              value={`${session.totalCorrect}/${session.actualQuestionCount}`}
              hint={`${session.actualQuestionCount} attempted · ${session.totalIncorrect} missed`}
            />
            <StatTile
              label="Accuracy"
              value={`${session.accuracy}%`}
              tone={session.accuracy >= 85 ? "success" : session.accuracy >= 60 ? "warning" : "danger"}
            />
            <StatTile label="Avg response" value={`${(session.averageResponseTimeMs / 1000).toFixed(1)}s`} />
            <StatTile label="Time" value={elapsed} hint={session.pausedMs > 0 ? "excluding pauses" : undefined} />
          </div>

          {byType.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>By exercise type</CardTitle>
                <CardDescription>How each kind of question went this session.</CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="pb-2 font-medium">Exercise</th>
                      <th scope="col" className="pb-2 text-right font-medium">Correct</th>
                      <th scope="col" className="pb-2 text-right font-medium">Accuracy</th>
                      <th scope="col" className="pb-2 text-right font-medium">Avg time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {byType.map((t) => {
                      const { attempted, correct } = t;
                      return (
                        <tr key={t.exerciseType}>
                          <th scope="row" className="py-2.5 text-left font-medium">{exerciseLabel(skill, t.exerciseType)}</th>
                          <td className="py-2.5 text-right font-mono tabular-nums">{correct}/{attempted}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">{Math.round((correct / attempted) * 100)}%</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">{(t.averageResponseTimeMs / 1000).toFixed(1)}s</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Missed questions</CardTitle>
          <CardDescription>Review these before your next session.</CardDescription>
        </CardHeader>
        <CardContent>
          {missed.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {answered ? (
                <>
                  <Check className="size-4 text-success" /> Perfect session, nothing missed.
                </>
              ) : (
                "Nothing to review."
              )}
            </p>
          ) : (
            <ul className="-my-1 divide-y divide-border">
              {missed.map((m, index) => {
                const explanation = questionFromId(m.questionId)?.explanation;
                return (
                  <li key={`${m.questionId}-${index}`} className="space-y-1.5 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="font-mono text-base font-semibold tabular-nums">
                        {m.prompt} <span className="text-muted-foreground">→</span> {m.correctAnswerText}
                      </span>
                      <span className="text-muted-foreground">
                        {m.outcome !== "incorrect" ? (
                          <span className="rounded bg-warning-soft px-1.5 py-0.5 font-medium text-warning">{missLabel[m.outcome] ?? m.outcome}</span>
                        ) : (
                          <>
                            You answered{" "}
                            <span className="rounded bg-destructive-soft px-1.5 py-0.5 font-mono font-medium text-destructive">
                              {m.userAnswerText ?? "—"}
                            </span>
                          </>
                        )}
                        {m.hinted && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs">
                            <Lightbulb className="size-3" /> hint used
                          </span>
                        )}
                      </span>
                    </div>
                    {explanation && <p className="text-muted-foreground">{explanation}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-start gap-3">
        <Link href={skill === "multiplication" ? "/" : `/?skill=${skill}`} className={buttonVariants({ size: "lg" })}>
          Practice again <ArrowRight />
        </Link>
        {missed.length > 0 && <ReviewButton source={{ reviewSessionId: sessionId }} remote={!local} label="Retry missed" variant="outline" className="h-11 px-6 text-[15px]" />}
        <Link href={`/progress?skill=${skill}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          <BarChart3 /> View progress
        </Link>
      </div>
    </Page>
  );
}
