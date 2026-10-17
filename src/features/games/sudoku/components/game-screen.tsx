"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Ellipsis, Eraser, Pause, Pencil, Play, Redo2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { accentStyle } from "@/components/common/accent-tile";
import { usePlayFocus } from "@/components/layout/use-play-focus";
import { Board } from "@/features/games/sudoku/components/board";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { AssistanceSwitches, GameActions } from "@/features/games/sudoku/components/game-actions";
import { MoreSheet } from "@/features/games/sudoku/components/more-sheet";
import { NumberPad } from "@/features/games/sudoku/components/number-pad";
import { ACCENT } from "@/lib/accent";
import { HintToolButton } from "@/features/games/shared/components/hint-button";
import { HintStatusLine } from "@/features/rewards/components/hint-controls";
import { puzzleHintScope, usePaidHint } from "@/features/rewards/components/use-paid-hint";
import {
  checkBoard,
  clearCell,
  digitCounts,
  elapsedAt,
  enterDigit,
  fillCandidates,
  hasProgress,
  isGiven,
  pauseGame,
  redo,
  resumeGame,
  revealSolution,
  undo,
  giveHint,
  type CheckResult,
} from "@/features/games/sudoku/lib/game";
import { colOf, rowOf } from "@/features/games/sudoku/lib/grid";
import { formatTime } from "@/features/games/sudoku/lib/scoring";
import { DIFFICULTY_LABEL, type CellState, type GameState, type SudokuSettings } from "@/features/games/sudoku/lib/types";

type Dialog = "restart" | "reveal" | "new" | null;

/** Re-renders once a second while `active`, returning the current time. Kept out of the board so it never repaints for a tick. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active]);
  return now;
}

function Clock({ game }: { game: GameState }) {
  const now = useNow(game.status === "playing");
  return <span className="font-mono tabular-nums">{formatTime(elapsedAt(game, now))}</span>;
}

const isTextEntry = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
};

const toolButton = cn(
  "flex h-12 flex-col items-center short:h-11 sm:h-14 justify-center gap-1 rounded-lg border border-border bg-card text-[11px] font-medium text-muted-foreground shadow-card transition-[background-color,color,border-color,transform] duration-150 select-none touch-manipulation",
  "hover:border-input hover:bg-accent hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-35",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
);

export interface GameScreenProps {
  /** The game to play. A game restored from storage arrives paused. */
  initial: GameState;
  settings: SudokuSettings;
  onSettingsChange: (settings: SudokuSettings) => void;
  /** Called with the state whenever it changes, for saving. */
  onChange: (game: GameState) => void;
  /** The puzzle was solved or its solution revealed. */
  onEnd: (game: GameState) => void;
  /** Back to the setup screen with the game kept. */
  onLeave: (game: GameState) => void;
  /** Back to the setup screen, giving this game up. */
  onAbandon: (game: GameState) => void;
  /** Restart: gives this game up (it counts as an attempt if it was touched) and starts a different puzzle of the same difficulty. */
  onNewPuzzle: (game: GameState) => void;
}

