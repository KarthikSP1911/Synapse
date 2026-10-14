"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Ellipsis, Eraser, Pause, Play, Redo2, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/form/choice-controls";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { accentStyle } from "@/components/common/accent-tile";
import { usePlayFocus } from "@/components/layout/use-play-focus";
import { HintToolButton } from "@/features/games/shared/components/hint-button";
import { HintStatusLine } from "@/features/rewards/components/hint-controls";
import { puzzleHintScope, usePaidHint } from "@/features/rewards/components/use-paid-hint";
import { Clock, isTextEntry } from "@/features/games/shared/components/game-clock";
import { MoreSheet } from "@/features/games/shared/components/more-sheet";
import type { PlayScreenProps } from "@/features/games/shared/components/puzzle-kit";
import { toolButton } from "@/features/games/shared/components/tool-button";
import { DIFFICULTY_LABEL } from "@/features/games/shared/lib/puzzle-session";
import { WinBurst } from "@/features/games/shared/components/win-burst";
import { Board } from "@/features/games/zip/components/board";
import { lastNumberOpen, nextNumber } from "@/features/games/zip/lib/draw";
import {
  beginStroke,
  clearPath,
  dragTo,
  endStroke,
  giveHint,
  hasProgress,
  pauseGame,
  redo,
  refusal,
  remaining,
  restartGame,
  resumeGame,
  rulesFor,
  stepTo,
  undo,
  type Began,
} from "@/features/games/zip/lib/game";
import type { GameState, ZipSettings } from "@/features/games/zip/lib/types";

type Dialog = "restart" | "new" | null;

function GameActions({ playing, finished, onRestart, onNew, onClose }: { playing: boolean; finished: boolean; onRestart: () => void; onNew: () => void; onClose?: () => void }) {
  const run = (action: () => void) => () => {
    onClose?.();
    action();
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={run(onRestart)} disabled={finished || !playing}>
        <RotateCcw /> Restart
      </Button>
      <Button variant="secondary" size="sm" className="pointer-coarse:h-11" onClick={run(onNew)}>
        <Sparkles /> New game
      </Button>
    </div>
  );
}

export function AssistanceSwitches({ settings, onChange }: { settings: ZipSettings; onChange: (settings: ZipSettings) => void }) {
  return <Switch label="Show squares left" hint="Count the squares still to fill under the board" checked={settings.showRemaining} onChange={(showRemaining) => onChange({ ...settings, showRemaining })} />;
}

