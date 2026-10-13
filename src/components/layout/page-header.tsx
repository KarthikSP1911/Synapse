import { AccentTile, accentStyle } from "@/components/common/accent-tile";
import { cn } from "@/lib/utils";
import type { AccentId } from "@/lib/accent";

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  className?: string;
  /** The skill or game this page is for: shows its tile in the active state beside the title, and the title in its accent. */
  accent?: AccentId;
}

export function PageHeader({ title, description, eyebrow, actions, className, accent }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="space-y-1.5">
        {eyebrow && <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{eyebrow}</p>}
        {accent ? (
          <div className="flex items-center gap-4">
            <AccentTile id={accent} active />
            <h1 className="accent-label text-3xl font-semibold tracking-tight sm:text-4xl" data-active style={accentStyle(accent)}>
              {title}
            </h1>
          </div>
        ) : (
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        )}
        {description && <p className="max-w-2xl text-balance text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children, className, narrow }: { children: React.ReactNode; className?: string; narrow?: boolean }) {
  return (
    <div className={cn("container py-10 sm:py-14", narrow && "max-w-3xl", className)}>
      <div className="space-y-8">{children}</div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "success" | "warning" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
