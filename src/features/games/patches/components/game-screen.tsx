"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCheck, Ellipsis, Eraser, Pause, Play, Redo2, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Chip, Switch } from "@/components/form/choice-controls";
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
import { Board } from "@/features/games/patches/components/board";
import { patchColors } from "@/features/games/patches/lib/colors";
import { sizeFor } from "@/features/games/patches/lib/generator";
import {
  checkBoard,
  commitPatch,
  conflicts,
  hasProgress,
  pauseGame,
  puzzleFor,
  redo,
  remaining,
  removePatch,
  resetPatches,
  resumeGame,
  undo,
  type Conflicts,
} from "@/features/games/patches/lib/game";
import { deliverHint } from "@/features/games/patches/lib/hints";
import type { DraftCheck } from "@/features/games/patches/lib/rules";
import type { GameState, PatchesSettings } from "@/features/games/patches/lib/types";
import { DIFFICULTIES } from "@/features/games/patches/lib/types";

type Dialog = "restart" | "new" | null;

function GameActions({ playing, finished, hasPatches, onRestart, onNew, onReset, onClose }: { playing: boolean; finished: boolean; hasPatches: boolean; onRestart: () => void; onNew: () => void; onReset: () => void; onClose?: () => void }) {
  const run = (action: () => void) => () => {
    onClose?.();
    action();
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={run(onReset)} disabled={!playing || !hasPatches}>
        <Eraser /> Reset
      </Button>
      <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={run(onRestart)} disabled={finished || !playing}>
        <RotateCcw /> Restart
      </Button>
      <Button variant="secondary" size="sm" className="pointer-coarse:h-11" onClick={run(onNew)}>
        <Sparkles /> New game
      </Button>
    </div>
  );
}

/** The switches that apply while playing. */
export function DisplaySwitches({ settings, onChange }: { settings: PatchesSettings; onChange: (settings: PatchesSettings) => void }) {
  return (
    <div className="grid gap-4">
      <Switch label="Auto-check" hint="Mark a clue or cell the moment no patch can serve it any more (off: draw freely, press Check when you want to know)" checked={settings.autoCheck} onChange={(autoCheck) => onChange({ ...settings, autoCheck })} />
      <Switch label="Show cells left" hint="Count the cells still to cover under the board" checked={settings.showRemaining} onChange={(showRemaining) => onChange({ ...settings, showRemaining })} />
    </div>
  );
}

/** The setup screen's assistance section: the same switches, and which board size new games use. */
export function AssistanceSwitches({ settings, onChange }: { settings: PatchesSettings; onChange: (settings: PatchesSettings) => void }) {
  return (
    <>
      <DisplaySwitches settings={settings} onChange={onChange} />
      <div role="group" aria-label="Board size" className="space-y-2">
        <p className="text-sm font-medium">Board size</p>
        <div className="grid grid-cols-2 gap-2">
          <Chip active={!settings.larger} onClick={() => onChange({ ...settings, larger: false })}>
            Standard
          </Chip>
          <Chip active={settings.larger} onClick={() => onChange({ ...settings, larger: true })}>
            Larger
          </Chip>
        </div>
        <p className="text-xs text-muted-foreground">
          {DIFFICULTIES.map((d) => `${DIFFICULTY_LABEL[d]} ${sizeFor(d, settings.larger)}×${sizeFor(d, settings.larger)}`).join(" · ")}
        </p>
      </div>
    </>
  );
}

const HELP = "Drag across the board to draw a patch that holds exactly one clue and matches it. A number is the area; a symbol is the shape (square, wide, tall, or freeform: drag across its cells); a plain dot says nothing: any rectangle. Each clue has its own colour, and its patch is filled with it. Drag from the edge of a patch to resize it, draw over a patch to replace it, tap a patch to erase it.";

