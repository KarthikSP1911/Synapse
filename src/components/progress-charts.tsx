"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SessionPoint {
  label: string;
  accuracy: number;
  avgSeconds: number;
}

const axisTick = { fontSize: 11, fill: "currentColor" };

export default function ProgressCharts({ data }: { data: SessionPoint[] }) {
  if (data.length < 2) {
    return <p className="text-sm text-muted-foreground">Complete at least two sessions to see your trend.</p>;
  }

  return (
    <div className="h-72 w-full" role="img" aria-label="Accuracy and average response time per session">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} stroke="currentColor" strokeOpacity={0.3} />
          <YAxis yAxisId="acc" domain={[0, 100]} unit="%" tick={axisTick} stroke="currentColor" strokeOpacity={0.3} />
          <YAxis yAxisId="time" orientation="right" unit="s" tick={axisTick} stroke="currentColor" strokeOpacity={0.3} />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
            }}
          />
          <Legend />
          <Line yAxisId="acc" type="monotone" dataKey="accuracy" name="Accuracy (%)" stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line yAxisId="time" type="monotone" dataKey="avgSeconds" name="Avg time (s)" stroke="#f59e0b" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
