import Link from "next/link";
import { SkillIcon } from "@/components/skill-icon";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ItemRow, SkillFilter } from "@/lib/progress-queries";
import { SKILL_META, SKILL_ORDER, exerciseLabel, skillTitle } from "@/lib/skills/meta";

/** Pieces of the Progress page shared by the account version and the guest version. */

export const accuracyTone = (accuracy: number) => (accuracy >= 85 ? "success" : accuracy >= 60 ? "warning" : "danger");
export const accuracyColor = (accuracy: number) => (accuracy >= 85 ? "text-success" : accuracy >= 60 ? "text-warning" : "text-destructive");
export const seconds = (ms: number) => (ms / 1000).toFixed(1);

export function SkillFilterNav({ active }: { active: SkillFilter }) {
  const options: { value: SkillFilter; label: string }[] = [
    { value: "all", label: "All skills" },
    ...SKILL_ORDER.map((skill) => ({ value: skill, label: SKILL_META[skill].title })),
  ];
  return (
    <nav aria-label="Filter by skill" className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map(({ value, label }) => (
        <Link
          key={value}
          href={value === "all" ? "/progress" : `/progress?skill=${value}`}
          aria-current={value === active ? "page" : undefined}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 pointer-coarse:h-11 rounded-md border px-3 text-sm font-medium transition-colors",
            value === active
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-muted-foreground hover:border-input hover:bg-accent hover:text-foreground"
          )}
        >
          {value !== "all" && <SkillIcon skill={value} className="size-3.5" />}
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function ItemList({ items, bad, empty, showSkill }: { items: ItemRow[]; bad: boolean; empty: string; showSkill: boolean }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const score = bad ? item.weaknessScore : 100 - item.weaknessScore;
        return (
          <li key={item.questionId} className="space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0">
                <span className="block truncate font-mono text-base font-semibold tabular-nums" title={item.prompt}>
                  {item.prompt}
                </span>
                {showSkill && (
                  <span className="block text-xs text-muted-foreground">
                    {skillTitle(item.skill)} · {exerciseLabel(item.skill, item.exerciseType)}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 gap-3 font-mono text-xs tabular-nums text-muted-foreground">
                <span>{item.accuracy}%</span>
                <span>{seconds(item.averageResponseTimeMs)}s</span>
              </span>
            </div>
            <Progress
              value={score}
              className="h-1.5 bg-secondary"
              indicatorColor={bad ? "bg-destructive" : "bg-success"}
              aria-label={`${score} out of 100`}
            />
          </li>
        );
      })}
    </ul>
  );
}
