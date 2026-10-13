"use client";

import { Check, Eye, RotateCcw, Sparkles, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/form/choice-controls";
import type { SudokuSettings } from "@/features/games/sudoku/lib/types";

/** The less frequent actions of a game and its assistance settings. Inline beside the board on desktop, in the "More" sheet on phones. */
export function GameActions({
  playing,
  finished,
  onCheck,
  onAutoNotes,
  onRestart,
  onReveal,
  onNew,
  onClose,
  className,
}: {
  playing: boolean;
  finished: boolean;
  onCheck: () => void;
  onAutoNotes: () => void;
  onRestart: () => void;
  onReveal: () => void;
  onNew: () => void;
  /** Called first by every action, so the sheet that holds them closes before a confirmation opens. */
  onClose?: () => void;
  className?: string;
}) {
  const run = (action: () => void) => () => {
    onClose?.();
    action();
  };
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={run(onCheck)} disabled={!playing}>
        <Check /> Check
      </Button>
      <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={run(onAutoNotes)} disabled={!playing}>
        <WandSparkles /> Auto notes
      </Button>
      <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={run(onRestart)} disabled={finished}>
        <RotateCcw /> Restart
      </Button>
      <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={run(onReveal)} disabled={finished}>
        <Eye /> Show solution
      </Button>
      <Button variant="secondary" size="sm" className="col-span-2 pointer-coarse:h-11" onClick={run(onNew)}>
        <Sparkles /> New game
      </Button>
    </div>
  );
}

export function AssistanceSwitches({ settings, onChange }: { settings: SudokuSettings; onChange: (settings: SudokuSettings) => void }) {
  return (
    <div className="space-y-4">
      <Switch
        label="Mark wrong entries as I go"
        hint="Off: duplicates and wrong digits are only shown when you press Check"
        checked={settings.highlight === "instant"}
        onChange={(on) => onChange({ ...settings, highlight: on ? "instant" : "check" })}
      />
      <Switch label="Count mistakes" hint="Wrong digits are counted as they are entered" checked={settings.trackMistakes} onChange={(trackMistakes) => onChange({ ...settings, trackMistakes })} />
    </div>
  );
}
