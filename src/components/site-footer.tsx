"use client";

import { usePathname } from "next/navigation";

export function SiteFooter() {
  const pathname = usePathname();
  if (/^\/practice\/\d+$/.test(pathname)) return null;

  return (
    <footer className="border-t border-border">
      <div className="container flex flex-col gap-1 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Mathz · practice a little every day.</p>
        <p>
          Press <span className="kbd">Enter</span> to submit an answer.
        </p>
      </div>
    </footer>
  );
}
