"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, RotateCcw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AccentTile, accentStyle } from "@/components/common/accent-tile";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { usePlayFocus } from "@/components/layout/use-play-focus";
import { Board } from "@/features/games/game2048/components/board";
import { formatDuration } from "@/features/games/game2048/components/format";
import { StatsPanel } from "@/features/games/game2048/components/stats-panel";
import { useSwipe } from "@/features/games/game2048/components/use-swipe";
import { Button, buttonVariants } from "@/components/ui/button";
import { useStudyActivity } from "@/features/timer/components/use-study-activity";
import { useLocalStore, useViewerInfo } from "@/features/auth/components/viewer-provider";
import { emptyCells } from "@/features/games/game2048/lib/engine";
import { applyMove, continuePlaying, freezeForStorage, hasProgress, liftBest, newGame, resetBest, startClock, stopClock, toSessionData, undo } from "@/features/games/game2048/lib/game";
import { computeStats } from "@/features/games/game2048/lib/stats";
import { clearGame, loadBest, loadGame, loadHistory, saveBest, saveGame, saveSession, type StoredSession } from "@/features/games/game2048/lib/storage";
import { syncGame2048 } from "@/features/games/game2048/lib/sync";
import { advanceTiles, tilesFromGrid, type UiTile } from "@/features/games/game2048/lib/tiles";
import { ACCENT } from "@/lib/accent";
import { SIZE, type Direction, type GameState } from "@/features/games/game2048/lib/types";

type Tab = "play" | "stats";
type Dialog = "new" | "reset" | null;

