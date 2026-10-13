import { cn } from "@/lib/utils";
import { ScrollToEnd } from "@/components/layout/scroll-to-end";
import type { Heatmap, HeatmapDay } from "@/features/progress/lib/activity";

/** Colour steps from "nothing" to "busiest day". Colour is never the only signal: every cell carries its count in a tooltip. */
const LEVEL_CLASS: Record<HeatmapDay["level"], string> = {
  0: "bg-secondary ring-1 ring-inset ring-border",
  1: "bg-success/25",
  2: "bg-success/45",
  3: "bg-success/70",
  4: "bg-success",
};

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const CELL = "size-3";

function describe(cell: HeatmapDay) {
  const date = new Date(`${cell.day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (cell.count === 0) return `No questions on ${date}`;
  return `${cell.count} ${cell.count === 1 ? "question" : "questions"} on ${date}`;
}

export function ActivityHeatmap({ heatmap, summary }: { heatmap: Heatmap; summary: string }) {
  // A month label needs about three columns of room; when a month starts right after another, keep the later one.
  const months = heatmap.months.filter((m, i) => {
    const next = heatmap.months[i + 1];
    return !next || next.week - m.week >= 3;
  });
  const weekCount = heatmap.weeks.length;

  return (
    <div>
      <div className="flex gap-2">
        {/* Weekday labels line up with the seven rows of cells. */}
        <div aria-hidden className="grid grid-rows-7 gap-[3px] pt-[18px] text-[10px] leading-3 text-muted-foreground">
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={i} className="flex h-3 items-center">
              {label}
            </span>
          ))}
        </div>

        <ScrollToEnd className="min-w-0 flex-1">
          <div className="w-max">
            <div
              aria-hidden
              className="grid h-[14px] gap-[3px] text-[10px] leading-[14px] text-muted-foreground"
              style={{ gridTemplateColumns: `repeat(${weekCount}, 0.75rem)` }}
            >
              {months.map((m) => (
                <span key={m.week} className="whitespace-nowrap" style={{ gridColumnStart: m.week + 1 }}>
                  {m.label}
                </span>
              ))}
            </div>

            <div role="img" aria-label={summary} className="mt-1 grid grid-flow-col grid-rows-7 gap-[3px]">
              {heatmap.weeks.flat().map((cell) => (
                <div
                  key={cell.day}
                  title={cell.future ? undefined : describe(cell)}
                  className={cn(CELL, "rounded-[3px]", cell.future ? "invisible" : LEVEL_CLASS[cell.level])}
                />
              ))}
            </div>
          </div>
        </ScrollToEnd>
      </div>

      <div className="mt-4 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        <span>Less</span>
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span key={level} aria-hidden className={cn(CELL, "rounded-[3px]", LEVEL_CLASS[level])} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
