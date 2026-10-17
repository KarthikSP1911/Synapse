"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useLocalStore, useViewerInfo } from "@/features/auth/components/viewer-provider";
import { useStudyActivity } from "@/features/timer/components/use-study-activity";
import { PuzzleResultScreen } from "@/features/games/shared/components/puzzle-result";
import { BURST_MS } from "@/features/games/shared/components/win-burst";
import { WinOverlay } from "@/features/games/shared/components/win-overlay";
import { PuzzleSetup } from "@/features/games/shared/components/puzzle-setup";
import { PuzzleStatsPanel } from "@/features/games/shared/components/puzzle-stats-panel";
import type { PuzzleGame, PuzzleKit } from "@/features/games/shared/components/puzzle-kit";
import type { SaveState } from "@/features/games/shared/components/result-parts";
import { DIFFICULTIES, DIFFICULTY_LABEL, newClientId, type Difficulty } from "@/features/games/shared/lib/puzzle-session";
import { elapsedAt } from "@/features/games/shared/lib/clock";
import type { PuzzleRecord } from "@/features/games/shared/lib/puzzle-stats";

type View = "setup" | "playing" | "result";
type Tab = "play" | "stats";

const TABS = [
  { id: "play", label: "Play" },
  { id: "stats", label: "Your stats" },
] as const;

/**
 * The shell of a puzzle game (Queens, Zip, Patches): setup, playing, result and the stats tab, plus saving, resuming and
 * uploading. The game itself comes in as a `PuzzleKit`. Opening the page changes nothing: a game is only saved
 * to history when it ends or is given up after being touched.
 */