export function GameScreen({ initial, settings, onSettingsChange, onChange, onEnd, onLeave, onAbandon, onNewPuzzle }: GameScreenProps) {
  const [game, setGame] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState("");
  const [checked, setChecked] = useState<{ cells: CellState[]; result: CheckResult } | null>(null);
  const endedRef = useRef(false);
  // The latest state, readable at once: a hint is worked out from it and charged before the state changes.
  const latest = useRef(initial);
  useEffect(() => {
    latest.current = game;
  }, [game]);
  const scope = puzzleHintScope("sudoku", game);
  const paid = usePaidHint({ chargeScope: scope, cooldownScope: scope });

  const playing = game.status === "playing";
  const paused = game.status === "paused";
  const finished = game.status === "completed" || game.status === "revealed";

  // Below `lg` the play screen is exactly one screen tall (and the header and tab bar are out of the way on phones).
  usePlayFocus(true, "(width < 64rem)");

  // ---- Saving, ending, pausing -------------------------------------------

  useEffect(() => {
    onChange(game);
  }, [game, onChange]);

  useEffect(() => {
    if (!finished || endedRef.current) return;
    endedRef.current = true;
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

  // Messages ("Hint: ...", "Check: ...") fade after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // ---- Actions ---------------------------------------------------------------

  const entryOptions = useMemo(() => ({ notes: notesMode, trackMistakes: settings.trackMistakes }), [notesMode, settings.trackMistakes]);

  const select = useCallback((index: number | null) => setSelected(index), []);

  const enter = useCallback(
    (digit: number) => {
      if (selected === null) {
        setNotice("Select a cell first.");
        return;
      }
      setGame((g) => enterDigit(g, selected, digit, Date.now(), entryOptions));
    },
    [selected, entryOptions]
  );

  const erase = useCallback(() => {
    if (selected === null) return;
    setGame((g) => clearCell(g, selected, Date.now()));
  }, [selected]);

  const doUndo = useCallback(() => setGame((g) => undo(g)), []);
  const doRedo = useCallback(() => setGame((g) => redo(g)), []);

  const requestPaid = paid.request;
  /**
   * The hint is worked out first without changing anything; if there is none to give (nothing wrong or empty left to reveal),
   * nothing is charged and no cooldown starts. Only then is the price taken, and the digit is revealed only if that succeeded.
   * The wallet also enforces the cooldown, so a second press, key or tap during it is refused.
   */
  const hint = useCallback(() => {
    const result = giveHint(latest.current, selected, Date.now());
    if (result.index === null) return;
    if (!requestPaid(result.state.hintsUsed).ok) return;
    latest.current = result.state;
    setGame(result.state);
    setSelected(result.index);
    setNotice(`Hint: row ${rowOf(result.index) + 1}, column ${colOf(result.index) + 1} is ${result.state.cells[result.index].value}.`);
  }, [selected, requestPaid]);

  const check = useCallback(() => {
    const result = checkBoard(game);
    setChecked({ cells: game.cells, result });
    const wrong = result.incorrect.length;
    setNotice(
      wrong > 0
        ? `${wrong} ${wrong === 1 ? "entry is" : "entries are"} wrong.`
        : result.conflicts.length > 0
          ? "Some digits repeat in a row, column or box."
          : result.empty > 0
            ? `No conflicts so far. ${result.empty} ${result.empty === 1 ? "cell" : "cells"} left.`
            : "Everything is correct."
    );
  }, [game]);

  const move = useCallback(
    (dRow: number, dCol: number) => {
      setSelected((current) => {
        if (current === null) return 40;
        const row = Math.min(8, Math.max(0, rowOf(current) + dRow));
        const col = Math.min(8, Math.max(0, colOf(current) + dCol));
        return row * 9 + col;
      });
    },
    []
  );

  // ---- Keyboard ------------------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (dialog !== null || more || isTextEntry(event.target)) return;
      const key = event.key;
      const mod = event.ctrlKey || event.metaKey;

      if (mod && !event.altKey) {
        const lower = key.toLowerCase();
        if (lower === "z" && !event.shiftKey) doUndo();
        else if (lower === "y" || (lower === "z" && event.shiftKey)) doRedo();
        else return;
        event.preventDefault();
        return;
      }
      if (event.altKey) return;

      if (/^[1-9]$/.test(key)) {
        if (!playing) return;
        enter(Number(key));
      } else if (key === "Backspace" || key === "Delete" || key === "0") {
        if (!playing) return;
        erase();
      } else if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
        if (!playing) return;
        move(key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0, key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0);
      } else if (key.toLowerCase() === "n" && !event.shiftKey) {
        if (!playing) return;
        setNotesMode((on) => !on);
      } else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, more, playing, enter, erase, move, doUndo, doRedo]);

  // ---- What to show -------------------------------------------------------------------

  const errors = useMemo(() => {
    const shown = settings.highlight === "instant" ? checkBoard(game) : checked && checked.cells === game.cells ? checked.result : null;
    const set = new Set<number>();
    if (shown) for (const i of [...shown.conflicts, ...shown.incorrect]) if (!isGiven(game, i)) set.add(i);
    return set;
  }, [game, settings.highlight, checked]);

  const counts = useMemo(() => digitCounts(game.cells), [game.cells]);
  const coveredBoard = paused;

  const actions = {
    onCheck: check,
    onAutoNotes: () => setGame((g) => fillCandidates(g, Date.now())),
    onRestart: () => (hasProgress(game) ? setDialog("restart") : onNewPuzzle(game)),
    onReveal: () => setDialog("reveal"),
    onNew: () => (hasProgress(game) ? setDialog("new") : onAbandon(game)),
  };

  return (
    <div className="play-screen play-below-lg sdk-screen py-3 lg:container lg:py-8">
      <div className="sdk-layout mx-auto flex min-h-0 w-full flex-1 flex-col gap-2 lg:grid lg:max-w-5xl lg:flex-none lg:grid-cols-[minmax(0,34rem)_20rem] lg:justify-center lg:gap-8">
        <section aria-label="Game" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:block lg:flex-none lg:space-y-3">
          <div data-timer-clear="soft" className="sdk-side flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" className="-ml-2 pointer-coarse:h-11" onClick={() => onLeave(game)} aria-label="Back">
              <ArrowLeft /> <span className="hidden sm:inline short:hidden">Back</span>
            </Button>
            <h1 className="flex min-w-0 items-baseline gap-2 truncate text-base font-semibold tracking-tight">
              <span className="accent-label" data-active style={accentStyle("sudoku")}>
                Sudoku
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
              <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setMore(true)} aria-label="More actions">
                <Ellipsis />
              </Button>
            </div>
          </div>

          {/* A message ("Hint: ...", "Check: ...") covers the counters for a few seconds instead of costing a row of its own. */}
          <div data-timer-clear="soft" className="sdk-side relative min-h-8 text-sm">
            <dl className="flex h-full items-center gap-4" aria-label="Game statistics">
              {settings.trackMistakes && (
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-muted-foreground">Mistakes</dt>
                  <dd className={cn("font-mono font-semibold tabular-nums", game.mistakes > 0 && "text-destructive")}>{game.mistakes}</dd>
                </div>
              )}
              <div className="flex items-baseline gap-1.5">
                <dt className="text-muted-foreground">Hints</dt>
                <dd className="font-mono font-semibold tabular-nums">{game.hintsUsed}</dd>
              </div>
            </dl>
            <p role="status" aria-live="polite" className={cn("absolute inset-0 flex items-center bg-background text-xs leading-4 text-muted-foreground", !notice && "invisible")}>
              <span className="line-clamp-2">{notice}</span>
            </p>
          </div>

          <div className="sdk-stage">
            <div className="sdk-square relative">
              <Board cells={game.cells} puzzle={game.puzzle} selected={selected} errors={errors} onSelect={select} covered={coveredBoard} />
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
          <div data-timer-clear="soft" className="sdk-side grid grid-cols-5 gap-2 lg:grid-cols-4">
            <button type="button" className={toolButton} onClick={doUndo} disabled={!playing || game.undoStack.length === 0} aria-label="Undo">
              <Undo2 className="size-5" aria-hidden />
              Undo
            </button>
            <button type="button" className={toolButton} onClick={doRedo} disabled={!playing || game.redoStack.length === 0} aria-label="Redo">
              <Redo2 className="size-5" aria-hidden />
              Redo
            </button>
            {/* From `lg` up Erase is a key of the number pad instead. */}
            <button type="button" className={cn(toolButton, "lg:hidden")} onClick={erase} disabled={!playing} aria-label="Erase">
              <Eraser className="size-5" aria-hidden />
              Erase
            </button>
            <button
              type="button"
              className={cn(toolButton, notesMode && "border-transparent bg-(--sdk) text-[#111111] hover:bg-(--sdk) hover:text-[#111111]")}
              style={{ "--sdk": ACCENT.sudoku } as React.CSSProperties}
              onClick={() => setNotesMode((on) => !on)}
              disabled={!playing}
              aria-pressed={notesMode}
              aria-label={`Pencil marks, ${notesMode ? "on" : "off"}`}
            >
              <Pencil className="size-5" aria-hidden />
              Notes {notesMode ? "on" : "off"}
            </button>
            <HintToolButton hint={paid} onClick={hint} disabled={!playing} />
          </div>

          <HintStatusLine hint={paid} className="sdk-side" />

          <NumberPad className="sdk-side" counts={counts} notesMode={notesMode} disabled={!playing} onDigit={enter} onErase={erase} />

          {/* On phones these live in the "More" sheet. */}
          <div className="hidden space-y-3 lg:block">
            <GameActions playing={playing} finished={finished} {...actions} />

            <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-card">
              <summary className="cursor-pointer list-none font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">Assistance settings</summary>
              <div className="mt-4">
                <AssistanceSwitches settings={settings} onChange={onSettingsChange} />
              </div>
            </details>

            <p className="text-xs text-muted-foreground">Keys: 1–9 enter · Backspace erase · arrows move · N notes · Ctrl+Z undo · Ctrl+Y redo</p>
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
      {dialog === "reveal" && (
        <ConfirmDialog
          title="Show the solution?"
          message="The whole solution is filled in and this game ends without being counted as solved."
          confirmLabel="Show solution"
          destructive
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setGame((g) => revealSolution(g, Date.now()));
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
            onAbandon(game);
          }}
        />
      )}
    </div>
  );
}
