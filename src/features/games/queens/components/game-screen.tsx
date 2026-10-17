"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Ellipsis, Eraser, Pause, Play, Redo2, RotateCcw, Sparkles, Undo2 } from "lucide-react";
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
import { Board } from "@/features/games/queens/components/board";
import { boardOf, checkBoard, clearBoard, giveHint, hasProgress, markCells, pauseGame, queensOn, redo, resumeGame, setCell, tapCell, undo } from "@/features/games/queens/lib/game";
import { conflictingQueens } from "@/features/games/queens/lib/grid";
import { describeConflict } from "@/features/games/queens/lib/hints";
import { regionCells } from "@/features/games/queens/lib/grid";
import { CROSS, EMPTY, QUEEN, type Conflict, type GameState, type Mark, type QueensSettings } from "@/features/games/queens/lib/types";

type Dialog = "restart" | "new" | null;

/** The less frequent actions of a game. Inline beside the board on desktop, in the "More" sheet on phones. */
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

export function AssistanceSwitches({ settings, onChange }: { settings: QueensSettings; onChange: (settings: QueensSettings) => void }) {
  return (
    <Switch
      label="Auto-check"
      hint="Mark queens that break a rule as soon as they are placed. Off: use Check to see conflicts"
      checked={settings.autoCheck}
      onChange={(autoCheck) => onChange({ ...settings, autoCheck })}
    />
  );
}

