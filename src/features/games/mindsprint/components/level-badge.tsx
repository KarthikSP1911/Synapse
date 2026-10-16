"use client";

import { cn } from "@/lib/utils";
import { difficultyLevel } from "@/features/games/mindsprint/lib/config";
import type { RoundConfig } from "@/features/games/mindsprint/lib/types";

export function LevelBadge({ config, className }: { config: RoundConfig; className?: string }) {
  const level = difficultyLevel(config);
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        level === "Easy" && "bg-success-soft text-success",
        level === "Medium" && "bg-warning-soft text-warning",
        (level === "Hard" || level === "Expert") && "bg-destructive-soft text-destructive",
        className
      )}
    >
      {level}
    </span>
  );
}
