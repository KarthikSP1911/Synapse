import { db } from "@/db";
import { pairStatistics } from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tables" };

export default async function TablesPage() {
  const pairs = await db.select().from(pairStatistics);

  // create a lookup map
  const pairMap = new Map<string, InferSelectModel<typeof pairStatistics>>();
  for (const p of pairs) {
    pairMap.set(`${p.leftNumber}x${p.rightNumber}`, p);
  }

  const numbers = Array.from({ length: 20 }, (_, i) => i + 1);

  // Helper to determine color based on weakness score
  // Low score (0) = strong = green/neutral
  // High score (100) = critical = red/orange
  const getColor = (score?: number) => {
    if (score === undefined) return "bg-card"; // not attempted
    if (score < 20) return "bg-green-500/20 text-green-500 border-green-500/30";
    if (score < 40) return "bg-emerald-500/20 text-emerald-500 border-emerald-500/30";
    if (score < 60) return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
    if (score < 80) return "bg-orange-500/20 text-orange-500 border-orange-500/30";
    return "bg-destructive/20 text-destructive border-destructive/30";
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tables Performance</h1>
        <p className="text-muted-foreground">Interactive heatmap of all multiplication pairs. Red indicates weak areas needing practice.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Performance Matrix</CardTitle>
          <CardDescription>Hover over a cell to see detailed pair statistics.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-4">
            <div className="inline-block min-w-max">
              {/* Header row */}
              <div className="flex">
                <div className="w-12 h-12 flex items-center justify-center font-bold border-b border-r border-border bg-muted/50">&times;</div>
                {numbers.map(n => (
                  <div key={`header-${n}`} className="w-12 h-12 flex items-center justify-center font-bold border-b border-border bg-muted/20">
                    {n}
                  </div>
                ))}
              </div>
              
              {/* Grid */}
              {numbers.map(left => (
                <div key={`row-${left}`} className="flex">
                  <div className="w-12 h-12 flex items-center justify-center font-bold border-r border-border bg-muted/20">
                    {left}
                  </div>
                  {numbers.map(right => {
                    const pairData = pairMap.get(`${left}x${right}`);
                    
                    return (
                      <div 
                        key={`cell-${left}-${right}`}
                        title={pairData ? `${left} × ${right}\nAccuracy: ${pairData.accuracy}%\nAvg Time: ${pairData.averageResponseTimeMs}ms\nScore: ${pairData.weaknessScore}` : "Unattempted"}
                        className={`w-12 h-12 flex items-center justify-center text-xs border border-border/50 transition-colors hover:brightness-125 ${getColor(pairData?.weaknessScore)}`}
                      >
                        {pairData?.weaknessScore !== undefined ? pairData.weaknessScore : "-"}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex items-center space-x-6 mt-8 text-sm">
            <div className="flex items-center space-x-2"><div className="w-4 h-4 bg-green-500/20 border border-green-500/30"></div><span>Strong</span></div>
            <div className="flex items-center space-x-2"><div className="w-4 h-4 bg-yellow-500/20 border border-yellow-500/30"></div><span>Developing</span></div>
            <div className="flex items-center space-x-2"><div className="w-4 h-4 bg-destructive/20 border border-destructive/30"></div><span>Critical</span></div>
            <div className="flex items-center space-x-2"><div className="w-4 h-4 bg-card border border-border"></div><span>Unattempted</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
