import {
  Atom, Bird, Bot, Brain, Calculator, Cat, Compass, Crown, Dog, Fish, Flame, Gem, Ghost, Infinity as InfinityIcon, Leaf, Moon, Mountain, Orbit,
  Panda, Pi, Puzzle, Rabbit, Rocket, Sigma, Squirrel, Sun, Telescope, Trophy, Turtle, Zap, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseAvatar, type AvatarId } from "@/features/profile/lib/profile";

/** Full class names (not built up from parts) so Tailwind sees them. Each pair is readable in light and dark mode. */
const TONES = {
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
} as const;

const AVATARS: Record<AvatarId, { icon: LucideIcon; label: string; tone: keyof typeof TONES }> = {
  brain: { icon: Brain, label: "Brain", tone: "violet" },
  atom: { icon: Atom, label: "Atom", tone: "sky" },
  pi: { icon: Pi, label: "Pi", tone: "indigo" },
  sigma: { icon: Sigma, label: "Sigma", tone: "teal" },
  infinity: { icon: InfinityIcon, label: "Infinity", tone: "violet" },
  calculator: { icon: Calculator, label: "Calculator", tone: "emerald" },
  rocket: { icon: Rocket, label: "Rocket", tone: "rose" },
  zap: { icon: Zap, label: "Lightning", tone: "amber" },
  flame: { icon: Flame, label: "Flame", tone: "orange" },
  crown: { icon: Crown, label: "Crown", tone: "amber" },
  trophy: { icon: Trophy, label: "Trophy", tone: "amber" },
  gem: { icon: Gem, label: "Gem", tone: "sky" },
  cat: { icon: Cat, label: "Cat", tone: "orange" },
  dog: { icon: Dog, label: "Dog", tone: "amber" },
  rabbit: { icon: Rabbit, label: "Rabbit", tone: "rose" },
  panda: { icon: Panda, label: "Panda", tone: "emerald" },
  squirrel: { icon: Squirrel, label: "Squirrel", tone: "orange" },
  turtle: { icon: Turtle, label: "Turtle", tone: "teal" },
  bird: { icon: Bird, label: "Bird", tone: "sky" },
  fish: { icon: Fish, label: "Fish", tone: "indigo" },
  ghost: { icon: Ghost, label: "Ghost", tone: "violet" },
  bot: { icon: Bot, label: "Robot", tone: "teal" },
  moon: { icon: Moon, label: "Moon", tone: "indigo" },
  sun: { icon: Sun, label: "Sun", tone: "amber" },
  leaf: { icon: Leaf, label: "Leaf", tone: "emerald" },
  mountain: { icon: Mountain, label: "Mountain", tone: "sky" },
  compass: { icon: Compass, label: "Compass", tone: "rose" },
  telescope: { icon: Telescope, label: "Telescope", tone: "indigo" },
  puzzle: { icon: Puzzle, label: "Puzzle", tone: "emerald" },
  orbit: { icon: Orbit, label: "Orbit", tone: "violet" },
};

export const avatarLabel = (id: string): string => AVATARS[parseAvatar(id)].label;

/**
 * A profile picture: an icon on a tinted disc. `className` sets the size (for example `size-14`); the icon fills
 * about half of it. Decorative: the person's name sits next to it wherever it is shown.
 */
export function Avatar({ id, className }: { id: string; className?: string }) {
  const { icon: Icon, tone } = AVATARS[parseAvatar(id)];
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full", TONES[tone], className)}>
      <Icon className="size-1/2" />
    </span>
  );
}
