import { cn } from "@/lib/utils";

/** The Mathz mark: a 2x2 grid of tiles holding + − × ÷. Follows the theme colours. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("text-foreground", className)}>
      <rect x="0" y="0" width="15" height="15" rx="3.5" fill="currentColor" />
      <rect x="17" y="0" width="15" height="15" rx="3.5" fill="currentColor" opacity="0.6" />
      <rect x="0" y="17" width="15" height="15" rx="3.5" fill="currentColor" opacity="0.6" />
      <rect x="17" y="17" width="15" height="15" rx="3.5" fill="currentColor" />
      <g fill="none" stroke="var(--background)" strokeWidth="2.4" strokeLinecap="round">
        <path d="M4.5 7.5h6M7.5 4.5v6" />
        <path d="M21.5 7.5h6" />
        <path d="M5.5 21.5l4 4M9.5 21.5l-4 4" />
        <path d="M21.5 24.5h6" />
      </g>
      <g fill="var(--background)">
        <circle cx="24.5" cy="21" r="1.3" />
        <circle cx="24.5" cy="28" r="1.3" />
      </g>
    </svg>
  );
}