export function GameScreen({ initial, settings, onSettingsChange, onChange, onEnd, onLeave, onAbandon }: PlayScreenProps<GameState, ZipSettings>) {
  const [game, setGame] = useState(initial);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState("");
  const endedRef = useRef(false);
  // The latest state, updated as soon as a change is made: a drag can deliver several moves before React renders.
  const latest = useRef(initial);
  const scope = puzzleHintScope("zip", game);
  const paid = usePaidHint({ chargeScope: scope, cooldownScope: scope });

  const playing = game.status === "playing";
  const paused = game.status === "paused";
  const finished = game.status === "completed";
  const rules = useMemo(() => rulesFor(game.puzzle), [game.puzzle]);

  // Below `lg` the play screen is exactly one screen tall (and the header and tab bar are out of the way on phones).
  usePlayFocus(true, "(width < 64rem)");

  const update = useCallback((change: (g: GameState) => GameState) => {
    const next = change(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    setGame(next);
  }, []);

  /** Applies a move that can be refused, and says why when it is. */
  const attempt = useCallback((change: (g: GameState) => Began) => {
    const result = change(latest.current);
    if (result.state !== latest.current) {
      latest.current = result.state;
      setGame(result.state);
    }
    if (result.refused) setNotice(refusal(result.state, result.refused));
  }, []);

  // ---- Saving, ending, pausing -------------------------------------------

  useEffect(() => {
    onChange(game);
  }, [game, onChange]);

  useEffect(() => {
    if (!finished || endedRef.current) return;
    endedRef.current = true;
    // Saved the moment it is solved; the win card on top of the board is the shell's (see puzzle-app.tsx).
    onEnd(game);
  }, [finished, game, onEnd]);

  // Bank the elapsed time every so often, so a tab that is killed loses seconds, not minutes.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => onChange(latest.current), 15_000);
    return () => clearInterval(timer);
  }, [playing, onChange]);

  // Switching away stops the clock and covers the board, as leaving the page does. A stroke in progress ends first.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") update((g) => pauseGame(endStroke(g), Date.now()));
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onHidden);
    };
  }, [update]);

  // Messages fade after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // ---- Actions ---------------------------------------------------------------

  const begin = useCallback((cell: number) => attempt((g) => beginStroke(g, cell, Date.now())), [attempt]);
  const drag = useCallback((cell: number) => attempt((g) => dragTo(g, cell, Date.now())), [attempt]);
  const release = useCallback(() => update((g) => endStroke(g)), [update]);
  const doUndo = useCallback(() => update((g) => undo(g)), [update]);
  const doRedo = useCallback(() => update((g) => redo(g)), [update]);
  const requestPaid = paid.request;
  /**
   * The hint is worked out first without changing anything; if there is none to give, nothing is charged and no cooldown
   * starts. Only then is the price taken, and the hint is shown only if that succeeded. The wallet also enforces the cooldown.
   */
  const hint = useCallback(() => {
    const current = latest.current;
    const next = giveHint(current, Date.now());
    if (next.hintsUsed === current.hintsUsed) return;
    if (!requestPaid(next.hintsUsed).ok) return;
    latest.current = next;
    setGame(next);
  }, [requestPaid]);

  // ---- Keyboard ------------------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (dialog !== null || more || isTextEntry(event.target)) return;
      const key = event.key;
      const lower = key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (lower === "z" && !event.shiftKey) doUndo();
        else if (lower === "y" || (lower === "z" && event.shiftKey)) doRedo();
        else return;
        event.preventDefault();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || !playing) return;
      const g = latest.current;
      const { cols, rows } = rules.puzzle;
      if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
        if (g.path.length === 0) {
          attempt((s) => stepTo(s, rules.puzzle.checkpoints[0], Date.now()));
        } else {
          const head = g.path[g.path.length - 1];
          const r = Math.floor(head / cols) + (key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0);
          const c = (head % cols) + (key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0);
          if (r < 0 || r >= rows || c < 0 || c >= cols) return;
          attempt((s) => stepTo(s, r * cols + c, Date.now()));
        }
      } else if (key === "Backspace" || key === "Delete") {
        if (g.path.length > 1) attempt((s) => stepTo(s, s.path[s.path.length - 2], Date.now()));
        else update((s) => clearPath(s));
      } else if (lower === "h") hint();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, more, playing, rules, attempt, update, doUndo, doRedo, hint]);

  // ---- What to show -------------------------------------------------------------------

  const next = nextNumber(rules, game.path);
  const open = lastNumberOpen(rules, game.path);
  const left = remaining(game);
  const message = finished ? "Solved!" : (game.hint?.text ?? notice) || (open ? `The last number is open. Finish on ${rules.last}.` : "");

  const actions = {
    onRestart: () => (hasProgress(game) ? setDialog("restart") : update((g) => restartGame(g, Date.now()))),
    onNew: () => (hasProgress(game) && !finished ? setDialog("new") : onAbandon(game)),
  };

  return (
    <div className="play-screen play-below-lg sdk-screen py-3 lg:container lg:py-8" data-won={finished ? "true" : undefined}>
      <div className="sdk-layout mx-auto flex min-h-0 w-full flex-1 flex-col gap-2 lg:grid lg:max-w-5xl lg:flex-none lg:grid-cols-[minmax(0,34rem)_20rem] lg:justify-center lg:gap-8">
        <section aria-label="Game" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:block lg:flex-none lg:space-y-3">
          <div className="sdk-side flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" className="-ml-2 pointer-coarse:h-11" onClick={() => onLeave(latest.current)} aria-label="Back">
              <ArrowLeft /> <span className="hidden sm:inline short:hidden">Back</span>
            </Button>
            <h1 className="flex min-w-0 items-baseline gap-2 truncate text-base font-semibold tracking-tight">
              <span className="accent-label" data-active style={accentStyle("zip")}>
                Zip
              </span>
              <span className="truncate text-sm font-medium text-muted-foreground">{DIFFICULTY_LABEL[game.difficulty]}</span>
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="pointer-coarse:h-11"
                onClick={() => update((g) => (g.status === "paused" ? resumeGame(g, Date.now()) : pauseGame(endStroke(g), Date.now())))}
                disabled={finished}
                aria-label={paused ? "Resume" : "Pause"}
              >
                {paused ? <Play /> : <Pause />}
                <Clock game={game} />
              </Button>
              <Button variant="outline" size="icon" className="pointer-coarse:size-11 lg:hidden" onClick={() => setMore(true)} aria-label="More actions">
                <Ellipsis />
              </Button>
            </div>
          </div>

          {/* A message (why a move was refused, what a hint did) covers the counters instead of costing a row of its own. */}
          <div className="sdk-side relative min-h-8 text-sm">
            <dl className="flex h-full items-center gap-4" aria-label="Game statistics">
              <div className="flex items-baseline gap-1.5">
                <dt className="text-muted-foreground">Next</dt>
                <dd className="font-mono font-semibold tabular-nums">{next <= rules.last ? next : "✓"}</dd>
              </div>
              {settings.showRemaining && (
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-muted-foreground">Left</dt>
                  <dd className="font-mono font-semibold tabular-nums">{left}</dd>
                </div>
              )}
              <div className="flex items-baseline gap-1.5">
                <dt className="text-muted-foreground">Hints</dt>
                <dd className="font-mono font-semibold tabular-nums">{game.hintsUsed}</dd>
              </div>
            </dl>
            <p role="status" aria-live="polite" className={cn("absolute inset-0 flex items-center bg-background text-xs leading-4 text-muted-foreground", !message && "invisible")}>
              <span className="line-clamp-2">{message}</span>
            </p>
          </div>

          <div className="sdk-stage">
            <div className="sdk-square relative">
              <Board rules={rules} path={game.path} hint={game.hint} covered={paused} won={finished} onBegin={begin} onDrag={drag} onEnd={release} />
              {finished && <WinBurst accent="zip" />}
              {paused && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="space-y-3 text-center">
                    <p className="text-xl font-semibold tracking-tight">Paused</p>
                    <Button size="lg" onClick={() => update((g) => resumeGame(g, Date.now()))} autoFocus>
                      <Play /> Resume
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside aria-label="Controls" className="min-w-0 space-y-2 lg:space-y-3">
          <div className="sdk-side grid grid-cols-4 gap-2">
            <button type="button" className={toolButton} onClick={doUndo} disabled={!playing || game.undoStack.length === 0} aria-label="Undo">
              <Undo2 className="size-5" aria-hidden />
              Undo
            </button>
            <button type="button" className={toolButton} onClick={doRedo} disabled={!playing || game.redoStack.length === 0} aria-label="Redo">
              <Redo2 className="size-5" aria-hidden />
              Redo
            </button>
            <HintToolButton hint={paid} onClick={hint} disabled={!playing} />
            <button type="button" className={toolButton} onClick={() => update((g) => clearPath(g))} disabled={!playing || game.path.length === 0} aria-label="Clear path">
              <Eraser className="size-5" aria-hidden />
              Clear
            </button>
          </div>

          <HintStatusLine hint={paid} className="sdk-side" />

          {/* On phones these live in the "More" sheet. */}
          <div className="hidden space-y-3 lg:block">
            <GameActions playing={playing} finished={finished} {...actions} />

            <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-card">
              <summary className="cursor-pointer list-none font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">Display settings</summary>
              <div className="mt-4">
                <AssistanceSwitches settings={settings} onChange={onSettingsChange} />
              </div>
            </details>

            <p className="text-xs text-muted-foreground">
              Drag from 1 through the numbers in order, filling every square. The last number opens once all other squares are filled. Drag back over the path to erase it. Keys: arrows draw · Backspace steps back · H hint · Ctrl+Z undo · Ctrl+Y redo
            </p>
          </div>
        </aside>
      </div>

      {more && (
        <MoreSheet title="More" onClose={() => setMore(false)}>
          <GameActions playing={playing} finished={finished} {...actions} onClose={() => setMore(false)} />
          <div>
            <h3 className="mb-3 text-sm font-semibold">Display</h3>
            <AssistanceSwitches settings={settings} onChange={onSettingsChange} />
          </div>
          <p className="text-xs text-muted-foreground">Drag from 1 through the numbers in order, filling every square. The last number opens once all other squares are filled. Drag back over the path to erase it.</p>
        </MoreSheet>
      )}

      {dialog === "restart" && (
        <ConfirmDialog
          title="Restart this puzzle?"
          message="Your path and hints are cleared and the timer starts again. The puzzle stays the same."
          confirmLabel="Restart"
          destructive
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            update((g) => restartGame(g, Date.now()));
            setDialog(null);
          }}
        />
      )}
      {dialog === "new" && (
        <ConfirmDialog
          title="Start a new game?"
          message="This puzzle is unfinished. It is given up and counts as an attempt, and you choose the difficulty for the next one."
          confirmLabel="Give up"
          destructive
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            onAbandon(latest.current);
          }}
        />
      )}
    </div>
  );
}
