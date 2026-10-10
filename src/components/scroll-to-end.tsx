"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** A horizontally scrolling box that starts scrolled to its right edge, where the newest data is. */
export function ScrollToEnd({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  return (
    <div ref={ref} className={cn("overflow-x-auto pb-2", className)}>
      {children}
    </div>
  );
}
