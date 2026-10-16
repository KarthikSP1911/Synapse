"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProgressPoint } from "@/features/games/nback/lib/stats";
import { MODE_LABEL } from "@/features/games/nback/lib/types";

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };
const axisLine = { stroke: "var(--border)" };
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
  boxShadow: "var(--shadow-pop)",
};

type DotProps = { cx?: number; cy?: number; payload?: ProgressPoint };

/** A session that ended in Game Over is drawn as a cross, a finished one as a dot, so the two differ in shape and not only in colour. */
function Dot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined || !payload) return <g />;
  if (payload.outcome === "gameover") {
    return (
      <g stroke="var(--destructive)" strokeWidth={2} strokeLinecap="round">
        <line x1={cx - 4} y1={cy - 4} x2={cx + 4} y2={cy + 4} />
        <line x1={cx - 4} y1={cy + 4} x2={cx + 4} y2={cy - 4} />
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={3.5} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={1.5} />;
}

/** Accuracy (percent) or n over the sessions, oldest to newest. */
export default function ProgressChart({ data, metric }: { data: ProgressPoint[]; metric: "accuracy" | "n" }) {
  const isAccuracy = metric === "accuracy";
  const label = isAccuracy ? "Accuracy" : "n level";
  const latest = data[data.length - 1];
  return (
    <div className="h-56 w-full" role="img" aria-label={`${label} over ${data.length} sessions, latest ${latest ? (isAccuracy ? `${latest.accuracy}%` : latest.n) : "none"}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="index" tick={axisTick} axisLine={axisLine} tickLine={false} tickMargin={8} allowDecimals={false} />
          {isAccuracy ? <YAxis domain={[0, 100]} unit="%" tick={axisTick} axisLine={false} tickLine={false} /> : <YAxis domain={[1, 9]} allowDecimals={false} ticks={[1, 3, 5, 7, 9]} tick={axisTick} axisLine={false} tickLine={false} />}
          <Tooltip
            cursor={{ stroke: "var(--input)" }}
            contentStyle={tooltipStyle}
            labelFormatter={(index, payload) => {
              const point = payload?.[0]?.payload as ProgressPoint | undefined;
              return point ? `Session ${index} · ${new Date(point.endedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${MODE_LABEL[point.mode]}${point.outcome === "gameover" ? " · Game over" : ""}` : `Session ${index}`;
            }}
            formatter={(value) => [isAccuracy ? `${value}%` : value, label]}
          />
          <Line
            type={isAccuracy ? "monotone" : "stepAfter"}
            dataKey={metric}
            name={label}
            stroke={isAccuracy ? "var(--chart-1)" : "var(--chart-2)"}
            strokeWidth={2}
            dot={<Dot />}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