export default function PuzzleApp<G extends PuzzleGame, S, D extends PuzzleRecord>({ kit }: { kit: PuzzleKit<G, S, D> }) {
  const { storage } = kit;
  const store = useLocalStore();
  const viewer = useViewerInfo();
  const userId = viewer.kind === "user" ? viewer.userId : null;

  const [view, setView] = useState<View>("setup");
  const [tab, setTab] = useState<Tab>("play");
  const [game, setGame] = useState<G | null>(null);
  const [saved, setSaved] = useState<G | null>(null);
  const [history, setHistory] = useState<D[] | null>(null);
  const [settings, setSettings] = useState<S>(kit.defaultSettings);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [result, setResult] = useState<{ data: D; previousBestMs: number | null; previousBestScore: number; saveState: SaveState } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  /** The win card is showing over the solved board. */
  const [winOpen, setWinOpen] = useState(false);
  const historyRef = useRef<D[] | null>(null);

  // The study timer waits for the puzzle to be solved or given up (Queens, Zip and Patches); a paused puzzle is a safe point.
  useStudyActivity({ active: view === "playing" && !!game && !result, paused: game?.status === "paused" });

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Preferences, history and the unfinished game live in localStorage, so they are read after mount to keep the first render identical on server and client.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettings(storage.loadSettings());
      setDifficulty(storage.loadDifficulty());
    }, 0);
    return () => clearTimeout(timer);
  }, [storage]);

  useEffect(() => {
    if (!store) return;
    const timer = setTimeout(() => {
      setHistory(storage.loadHistory(store));
      setSaved(storage.loadGame(store));
    }, 0);
    return () => clearTimeout(timer);
  }, [store, storage]);

  // An account also has games from its other devices: bring them in (and send anything waiting) once per visit.
  useEffect(() => {
    if (!store || userId === null) return;
    let cancelled = false;
    kit.sync(userId, { pull: true }).then((outcome) => {
      if (!cancelled && outcome.ok) setHistory(storage.loadHistory(store));
    });
    return () => {
      cancelled = true;
    };
  }, [store, userId, kit, storage]);

  const changeSettings = useCallback(
    (next: S) => {
      setSettings(next);
      storage.saveSettings(next);
    },
    [storage]
  );

  const changeDifficulty = useCallback(
    (next: Difficulty) => {
      setDifficulty(next);
      storage.saveDifficulty(next);
    },
    [storage]
  );

  /** Saves a game that ended and tells the account about it; returns whether the device accepted it. */
  const record = useCallback(
    (g: G): boolean => {
      if (!store) return false;
      const ok = storage.saveSession(store, kit.toSessionData(g, Date.now()));
      setHistory(storage.loadHistory(store));
      if (userId !== null) void kit.sync(userId);
      return ok;
    },
    [store, userId, kit, storage]
  );

  const persist = useCallback(
    (g: G) => {
      if (store && (g.status === "playing" || g.status === "paused")) storage.saveGame(store, kit.freeze(g, Date.now()));
    },
    [store, kit, storage]
  );

  /** Gives up a game: it counts as an attempt only if it was touched. */
  const discard = useCallback(
    (g: G) => {
      if (kit.hasProgress(g)) record(g);
      if (store) storage.clearGame(store);
      setSaved(null);
    },
    [store, kit, storage, record]
  );

  const begin = useCallback(
    (level: Difficulty) => {
      setGenerating(true);
      setFailed(false);
      // Let the "Building puzzle" label paint before the (short) search blocks the page.
      setTimeout(() => {
        try {
          const created = kit.newGame(level, newClientId(), Date.now(), settings);
          if (store) storage.saveGame(store, kit.freeze(created, Date.now()));
          setSaved(null);
          setGame(created);
          setResult(null);
          setWinOpen(false);
          setView("playing");
        } catch {
          setFailed(true);
        } finally {
          setGenerating(false);
        }
      }, 30);
    },
    [store, kit, storage, settings]
  );

  const start = useCallback(() => {
    if (saved) setConfirmDiscard(true);
    else begin(difficulty);
  }, [saved, begin, difficulty]);

  const resume = useCallback(() => {
    if (!saved) return;
    setGame(kit.resume(saved, Date.now()));
    setResult(null);
    setWinOpen(false);
    setView("playing");
  }, [saved, kit]);

  const end = useCallback(
    (g: G) => {
      const data = kit.toSessionData(g, Date.now());
      const own = (historyRef.current ?? []).filter((s) => s.difficulty === g.difficulty && s.completed);
      const previousBestMs = own.length === 0 ? null : Math.min(...own.map((s) => s.elapsedMs));
      const previousBestScore = own.reduce((best, s) => Math.max(best, kit.score(s as D).total), 0);
      const ok = record(g);
      if (store) storage.clearGame(store);
      setSaved(null);
      setResult({ data, previousBestMs, previousBestScore, saveState: ok ? "saved" : "failed" });
      // The board celebrates first; the win card follows (see the effect below).
    },
    [record, store, kit, storage]
  );

  const leave = useCallback(
    (g: G) => {
      if (result) {
        // Solved already (and saved): there is nothing to keep.
        setResult(null);
        setGame(null);
        setWinOpen(false);
        setView("setup");
        return;
      }
      const frozen = kit.freeze(g, Date.now());
      if (store) storage.saveGame(store, frozen);
      setSaved(frozen);
      setGame(null);
      setView("setup");
    },
    [store, kit, storage, result]
  );

  /** Restart: the same difficulty again, but a different puzzle. */
  const restart = useCallback(
    (g: G) => {
      discard(g);
      begin(g.difficulty);
    },
    [discard, begin]
  );

  const abandon = useCallback(
    (g: G) => {
      if (result) {
        setResult(null);
        setWinOpen(false);
      } else discard(g);
      setGame(null);
      setView("setup");
    },
    [discard, result]
  );

  // The win card opens once the board's own animation has played (at once if the player prefers reduced motion).
  useEffect(() => {
    if (!result || view !== "playing") return;
    const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setWinOpen(true), calm ? 0 : BURST_MS);
    return () => clearTimeout(timer);
  }, [result, view]);

  const stats = useMemo(() => (history ? kit.computeStats(history, saved?.difficulty ?? null) : null), [history, saved, kit]);
  const bestTimes = useMemo(() => Object.fromEntries(DIFFICULTIES.map((d) => [d, stats?.byDifficulty[d].bestTimeMs ?? null])) as Record<Difficulty, number | null>, [stats]);

  if (view === "playing" && game) {
    const Play = kit.PlayScreen;
    const won = result && winOpen ? result : null;
    return (
      <>
        <Play key={game.clientId + game.startedAt} initial={game} settings={settings} onSettingsChange={changeSettings} onChange={persist} onEnd={end} onLeave={leave} onAbandon={abandon} onNewPuzzle={restart} />
        {won && (
          <WinOverlay
            accent={kit.accent}
            noun={kit.noun}
            data={won.data}
            score={kit.score(won.data)}
            newBestTime={won.previousBestMs !== null && won.data.elapsedMs < won.previousBestMs}
            newBestScore={won.previousBestScore > 0 && kit.score(won.data).total > won.previousBestScore}
            firstSolve={won.previousBestMs === null}
            saveState={won.saveState}
            onPlayAgain={() => {
              setWinOpen(false);
              begin(won.data.difficulty);
            }}
            onChangeDifficulty={() => {
              setWinOpen(false);
              setResult(null);
              setGame(null);
              setView("setup");
            }}
            onDetails={() => {
              setWinOpen(false);
              setView("result");
            }}
            onClose={() => setWinOpen(false)}
          />
        )}
      </>
    );
  }

  if (view === "result" && result) {
    return (
      <PuzzleResultScreen
        accent={kit.accent}
        name={kit.name}
        noun={kit.noun}
        data={result.data}
        score={kit.score(result.data)}
        previousBestMs={result.previousBestMs}
        previousBestScore={result.previousBestScore}
        saveState={result.saveState}
        onReplay={() => begin(result.data.difficulty)}
        onChangeDifficulty={() => {
          setResult(null);
          setGame(null);
          setView("setup");
        }}
      />
    );
  }

  const Assistance = kit.Assistance;
  const prefix = kit.idPrefix;

  return (
    <div className="container space-y-6 py-8 sm:py-10">
      <PageHeader accent={kit.accent} title={kit.name} description={kit.description} />

      <div role="tablist" aria-label={kit.name} className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${prefix}-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`${prefix}-panel-${id}`}
            onClick={() => setTab(id)}
            className={cn(
              "flex h-8 items-center justify-center rounded-md text-sm font-medium transition-colors pointer-coarse:h-11",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              tab === id ? "bg-background text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${prefix}-panel-play`} aria-labelledby={`${prefix}-tab-play`} hidden={tab !== "play"}>
        <PuzzleSetup
          accent={kit.accent}
          idPrefix={prefix}
          difficulty={difficulty}
          onDifficulty={changeDifficulty}
          descriptions={kit.difficultyDescription}
          boardLabel={typeof kit.boardLabel === "function" ? kit.boardLabel(settings) : kit.boardLabel}
          bestTimes={bestTimes}
          saved={saved ? { difficulty: saved.difficulty, playedMs: elapsedAt(saved, 0), progress: kit.progressLabel(saved) } : null}
          assistance={<Assistance settings={settings} onChange={changeSettings} />}
          rules={kit.rules}
          generating={generating}
          failed={failed}
          onStart={start}
          onResume={resume}
        />
      </div>
      <div role="tabpanel" id={`${prefix}-panel-stats`} aria-labelledby={`${prefix}-tab-stats`} hidden={tab !== "stats"}>
        {tab === "stats" && <PuzzleStatsPanel stats={stats} initialDifficulty={difficulty} score={(s) => kit.score(s).total} noun={kit.noun} />}
      </div>

      {confirmDiscard && saved && (
        <ConfirmDialog
          title="Start a new game?"
          message={`Your unfinished ${DIFFICULTY_LABEL[saved.difficulty]} ${kit.noun} will be given up${kit.hasProgress(saved) ? " and counted as an attempt" : ""}.`}
          confirmLabel="Give it up"
          cancelLabel="Keep it"
          destructive
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            discard(saved);
            begin(difficulty);
          }}
        />
      )}
    </div>
  );
}