const newClientId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `g48-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

const isTextEntry = (target: EventTarget | null): boolean => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** The board in words, for a screen reader: each row left to right, "empty" for a free cell. */
function describeGrid(grid: readonly number[]): string {
  const rows = Array.from({ length: SIZE }, (_, r) =>
    `row ${r + 1}: ${grid
      .slice(r * SIZE, r * SIZE + SIZE)
      .map((v) => (v === 0 ? "empty" : v))
      .join(", ")}`
  );
  return `2048 board. ${rows.join(". ")}.`;
}

function ScoreBox({ label, value, gain }: { label: string; value: number; gain?: { key: number; value: number } }) {
  return (
    <div className="relative min-w-[4.75rem] rounded-lg border border-border bg-card px-3 py-1.5 text-right shadow-card sm:min-w-[5.5rem]">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-semibold tabular-nums leading-tight">{value.toLocaleString()}</p>
      {gain && gain.value > 0 && (
        <span key={gain.key} className="g48-gain" aria-hidden>
          +{gain.value.toLocaleString()}
        </span>
      )}
    </div>
  );
}

export default function Game2048App() {
  const store = useLocalStore();
  const viewer = useViewerInfo();
  const userId = viewer.kind === "user" ? viewer.userId : null;

  const [game, setGame] = useState<GameState | null>(null);
  const [tiles, setTiles] = useState<UiTile[]>([]);
  const [gain, setGain] = useState({ key: 0, value: 0 });
  const [history, setHistory] = useState<StoredSession[] | null>(null);
  const [tab, setTab] = useState<Tab>("play");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [overDismissed, setOverDismissed] = useState(false);

  // The latest game and tiles, kept in refs as well as state so that several key presses in one frame each see the
  // result of the one before (state alone would hand every handler the same stale board).
  const gameRef = useRef<GameState | null>(null);
  const tilesRef = useRef<UiTile[]>([]);
  const nextIdRef = useRef(1);
  const recordedRef = useRef<string | null>(null);

  /** Replaces the game outright (a new game, or one restored from storage), redrawing the tiles from the board. */
  const install = useCallback((state: GameState) => {
    const fresh = tilesFromGrid(state.grid, nextIdRef.current);
    gameRef.current = state;
    tilesRef.current = fresh.tiles;
    nextIdRef.current = fresh.nextId;
    setGame(state);
    setTiles(fresh.tiles);
    setOverDismissed(false);
  }, []);

  // ---- Loading ---------------------------------------------------------------

  // Everything lives in localStorage, so it is read after mount to keep the first render the same on server and client.
  useEffect(() => {
    if (!store) return;
    const timer = setTimeout(() => {
      const stored = loadHistory(store);
      setHistory(stored);
      const best = loadBest(store) ?? computeStats(stored).highScore;
      const saved = loadGame(store);
      const now = Date.now();
      install(saved ? startClock(liftBest(saved, best), now) : newGame(newClientId(), now, Math.random, best));
    }, 0);
    return () => clearTimeout(timer);
  }, [store, install]);

  // An account also has games from its other devices: bring them in (and send anything waiting) once per visit.
  useEffect(() => {
    if (!store || userId === null) return;
    let cancelled = false;
    syncGame2048(userId, { pull: true }).then((outcome) => {
      if (!cancelled && outcome.ok) setHistory(loadHistory(store));
    });
    return () => {
      cancelled = true;
    };
  }, [store, userId]);

  // ---- Saving ----------------------------------------------------------------------

  /** Saves an ended or given-up game to the history and tells the account about it. */
  const record = useCallback(
    (g: GameState) => {
      if (!store || recordedRef.current === g.clientId) return;
      recordedRef.current = g.clientId;
      saveSession(store, toSessionData(g, Date.now()));
      setHistory(loadHistory(store));
      if (userId !== null) void syncGame2048(userId);
    },
    [store, userId]
  );

  useEffect(() => {
    if (!store || !game) return;
    if (game.status === "over") {
      record(game);
      clearGame(store);
    } else {
      saveGame(store, freezeForStorage(game, Date.now()));
    }
    saveBest(store, game.best);
  }, [store, game, record]);

  // Time with the page hidden or closed is not played time: the clock stops when the page goes away and starts again on return.
  useEffect(() => {
    const set = (next: (g: GameState, now: number) => GameState) => {
      const current = gameRef.current;
      if (!current) return;
      const updated = next(current, Date.now());
      if (updated === current) return;
      gameRef.current = updated;
      setGame(updated);
    };
    const onChange = () => set(document.visibilityState === "hidden" ? stopClock : startClock);
    const onHide = () => set(stopClock);
    document.addEventListener("visibilitychange", onChange);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // ---- Actions ---------------------------------------------------------------------

  const play = useCallback((direction: Direction) => {
    const current = gameRef.current;
    if (!current) return;
    const out = applyMove(current, direction, Date.now(), Math.random);
    if (!out.result) return;
    const advanced = advanceTiles(tilesRef.current, out.result, out.spawn, nextIdRef.current);
    gameRef.current = out.state;
    tilesRef.current = advanced.tiles;
    nextIdRef.current = advanced.nextId;
    setGame(out.state);
    setTiles(advanced.tiles);
    if (out.result.gained > 0) setGain((g) => ({ key: g.key + 1, value: out.result!.gained }));
  }, []);

  const undoMove = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    const back = undo(current, Date.now());
    if (back === current) return;
    install(back);
    setGain((g) => ({ key: g.key + 1, value: 0 }));
  }, [install]);

  const keepPlaying = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    const next = continuePlaying(current, Date.now());
    if (next !== current) install(next);
  }, [install]);

  const startNew = useCallback(() => {
    const current = gameRef.current;
    if (current && current.status !== "over" && hasProgress(current)) record(current);
    if (store) clearGame(store);
    setGain((g) => ({ key: g.key + 1, value: 0 }));
    install(newGame(newClientId(), Date.now(), Math.random, current?.best ?? 0));
  }, [store, record, install]);

  /** New game, asking first when there is a game worth keeping. */
  const requestNew = useCallback(() => {
    const current = gameRef.current;
    if (current && current.status !== "over" && hasProgress(current)) setDialog("new");
    else startNew();
  }, [startNew]);

  const doResetBest = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    install(resetBest(current));
    setDialog(null);
  }, [install]);

  // ---- Keyboard --------------------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (dialog !== null || tab !== "play" || isTextEntry(event.target)) return;
      const key = event.key;

      // Ctrl/Cmd+Z undoes; every other chord is the browser's (reload, find, ...).
      if (event.ctrlKey || event.metaKey) {
        if (!event.altKey && !event.shiftKey && key.toLowerCase() === "z") {
          event.preventDefault();
          undoMove();
        }
        return;
      }
      if (event.altKey) return;

      const direction = KEY_DIRECTIONS[key] ?? KEY_DIRECTIONS[key.toLowerCase()];
      if (direction) {
        event.preventDefault();
        play(direction);
        return;
      }
      const lower = key.toLowerCase();
      if (lower === "u") undoMove();
      else if (lower === "r") requestNew();
      else if (key === "Escape") {
        // Closes whichever overlay is showing: choosing to keep playing after a win, or looking at the final board.
        if (gameRef.current?.status === "won") keepPlaying();
        else if (gameRef.current?.status === "over") setOverDismissed(true);
      } else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, tab, play, undoMove, requestNew, keepPlaying]);

  // ---- What to show -------------------------------------------------------------------

  const stats = useMemo(() => (history ? computeStats(history) : null), [history]);
  const status = game?.status ?? "playing";
  const showWin = status === "won";
  const showOver = status === "over" && !overDismissed;
  const canUndo = !!game?.previous && status !== "over";
  const highest = game ? Math.max(game.highestTile, ...game.grid) : 0;

  const overlay = game && (showWin || showOver) && (
    <div className="g48-overlay" role="dialog" aria-modal="false" aria-label={showWin ? "You reached 2048" : "Game over"}>
      {showWin ? (
        <div className="max-w-xs space-y-4 text-center">
          <p className="text-3xl font-semibold tracking-tight">You made 2048!</p>
          <p className="text-sm text-muted-foreground">
            Score <span className="font-mono font-semibold tabular-nums text-foreground">{game.score.toLocaleString()}</span> in {game.moves.toLocaleString()} moves. Keep going for a bigger tile, or start over.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={keepPlaying} autoFocus>
              Keep playing
            </Button>
            <Button size="lg" variant="outline" onClick={startNew}>
              New game
            </Button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-xs space-y-4 text-center">
          <p className="text-3xl font-semibold tracking-tight">Game over</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-card p-3 text-left text-sm shadow-card">
            <div>
              <dt className="text-xs text-muted-foreground">Final score</dt>
              <dd className="font-mono text-lg font-semibold tabular-nums">{game.score.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Best score</dt>
              <dd className="font-mono text-lg font-semibold tabular-nums">{game.best.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Highest tile</dt>
              <dd className="font-mono font-semibold tabular-nums">{highest.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Reached 2048</dt>
              <dd className="font-semibold">{game.reached2048 ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Moves</dt>
              <dd className="font-mono font-semibold tabular-nums">{game.moves.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Time</dt>
              <dd className="font-mono font-semibold tabular-nums">{formatDuration(game.elapsedMs)}</dd>
            </div>
          </dl>
          <Button size="lg" onClick={startNew} autoFocus>
            <RotateCcw /> Try again
          </Button>
        </div>
      )}
    </div>
  );

  const tabs = [
    { id: "play", label: "Play" },
    { id: "stats", label: "Your stats" },
  ] as const;

  const playing = tab === "play";
  // The first move starts the game: the intro and the settings are only there before it.
  const started = !!game && hasProgress(game);
  // 2048 has no natural end: the study timer waits for game over, or 3 minutes after it expires. Viewing the stats tab is a safe point.
  useStudyActivity({ active: started && status !== "over", endless: true, paused: !playing });
  const swipe = useSwipe(play, playing && dialog === null);

  // While playing, the page is exactly one screen tall and cannot scroll, so a swipe can only ever move tiles.
  usePlayFocus(playing);

  return (
    <div
      className={cn("container", playing ? "play-screen touch-none flex flex-col py-3 sm:py-4" : "py-5 sm:py-8")}
      style={{ "--g48": ACCENT.game2048 } as React.CSSProperties}
      {...(playing ? swipe : {})}
    >
      <div className={cn("mx-auto w-full max-w-lg", playing ? "play-landscape flex min-h-0 flex-1 flex-col gap-3" : "space-y-4")}>
        <div data-timer-clear="soft" className="flex flex-wrap items-start justify-between gap-x-3 gap-y-3">
          <div className="flex shrink-0 items-center gap-3">
            {/* Once a game is under way the "Back to Games" row below is gone, and on phones the tab bar is hidden while playing. */}
            {playing && started && (
              <Link href="/#games" aria-label="Back to Games" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "-ml-2 pointer-coarse:size-11")}>
                <ArrowLeft />
              </Link>
            )}
            <AccentTile id="game2048" active />
            <h1 className="accent-label text-3xl font-semibold tracking-tight sm:text-4xl" data-active style={accentStyle("game2048")}>
              2048
            </h1>
          </div>
          <div className="ml-auto flex shrink-0 gap-2" aria-label="Scores">
            <ScoreBox label="Score" value={game?.score ?? 0} gain={gain} />
            <ScoreBox label="Best" value={game?.best ?? 0} />
          </div>
        </div>
        {(!playing || !started) && <p className="text-sm text-muted-foreground">Slide the tiles. When two with the same number touch, they merge into one. Reach 2048!</p>}

        <div role="tablist" aria-label="2048" className="grid w-full shrink-0 grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`g48-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`g48-panel-${id}`}
              onClick={() => setTab(id)}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-sm font-medium transition-colors pointer-coarse:h-10",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                tab === id ? "bg-background text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="g48-panel-play" aria-labelledby="g48-tab-play" hidden={!playing} className={cn(playing && "play-panel flex min-h-0 flex-1 flex-col gap-3")}>
          {/* The board takes whatever height is left and is as large a square as fits in it. */}
          <div className="play-stage min-h-0 flex-1">
            <div className="play-square">
              <Board tiles={tiles} overlay={overlay || undefined} description={game ? describeGrid(game.grid) : "2048 board"} />
            </div>
          </div>

          <p role="status" aria-live="polite" className="sr-only">
            Score {game?.score ?? 0}. Highest tile {highest}. {emptyCells(game?.grid ?? []).length} empty cells.
            {showWin ? " You made 2048." : ""}
            {status === "over" ? " Game over." : ""}
          </p>

          {status === "over" && overDismissed && (
            <p className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm shadow-card" role="status">
              <span>
                Game over · score <span className="font-mono font-semibold tabular-nums">{game?.score.toLocaleString()}</span>
              </span>
              <Button size="sm" onClick={startNew}>
                Try again
              </Button>
            </p>
          )}

          <div data-timer-clear="soft" className="grid shrink-0 grid-cols-2 gap-2">
            <Button variant="outline" size="lg" onClick={undoMove} disabled={!canUndo}>
              <Undo2 /> Undo
            </Button>
            <Button size="lg" onClick={requestNew}>
              <Plus /> New game
            </Button>
          </div>

          <p className="shrink-0 text-center text-xs text-muted-foreground">
            <span className="hidden sm:inline pointer-coarse:hidden">Arrow keys or W A S D to slide · U or Ctrl+Z to undo · R for a new game · dragging with the mouse works too.</span>
            <span className="sm:hidden pointer-coarse:inline">Swipe anywhere to slide. Undo takes back your last move.</span>
          </p>

          {/* Before the first move only: once a game is under way nothing here can change it mid-play. */}
          {!started && (
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
              <Link href="/#games" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
                <ArrowLeft /> Back to Games
              </Link>

              <details className="rounded-xl border border-border bg-card px-3 py-1.5 text-sm shadow-card open:w-full open:px-4 open:py-3">
                <summary className="cursor-pointer list-none font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">Settings</summary>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">Best score</p>
                    <p className="text-xs text-muted-foreground">Starts it over from the score of this game. Your game history is kept.</p>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => setDialog("reset")}>
                    Reset best
                  </Button>
                </div>
              </details>
            </div>
          )}
        </div>

        <div role="tabpanel" id="g48-panel-stats" aria-labelledby="g48-tab-stats" hidden={tab !== "stats"}>
          {tab === "stats" && <StatsPanel stats={stats} />}
        </div>
      </div>

      {dialog === "new" && (
        <ConfirmDialog
          title="Start a new game?"
          message="Your current game is unfinished. It is saved in your history, and you start again from an empty board."
          confirmLabel="New game"
          destructive
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            startNew();
          }}
        />
      )}
      {dialog === "reset" && (
        <ConfirmDialog
          title="Reset your best score?"
          message="Your best score is set back, to the score of the game you are playing. This cannot be undone. Your finished games stay in your history."
          confirmLabel="Reset best score"
          cancelLabel="Keep it"
          destructive
          onCancel={() => setDialog(null)}
          onConfirm={doResetBest}
        />
      )}
    </div>
  );
}

