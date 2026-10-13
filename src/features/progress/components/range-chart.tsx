"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RangeBucket } from "@/features/progress/lib/square-range";

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };

/** Accuracy per range of numbers. Ranges with no attempts show as empty. */
export default function RangeChart({ data, label }: { data: RangeBucket[]; label: string }) {
  return (
    <div className="h-64 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: "var(--border)" }} tickLine={false} tickMargin={8} />
          <YAxis domain={[0, 100]} unit="%" tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            formatter={(value, name) => (name === "Accuracy" ? [`${value}%`, name] : [value, name])}
            labelFormatter={(range, payload) => {
              const attempts = payload?.[0]?.payload?.attempts ?? 0;
              return attempts > 0 ? `${range} · ${attempts} answered` : `${range} · not attempted`;
            }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
              fontSize: 12,
              boxShadow: "var(--shadow-pop)",
            }}
          />
          <Bar dataKey="accuracy" name="Accuracy" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
