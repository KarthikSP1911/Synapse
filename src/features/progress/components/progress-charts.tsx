"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface SessionPoint {
  label: string;
  accuracy: number;
  avgSeconds: number;
}

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };
const axisLine = { stroke: "var(--border)" };

export default function ProgressCharts({ data }: { data: SessionPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="grid h-48 place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Complete at least two sessions to see your trend.
      </div>
    );
  }

  return (
    <div className="h-72 w-full" role="img" aria-label="Accuracy and average response time per session">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={axisLine} tickLine={false} tickMargin={8} />
          <YAxis yAxisId="acc" domain={[0, 100]} unit="%" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis yAxisId="time" orientation="right" unit="s" tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ stroke: "var(--input)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
              fontSize: 12,
              boxShadow: "var(--shadow-pop)",
            }}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Line yAxisId="acc" type="monotone" dataKey="accuracy" name="Accuracy (%)" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line yAxisId="time" type="monotone" dataKey="avgSeconds" name="Avg time (s)" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
