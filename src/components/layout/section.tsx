"use client";

import { createContext, useContext } from "react";
import { HelpTip } from "@/components/form/help-tip";

/** Inside a Customize disclosure (already a card) sections lose their own card, so they are not boxes inside a box. */
export const BareSections = createContext(false);

export function Section({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const bare = useContext(BareSections);
  const Heading = bare ? "h3" : "h2";
  return (
    <section className={bare ? undefined : "rounded-xl border border-border bg-card p-5 shadow-card"} aria-label={title}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-0.5">
          <Heading className={bare ? "text-sm font-medium" : "text-[15px] font-semibold tracking-tight"}>{title}</Heading>
          {/* The explanation is there when asked for, not always on screen. */}
          {description && <HelpTip label={title}>{description}</HelpTip>}
        </div>
        {aside}
      </div>
      <div className={bare ? "mt-3" : "mt-4"}>{children}</div>
    </section>
  );
}
