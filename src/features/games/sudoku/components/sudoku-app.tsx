"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { GameScreen } from "@/features/games/sudoku/components/game-screen";
import { ResultScreen } from "@/features/games/sudoku/components/result-screen";
import type { SaveState } from "@/features/games/shared/components/result-parts";
import { SetupScreen } from "@/features/games/sudoku/components/setup-screen";
import { StatsPanel } from "@/features/games/sudoku/components/stats-panel";
import { useLocalStore, useViewerInfo } from "@/features/auth/components/viewer-provider";
import { freezeForStorage, hasProgress, newGame, resumeGame, toSessionData } from "@/features/games/sudoku/lib/game";
import { generatePuzzle } from "@/features/games/sudoku/lib/generator";
import { computeStats } from "@/features/games/sudoku/lib/stats";
import { clearGame, loadDifficulty, loadGame, loadHistory, loadSettings, saveDifficulty, saveGame, saveSession, saveSettings, type StoredSession } from "@/features/games/sudoku/lib/storage";
import { syncSudoku } from "@/features/games/sudoku/lib/sync";
import { DEFAULT_SETTINGS, DIFFICULTY_LABEL, type Difficulty, type GameState, type SessionData, type SudokuSettings } from "@/features/games/sudoku/lib/types";

type View = "setup" | "playing" | "result";
type Tab = "play" | "stats";

interface Result {
  data: SessionData;
  previousBestMs: number | null;
  saveState: SaveState;
}

