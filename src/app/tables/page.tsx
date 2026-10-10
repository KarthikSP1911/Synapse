import { db } from "@/db";
import { pairStatistics } from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Page, PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tables" };

const numbers = Array.from({ length: 20 }, (_, i) => i + 1);

/** Weakness score: 0 = mastered, 100 = critical. Colour is paired with the number, never used alone. */
const bands = [
  { max: 20, label: "Strong", cell: "bg-success/25 text-success", swatch: "bg-success/25" },
  { max: 40, label: "Good", cell: "bg-success/12 text-success", swatch: "bg-success/12" },
  { max: 60, label: "Developing", cell: "bg-warning/18 text-warning", swatch: "bg-warning/18" },
  { max: 80, label: "Weak", cell: "bg-destructive/15 text-destructive", swatch: "bg-destructive/15" },
  { max: 101, label: "Critical", cell: "bg-destructive/30 text-destructive", swatch: "bg-destructive/30" },
] as const;

const bandFor = (score: number) => bands.find((b) => score < b.max) ?? bands[bands.length - 1];

export default async function TablesPage() {
  const pairs = await db.select().from(pairStatistics);

  const pairMap = new Map<string, InferSelectModel<typeof pairStatistics>>();
  for (const p of pairs) {
    pairMap.set(`${p.leftNumber}x${p.rightNumber}`, p);
  }

  const attempted = pairs.filter((p) => p.totalAttempts > 0).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Heatmap"
        title="Times tables"
        description="Every multiplication pair from 1×1 to 20×20. Lower scores mean you know the pair well; higher scores need more practice."
      />

      <Card>
        <CardHeader>
          <CardTitle>Performance matrix</CardTitle>
          <CardDescription>
            {attempted} of 400 pairs attempted. Hover or focus a cell for accuracy and speed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="-mx-1 overflow-x-auto pb-2">
            <table className="mx-1 border-separate border-spacing-[3px] text-xs" aria-label="Weakness score by multiplication pair">
              <thead>
                <tr>
                  <th scope="col" className="size-9 rounded-md bg-secondary font-mono text-muted-foreground sm:size-10">
                    ×
                  </th>
                  {numbers.map((n) => (
                    <th key={n} scope="col" className="size-9 font-mono font-medium text-muted-foreground sm:size-10">
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {numbers.map((left) => (
                  <tr key={left}>
                    <th scope="row" className="size-9 font-mono font-medium text-muted-foreground sm:size-10">
                      {left}
                    </th>
                    {numbers.map((right) => {
                      const pair = pairMap.get(`${left}x${right}`);
                      const tried = pair && pair.totalAttempts > 0;
                      return (
                        <td
                          key={right}
                          tabIndex={tried ? 0 : undefined}
                          title={
                            tried
                              ? `${left} × ${right}\nAccuracy: ${pair.accuracy}%\nAvg time: ${(pair.averageResponseTimeMs / 1000).toFixed(1)}s\nScore: ${pair.weaknessScore}`
                              : `${left} × ${right} · not attempted`
                          }
                          className={cn(
                            "size-9 rounded-md text-center font-mono tabular-nums transition-transform sm:size-10",
                            tried
                              ? cn(bandFor(pair.weaknessScore).cell, "cursor-default hover:scale-110 hover:ring-1 hover:ring-foreground/30")
                              : "bg-secondary/60 text-muted-foreground/40"
                          )}
                        >
                          {tried ? pair.weaknessScore : "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
            {bands.map((b) => (
              <li key={b.label} className="flex items-center gap-2">
                <span className={cn("size-3.5 rounded", b.swatch)} /> {b.label}
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span className="size-3.5 rounded bg-secondary/60" /> Not attempted
            </li>
          </ul>
        </CardContent>
      </Card>
    </Page>
  );
}