export function GameScreen({ initial, settings, onSettingsChange, onChange, onEnd, onLeave, onAbandon, onNewPuzzle }: PlayScreenProps<GameState, QueensSettings>) {
  const [game, setGame] = useState(initial);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState("");
  const [checked, setChecked] = useState<{ cells: readonly Mark[]; conflicts: Conflict[] } | null>(null);
  const endedRef = useRef(false);
  // The latest state, readable at once: a hint is worked out from it and charged before the state changes.
  const latest = useRef(initial);
  useEffect(() => {
    latest.current = game;
  }, [game]);
  const scope = puzzleHintScope("queens", game);
  const paid = usePaidHint({ chargeScope: scope, cooldownScope: scope });

  const playing = game.status === "playing";
  const paused = game.status === "paused";
  const finished = game.status === "completed";

  // Below `lg` the play screen is exactly one screen tall (and the header and tab bar are out of the way on phones).
  usePlayFocus(true, "(width < 64rem)");

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
    const timer = setInterval(() => onChange(game), 15_000);
    return () => clearInterval(timer);
  }, [playing, game, onChange]);

  // Switching away stops the clock and covers the board, as leaving the page does.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") setGame((g) => pauseGame(g, Date.now()));
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onHidden);
    };
  }, []);

  // Messages fade after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // ---- Actions ---------------------------------------------------------------

  const board = useMemo(() => boardOf(game), [game.size, game.regions]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = useCallback((index: number) => setGame((g) => tapCell(g, index, Date.now())), []);
  const set = useCallback((index: number, mark: typeof EMPTY | typeof CROSS | typeof QUEEN) => setGame((g) => setCell(g, index, mark, Date.now())), []);
  const mark = useCallback((indices: number[], to: typeof CROSS | typeof EMPTY) => setGame((g) => markCells(g, indices, to, Date.now())), []);
  const doUndo = useCallback(() => setGame((g) => undo(g)), []);
  const doRedo = useCallback(() => setGame((g) => redo(g)), []);
  const requestPaid = paid.request;
  /**
   * The order matters. First the hint is worked out without touching anything; if there is none to give (the same wrong queen
   * asked about twice, a finished game) nothing is charged and no cooldown starts. Only then is the price taken, and the hint is
   * shown only if that succeeded. The wallet also enforces the cooldown, so a second press, key or tap during it is refused.
   */
  const hint = useCallback(() => {
    const current = latest.current;
    const next = giveHint(current, Date.now());
    if (next.hintsUsed === current.hintsUsed) return;
    if (!requestPaid(next.hintsUsed).ok) return;
    latest.current = next;
    setGame(next);
  }, [requestPaid]);

  const check = useCallback(() => {
    const result = checkBoard(game);
    setChecked({ cells: game.cells, conflicts: result.conflicts });
    setNotice(
      result.conflicts.length > 0
        ? `${describeConflict(result.conflicts[0], board)}${result.conflicts.length > 1 ? ` And ${result.conflicts.length - 1} more.` : ""}`
        : result.queens === game.size
          ? "Everything fits."
          : `No rule is broken so far. ${game.size - result.queens} ${game.size - result.queens === 1 ? "queen" : "queens"} to go.`
    );
  }, [game, board]);

  // ---- Keyboard (the board handles its own keys) ----------------------------------

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
      else if (lower === "c" && !settings.autoCheck) check();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, more, playing, settings.autoCheck, doUndo, doRedo, hint, check]);

  // ---- What to show -------------------------------------------------------------------

  const conflicts = useMemo(() => {
    const shown = settings.autoCheck ? checkBoard(game).conflicts : checked && checked.cells === game.cells ? checked.conflicts : [];
    return conflictingQueens(shown);
  }, [game, settings.autoCheck, checked]);

  const hintUnitCells = useMemo(() => {
    const set = new Set<number>();
    if (!game.hint) return set;
    const groups = regionCells(board.reg, board.n);
    for (const id of game.hint.units) {
      const index = Number(id.slice(1));
      if (id[0] === "r") for (let c = 0; c < board.n; c++) set.add(index * board.n + c);
      else if (id[0] === "c") for (let r = 0; r < board.n; r++) set.add(r * board.n + index);
      else for (const cell of groups[index]) set.add(cell);
    }
    return set;
  }, [game.hint, board]);

  const queens = queensOn(game.cells).length;
  const allPlaced = queens === game.size && !finished;
  const message = finished ? "Solved!" : (game.hint?.text ?? notice) || (allPlaced && !settings.autoCheck ? "All queens are placed. Press Check to see if the board is right." : "");

  const actions = {
    onRestart: () => (hasProgress(game) ? setDialog("restart") : onNewPuzzle(game)),
    onNew: () => (hasProgress(game) && !finished ? setDialog("new") : onAbandon(game)),
  };

  return (
    <div className="play-screen play-below-lg sdk-screen py-3 lg:container lg:py-8" data-won={finished ? "true" : undefined}>
      <div className="sdk-layout mx-auto flex min-h-0 w-full flex-1 flex-col gap-2 lg:grid lg:max-w-5xl lg:flex-none lg:grid-cols-[minmax(0,34rem)_20rem] lg:justify-center lg:gap-8">
        <section aria-label="Game" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:block lg:flex-none lg:space-y-3">
          <div data-timer-clear="soft" className="sdk-side flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" className="-ml-2 pointer-coarse:h-11" onClick={() => onLeave(game)} aria-label="Back">
              <ArrowLeft /> <span className="hidden sm:inline short:hidden">Back</span>
            </Button>
            <h1 className="flex min-w-0 items-baseline gap-2 truncate text-base font-semibold tracking-tight">
              <span className="accent-label" data-active style={accentStyle("queens")}>
                Queens
              </span>
              <span className="truncate text-sm font-medium text-muted-foreground">{DIFFICULTY_LABEL[game.difficulty]}</span>
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="pointer-coarse:h-11"
                onClick={() => setGame((g) => (g.status === "paused" ? resumeGame(g, Date.now()) : pauseGame(g, Date.now())))}
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

          {/* A message (a hint's explanation, a check result) covers the counters instead of costing a row of its own. */}
          <div data-timer-clear="soft" className="sdk-side relative min-h-8 text-sm">
            <dl className="flex h-full items-center gap-4" aria-label="Game statistics">
              <div className="flex items-baseline gap-1.5">
                <dt className="text-muted-foreground">Queens</dt>
                <dd className="font-mono font-semibold tabular-nums">
                  {queens}/{game.size}
                </dd>
              </div>
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
              <Board size={game.size} regions={board.reg} cells={game.cells} conflicts={conflicts} hint={game.hint} hintUnitCells={hintUnitCells} covered={paused} won={finished} onTap={tap} onSet={set} onMark={mark} />
              {finished && <WinBurst accent="queens" />}
              {paused && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="space-y-3 text-center">
                    <p className="text-xl font-semibold tracking-tight">Paused</p>
                    <Button size="lg" onClick={() => setGame((g) => resumeGame(g, Date.now()))} autoFocus>
                      <Play /> Resume
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside aria-label="Controls" className="min-w-0 space-y-2 lg:space-y-3">
          <div data-timer-clear="soft" className={cn("sdk-side grid gap-2", settings.autoCheck ? "grid-cols-4" : "grid-cols-5")}>
            <button type="button" className={toolButton} onClick={doUndo} disabled={!playing || game.undoStack.length === 0} aria-label="Undo">
              <Undo2 className="size-5" aria-hidden />
              Undo
            </button>
            <button type="button" className={toolButton} onClick={doRedo} disabled={!playing || game.redoStack.length === 0} aria-label="Redo">
              <Redo2 className="size-5" aria-hidden />
              Redo
            </button>
            <HintToolButton hint={paid} onClick={hint} disabled={!playing} />
            <button type="button" className={toolButton} onClick={() => setGame((g) => clearBoard(g, Date.now()))} disabled={!playing || game.cells.every((m) => m === EMPTY)} aria-label="Clear board">
              <Eraser className="size-5" aria-hidden />
              Clear
            </button>
            {!settings.autoCheck && (
              <button type="button" className={toolButton} onClick={check} disabled={!playing} aria-label="Check the board">
                <Check className="size-5" aria-hidden />
                Check
              </button>
            )}
          </div>

          <HintStatusLine hint={paid} className="sdk-side" />

          {/* On phones these live in the "More" sheet. */}
          <div className="hidden space-y-3 lg:block">
            <GameActions playing={playing} finished={finished} {...actions} />

            <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-card">
              <summary className="cursor-pointer list-none font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">Assistance settings</summary>
              <div className="mt-4">
                <AssistanceSwitches settings={settings} onChange={onSettingsChange} />
              </div>
            </details>

            <p className="text-xs text-muted-foreground">Tap: cross out, then queen, then clear. Drag across empty squares to cross them out. Keys: arrows move · Space cycles · Q queen · X cross · Backspace clear · H hint · Ctrl+Z undo · Ctrl+Y redo</p>
          </div>
        </aside>
      </div>

      {more && (
        <MoreSheet title="More" onClose={() => setMore(false)}>
          <GameActions playing={playing} finished={finished} {...actions} onClose={() => setMore(false)} />
          <div>
            <h3 className="mb-3 text-sm font-semibold">Assistance</h3>
            <AssistanceSwitches settings={settings} onChange={onSettingsChange} />
          </div>
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
            onNewPuzzle(game);
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
            onAbandon(game);
          }}
        />
      )}
    </div>
  );
}