export function GameScreen({ initial, settings, onSettingsChange, onChange, onEnd, onLeave, onAbandon, onNewPuzzle }: PlayScreenProps<GameState, PatchesSettings>) {
  const [game, setGame] = useState(initial);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState("");
  const [soft, setSoft] = useState(false);
  /** The patches on the board when Check was pressed, so what it found is shown until the board changes. */
  const [checked, setChecked] = useState<{ patches: GameState["patches"]; marks: Conflicts } | null>(null);
  const endedRef = useRef(false);
  // The latest state, updated as soon as a change is made: a gesture can deliver several changes before React renders.
  const latest = useRef(initial);
  const scope = puzzleHintScope("patches", game);
  const paid = usePaidHint({ chargeScope: scope, cooldownScope: scope });

  const playing = game.status === "playing";
  const paused = game.status === "paused";
  const finished = game.status === "completed";
  const puzzle = useMemo(() => puzzleFor(game.puzzle), [game.puzzle]);
  const colors = useMemo(() => patchColors(game.solution, puzzle.clues.length, puzzle.rows, puzzle.cols), [game.solution, puzzle]);

  // Below `lg` the play screen is exactly one screen tall (and the header and tab bar are out of the way on phones).
  usePlayFocus(true, "(width < 64rem)");

  const update = useCallback((change: (g: GameState) => GameState, quiet = false) => {
    const next = change(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    setGame(next);
    setSoft(quiet);
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

  // Switching away stops the clock and covers the board, as leaving the page does.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") update((g) => pauseGame(g, Date.now()));
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

  const commit = useCallback(
    (cells: number[]): DraftCheck | null => {
      const result = commitPatch(latest.current, cells, Date.now());
      if (result.refused) {
        setNotice(result.refused.message);
        return result.refused;
      }
      if (result.state !== latest.current) {
        latest.current = result.state;
        setGame(result.state);
        setSoft(false);
        setNotice("");
      }
      return null;
    },
    []
  );
  const remove = useCallback((clue: number) => update((g) => removePatch(g, clue, Date.now()), true), [update]);
  const doUndo = useCallback(() => update((g) => undo(g), true), [update]);
  const doRedo = useCallback(() => update((g) => redo(g), true), [update]);
  const doReset = useCallback(() => update((g) => resetPatches(g, Date.now()), true), [update]);
  const requestPaid = paid.request;
  /**
   * The hint is worked out first without changing anything; if there is none to give, nothing is charged and no cooldown
   * starts. Only then is the price taken, and the hint is shown only if that succeeded. The wallet also enforces the cooldown.
   */
  const hint = useCallback(() => {
    const delivery = deliverHint(latest.current, requestPaid);
    if (delivery.outcome === "none") setNotice("There is nothing more to point out until the board changes.");
    if (delivery.state === latest.current) return;
    latest.current = delivery.state;
    setGame(delivery.state);
  }, [requestPaid]);

  const doCheck = useCallback(() => {
    const result = checkBoard(latest.current);
    setNotice(result.message);
    setChecked({ patches: latest.current.patches, marks: result.conflicts });
  }, []);

  // ---- Keyboard ------------------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (dialog !== null || more || isTextEntry(event.target)) return;
      const lower = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (lower === "z" && !event.shiftKey) doUndo();
        else if (lower === "y" || (lower === "z" && event.shiftKey)) doRedo();
        else return;
        event.preventDefault();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || !playing) return;
      if (lower === "h") hint();
      else if (lower === "c") doCheck();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, more, playing, doUndo, doRedo, hint, doCheck]);

  // ---- What to show -------------------------------------------------------------------

  const marks = useMemo(() => {
    if (checked && checked.patches === game.patches) return checked.marks;
    return settings.autoCheck && !finished ? conflicts(game) : null;
  }, [checked, game, settings.autoCheck, finished]);
  const shownMarks = marks && (marks.clues.length > 0 || marks.cells.length > 0) ? marks : null;
  const left = remaining(game);
  const message = finished ? "Solved!" : (game.hint?.text ?? notice) || (shownMarks ? "Striped cells or a marked clue have no room left. Adjust a patch near them." : "");

  const actions = {
    onReset: doReset,
    onRestart: () => (hasProgress(game) ? setDialog("restart") : onNewPuzzle(latest.current)),
    onNew: () => (hasProgress(game) && !finished ? setDialog("new") : onAbandon(game)),
  };

  return (
    <div className="play-screen play-below-lg sdk-screen py-3 lg:container lg:py-8" data-won={finished ? "true" : undefined}>
      <div className="sdk-layout mx-auto flex min-h-0 w-full flex-1 flex-col gap-2 lg:grid lg:max-w-5xl lg:flex-none lg:grid-cols-[minmax(0,34rem)_20rem] lg:justify-center lg:gap-8">
        <section aria-label="Game" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:block lg:flex-none lg:space-y-3">
          <div data-timer-clear="soft" className="sdk-side flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" className="-ml-2 pointer-coarse:h-11" onClick={() => onLeave(latest.current)} aria-label="Back">
              <ArrowLeft /> <span className="hidden sm:inline short:hidden">Back</span>
            </Button>
            <h1 className="flex min-w-0 items-baseline gap-2 truncate text-base font-semibold tracking-tight">
              <span className="accent-label" data-active style={accentStyle("patches")}>
                Patches
              </span>
              <span className="truncate text-sm font-medium text-muted-foreground">{DIFFICULTY_LABEL[game.difficulty]}</span>
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="pointer-coarse:h-11"
                onClick={() => update((g) => (g.status === "paused" ? resumeGame(g, Date.now()) : pauseGame(g, Date.now())))}
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

          {/* A message (why a patch was refused, what a hint says) covers the counters instead of costing a row of its own. */}
          <div data-timer-clear="soft" className="sdk-side relative min-h-8 text-sm">
            <dl className="flex h-full items-center gap-4" aria-label="Game statistics">
              <div className="flex items-baseline gap-1.5">
                <dt className="text-muted-foreground">Patches</dt>
                <dd className="font-mono font-semibold tabular-nums">
                  {game.patches.length}/{puzzle.clues.length}
                </dd>
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
              <Board
                puzzle={puzzle}
                patches={game.patches}
                colors={colors}
                hint={game.hint}
                dead={shownMarks}
                covered={paused}
                won={finished}
                soft={soft}
                onCommit={commit}
                onRemove={remove}
                onNotice={setNotice}
              />
              {finished && <WinBurst accent="patches" />}
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
          <div data-timer-clear="soft" className="sdk-side grid grid-cols-4 gap-2">
            <button type="button" className={toolButton} onClick={doUndo} disabled={!playing || game.undoStack.length === 0} aria-label="Undo">
              <Undo2 className="size-5" aria-hidden />
              Undo
            </button>
            <button type="button" className={toolButton} onClick={doRedo} disabled={!playing || game.redoStack.length === 0} aria-label="Redo">
              <Redo2 className="size-5" aria-hidden />
              Redo
            </button>
            <HintToolButton hint={paid} onClick={hint} disabled={!playing} />
            <button type="button" className={toolButton} onClick={doCheck} disabled={!playing} aria-label="Check the board">
              <CheckCheck className="size-5" aria-hidden />
              Check
            </button>
          </div>

          <HintStatusLine hint={paid} className="sdk-side" />

          {/* On phones these live in the "More" sheet. */}
          <div className="hidden space-y-3 lg:block">
            <GameActions playing={playing} finished={finished} hasPatches={game.patches.length > 0} {...actions} />

            <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-card">
              <summary className="cursor-pointer list-none font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">Display settings</summary>
              <div className="mt-4">
                <DisplaySwitches settings={settings} onChange={onSettingsChange} />
              </div>
            </details>

            <p className="text-xs text-muted-foreground">{HELP} Keys: arrows move · Enter starts, places or erases · Esc cancels · Delete erases · H hint · C check · Ctrl+Z undo · Ctrl+Y redo</p>
          </div>
        </aside>
      </div>

      {more && (
        <MoreSheet title="More" onClose={() => setMore(false)}>
          <GameActions playing={playing} finished={finished} hasPatches={game.patches.length > 0} {...actions} onClose={() => setMore(false)} />
          <div>
            <h3 className="mb-3 text-sm font-semibold">Display</h3>
            <DisplaySwitches settings={settings} onChange={onSettingsChange} />
          </div>
          <p className="text-xs text-muted-foreground">{HELP}</p>
        </MoreSheet>
      )}

      {dialog === "restart" && (
        <ConfirmDialog
          title="Restart with a new puzzle?"
          message="This puzzle is given up and counts as an attempt. A different puzzle of the same difficulty starts right away."
          confirmLabel="Restart"
          destructive
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            onNewPuzzle(latest.current);
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
