"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Eye, Lightbulb, Pause, Pencil, Play, Redo2, RotateCcw, Sparkles, Undo2, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/form/choice-controls";
import { accentStyle } from "@/components/common/accent-tile";
import { Board } from "@/features/games/sudoku/components/board";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { NumberPad } from "@/features/games/sudoku/components/number-pad";
import { ACCENT } from "@/lib/accent";
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
  restartGame,
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
  "flex h-12 flex-col items-center sm:h-14 justify-center gap-1 rounded-lg border border-border bg-card text-[11px] font-medium text-muted-foreground shadow-card transition-[background-color,color,border-color,transform] duration-150 select-none touch-manipulation",
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
}

export function GameScreen({ initial, settings, onSettingsChange, onChange, onEnd, onLeave, onAbandon }: GameScreenProps) {
  const [game, setGame] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState("");
  const [checked, setChecked] = useState<{ cells: CellState[]; result: CheckResult } | null>(null);
  const endedRef = useRef(false);

  const playing = game.status === "playing";
  const paused = game.status === "paused";
  const finished = game.status === "completed" || game.status === "revealed";

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

  const hint = useCallback(() => {
    const result = giveHint(game, selected, Date.now());
    if (result.index === null) return;
    setGame(result.state);
    setSelected(result.index);
    setNotice(`Hint: row ${rowOf(result.index) + 1}, column ${colOf(result.index) + 1} is ${result.state.cells[result.index].value}.`);
  }, [game, selected]);

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
      if (dialog !== null || isTextEntry(event.target)) return;
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
  }, [dialog, playing, enter, erase, move, doUndo, doRedo]);

  // ---- What to show -------------------------------------------------------------------

  const errors = useMemo(() => {
    const shown = settings.highlight === "instant" ? checkBoard(game) : checked && checked.cells === game.cells ? checked.result : null;
    const set = new Set<number>();
    if (shown) for (const i of [...shown.conflicts, ...shown.incorrect]) if (!isGiven(game, i)) set.add(i);
    return set;
  }, [game, settings.highlight, checked]);

  const counts = useMemo(() => digitCounts(game.cells), [game.cells]);
  const coveredBoard = paused;

  return (
    <div className="container py-4 sm:py-8">
      <div className="mx-auto grid max-w-xl gap-4 lg:max-w-5xl lg:grid-cols-[minmax(0,34rem)_20rem] lg:justify-center lg:gap-8">
        <section aria-label="Game" className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => onLeave(game)}>
              <ArrowLeft /> Back
            </Button>
            <h1 className="flex items-baseline gap-2 text-base font-semibold tracking-tight">
              <span className="accent-label" data-active style={accentStyle("sudoku")}>
                Sudoku
              </span>
              <span className="text-sm font-medium text-muted-foreground">{DIFFICULTY_LABEL[game.difficulty]}</span>
            </h1>
            <Button variant="outline" size="sm" onClick={() => setGame((g) => (g.status === "paused" ? resumeGame(g, Date.now()) : pauseGame(g, Date.now())))} disabled={finished} aria-label={paused ? "Resume" : "Pause"}>
              {paused ? <Play /> : <Pause />}
              <Clock game={game} />
            </Button>
          </div>

          <dl className="flex items-center justify-between gap-3 text-sm" aria-label="Game statistics">
            <div className="flex gap-4">
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
            </div>
            <p role="status" aria-live="polite" className="min-h-5 truncate text-right text-xs text-muted-foreground">
              {notice}
            </p>
          </dl>

          <div className="relative">
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
        </section>

        <aside aria-label="Controls" className="min-w-0 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <button type="button" className={toolButton} onClick={doUndo} disabled={!playing || game.undoStack.length === 0} aria-label="Undo">
              <Undo2 className="size-5" aria-hidden />
              Undo
            </button>
            <button type="button" className={toolButton} onClick={doRedo} disabled={!playing || game.redoStack.length === 0} aria-label="Redo">
              <Redo2 className="size-5" aria-hidden />
              Redo
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
            <button type="button" className={toolButton} onClick={hint} disabled={!playing} aria-label="Hint">
              <Lightbulb className="size-5" aria-hidden />
              Hint
            </button>
          </div>

          <NumberPad counts={counts} notesMode={notesMode} disabled={!playing} onDigit={enter} onErase={erase} />

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={check} disabled={!playing}>
              <Check /> Check
            </Button>
            <Button variant="outline" size="sm" onClick={() => setGame((g) => fillCandidates(g, Date.now()))} disabled={!playing}>
              <WandSparkles /> Auto notes
            </Button>
            <Button variant="outline" size="sm" onClick={() => (hasProgress(game) ? setDialog("restart") : setGame((g) => restartGame(g, Date.now())))} disabled={finished}>
              <RotateCcw /> Restart
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDialog("reveal")} disabled={finished}>
              <Eye /> Show solution
            </Button>
            <Button variant="secondary" size="sm" className="col-span-2" onClick={() => (hasProgress(game) ? setDialog("new") : onAbandon(game))}>
              <Sparkles /> New game
            </Button>
          </div>

          <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-card">
            <summary className="cursor-pointer list-none font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">Assistance settings</summary>
            <div className="mt-4 space-y-4">
              <Switch
                label="Mark wrong entries as I go"
                hint="Off: duplicates and wrong digits are only shown when you press Check"
                checked={settings.highlight === "instant"}
                onChange={(on) => onSettingsChange({ ...settings, highlight: on ? "instant" : "check" })}
              />
              <Switch label="Count mistakes" hint="Wrong digits are counted as they are entered" checked={settings.trackMistakes} onChange={(trackMistakes) => onSettingsChange({ ...settings, trackMistakes })} />
            </div>
          </details>

          <p className="hidden text-xs text-muted-foreground lg:block">
            Keys: 1–9 enter · Backspace erase · arrows move · N notes · Ctrl+Z undo · Ctrl+Y redo
          </p>
        </aside>
      </div>

      {dialog === "restart" && (
        <ConfirmDialog
          title="Restart this puzzle?"
          message="Your entries, notes, hints and mistakes are cleared and the timer starts again. The puzzle stays the same."
          confirmLabel="Restart"
          destructive
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setGame((g) => restartGame(g, Date.now()));
            setSelected(null);
            setChecked(null);
            setDialog(null);
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
