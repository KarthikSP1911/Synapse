import { cn } from "@/lib/utils";

/** The Timez mark: a rounded tile with a bold multiplication sign. Follows the theme colours. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("text-foreground", className)}>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        d="M10.5 10.5l11 11M21.5 10.5l-11 11"
        fill="none"
        stroke="var(--background)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
