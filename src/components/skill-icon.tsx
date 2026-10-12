import { Divide, Minus, Percent, Plus, Slash, SquareRadical, X, type LucideIcon } from "lucide-react";
import type { Skill } from "@/lib/skills/types";

export const SKILL_ICONS: Record<Skill, LucideIcon> = {
  multiplication: X,
  addition: Plus,
  subtraction: Minus,
  // Fractions already use the ÷ glyph, so division gets a slash to keep the cards distinguishable.
  division: Slash,
  percentage: Percent,
  fraction: Divide,
  square: SquareRadical,
};

export function SkillIcon({ skill, className }: { skill: Skill; className?: string }) {
  const Icon = SKILL_ICONS[skill];
  return <Icon className={className} aria-hidden />;
}