const newClientId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `sk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

export default function SudokuApp() {
  const store = useLocalStore();
  const viewer = useViewerInfo();
  const userId = viewer.kind === "user" ? viewer.userId : null;

  const [view, setView] = useState<View>("setup");
  const [tab, setTab] = useState<Tab>("play");
  const [game, setGame] = useState<GameState | null>(null);
  const [saved, setSaved] = useState<GameState | null>(null);
  const [history, setHistory] = useState<StoredSession[] | null>(null);
  const [settings, setSettings] = useState<SudokuSettings>(DEFAULT_SETTINGS);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [result, setResult] = useState<Result | null>(null);
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const historyRef = useRef<StoredSession[] | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Preferences, history and the unfinished game live in localStorage, so they are read after mount to keep the first render identical on server and client.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettings(loadSettings());
      setDifficulty(loadDifficulty());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!store) return;
    const timer = setTimeout(() => {
      setHistory(loadHistory(store));
      setSaved(loadGame(store));
    }, 0);
    return () => clearTimeout(timer);
  }, [store]);

  // An account also has games from its other devices: bring them in (and send anything waiting) once per visit.
  useEffect(() => {
    if (!store || userId === null) return;
    let cancelled = false;
    syncSudoku(userId, { pull: true }).then((outcome) => {
      if (!cancelled && outcome.ok) setHistory(loadHistory(store));
    });
    return () => {
      cancelled = true;
    };
  }, [store, userId]);

  const changeSettings = useCallback((next: SudokuSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const changeDifficulty = useCallback((next: Difficulty) => {
    setDifficulty(next);
    saveDifficulty(next);
  }, []);

  /** Saves a game that ended and tells the account about it; returns whether the device accepted it. */
  const record = useCallback(
    (g: GameState): boolean => {
      if (!store) return false;
      const data = toSessionData(g, Date.now());
      const ok = saveSession(store, data);
      setHistory(loadHistory(store));
      if (userId !== null) void syncSudoku(userId);
      return ok;
    },
    [store, userId]
  );

  const persist = useCallback(
    (g: GameState) => {
      if (store && (g.status === "playing" || g.status === "paused")) saveGame(store, freezeForStorage(g, Date.now()));
    },
    [store]
  );

  /** Gives up a game: it counts as an attempt only if it was touched. */
  const discard = useCallback(
    (g: GameState) => {
      if (hasProgress(g)) record(g);
      if (store) clearGame(store);
      setSaved(null);
    },
    [store, record]
  );

  const begin = useCallback(
    (level: Difficulty) => {
      setGenerating(true);
      setFailed(false);
      // Let the "Building puzzle" label paint before the (short) search blocks the page.
      setTimeout(() => {
        try {
          const created = newGame(generatePuzzle(level), newClientId(), Date.now());
          if (store) saveGame(store, freezeForStorage(created, Date.now()));
          setSaved(null);
          setGame(created);
          setResult(null);
          setView("playing");
        } catch {
          setFailed(true);
        } finally {
          setGenerating(false);
        }
      }, 30);
    },
    [store]
  );

  const start = useCallback(() => {
    if (saved) setConfirmDiscard(true);
    else begin(difficulty);
  }, [saved, begin, difficulty]);

  const resume = useCallback(() => {
    if (!saved) return;
    setGame(resumeGame(saved, Date.now()));
    setResult(null);
    setView("playing");
  }, [saved]);

  const end = useCallback(
    (g: GameState) => {
      const data = toSessionData(g, Date.now());
      const own = (historyRef.current ?? []).filter((s) => s.difficulty === g.difficulty && s.completed);
      const previousBestMs = own.length === 0 ? null : Math.min(...own.map((s) => s.elapsedMs));
      const ok = record(g);
      if (store) clearGame(store);
      setSaved(null);
      setResult({ data, previousBestMs, saveState: ok ? "saved" : "failed" });
      setView("result");
    },
    [record, store]
  );

  const leave = useCallback(
    (g: GameState) => {
      const frozen = freezeForStorage(g, Date.now());
      if (store) saveGame(store, frozen);
      setSaved(frozen);
      setGame(null);
      setView("setup");
    },
    [store]
  );

  const abandon = useCallback(
    (g: GameState) => {
      discard(g);
      setGame(null);
      setView("setup");
    },
    [discard]
  );

  const stats = useMemo(() => (history ? computeStats(history, saved?.difficulty ?? null) : null), [history, saved]);

  if (view === "playing" && game) {
    return <GameScreen key={game.clientId + game.startedAt} initial={game} settings={settings} onSettingsChange={changeSettings} onChange={persist} onEnd={end} onLeave={leave} onAbandon={abandon} />;
  }

  if (view === "result" && result) {
    return (
      <ResultScreen
        data={result.data}
        previousBestMs={result.previousBestMs}
        saveState={result.saveState}
        onReplay={() => begin(result.data.difficulty)}
        onChangeDifficulty={() => {
          setResult(null);
          setView("setup");
        }}
      />
    );
  }

  const tabs = [
    { id: "play", label: "Play" },
    { id: "stats", label: "Your stats" },
  ] as const;

  return (
    <div className="container space-y-6 py-8 sm:py-10">
      <PageHeader accent="sudoku" title="Sudoku" description="Fill the grid so every row, column and 3×3 box holds the digits 1 to 9 exactly once." />

      <div role="tablist" aria-label="Sudoku" className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`sdk-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`sdk-panel-${id}`}
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

      <div role="tabpanel" id="sdk-panel-play" aria-labelledby="sdk-tab-play" hidden={tab !== "play"}>
        <SetupScreen
          difficulty={difficulty}
          onDifficulty={changeDifficulty}
          stats={stats}
          saved={saved}
          settings={settings}
          onSettingsChange={changeSettings}
          generating={generating}
          failed={failed}
          onStart={start}
          onResume={resume}
        />
      </div>
      <div role="tabpanel" id="sdk-panel-stats" aria-labelledby="sdk-tab-stats" hidden={tab !== "stats"}>
        {tab === "stats" && <StatsPanel stats={stats} initialDifficulty={difficulty} />}
      </div>

      {confirmDiscard && saved && (
        <ConfirmDialog
          title="Start a new game?"
          message={`Your unfinished ${DIFFICULTY_LABEL[saved.difficulty]} puzzle will be given up${hasProgress(saved) ? " and counted as an attempt" : ""}.`}
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
