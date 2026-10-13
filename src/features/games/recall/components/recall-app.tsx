"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { GameScreen } from "@/features/games/recall/components/game-screen";
import { SetupScreen } from "@/features/games/recall/components/setup-screen";
import { StatsPanel } from "@/features/games/recall/components/stats-panel";
import { SummaryScreen } from "@/features/games/recall/components/summary-screen";
import type { SaveState } from "@/features/games/shared/components/result-parts";
import { useLocalStore, useViewerInfo } from "@/features/auth/components/viewer-provider";
import { createSoundPlayer } from "@/features/games/mindsprint/lib/sound";
import { computeStats } from "@/features/games/recall/lib/stats";
import { defaultSetups, loadHistory, loadMode, loadSetups, loadSound, saveMode, saveSession, saveSetups, saveSound, type StoredSession } from "@/features/games/recall/lib/storage";
import { syncRecall } from "@/features/games/recall/lib/sync";
import type { PlayedRound, RecallConfig, RecallMode, SessionData } from "@/features/games/recall/lib/types";

interface ActiveGame {
  /** The settings this game was made from, kept so "Play again" can start a fresh one. */
  config: RecallConfig;
  startedAt: number;
  clientId: string;
  /** Best score and longest perfect recall in this mode before this game, to say when they are beaten. */
  previousBest: number;
  previousLongest: number;
  finished: SessionData | null;
  saveState: SaveState;
}

type View = "setup" | "playing" | "summary";
type Tab = "play" | "stats";

const newClientId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `nr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

export default function RecallApp() {
  const store = useLocalStore();
  const viewer = useViewerInfo();
  const userId = viewer.kind === "user" ? viewer.userId : null;

  const [view, setView] = useState<View>("setup");
  const [tab, setTab] = useState<Tab>("play");
  const [game, setGame] = useState<ActiveGame | null>(null);
  const [history, setHistory] = useState<StoredSession[] | null>(null);
  const [setups, setSetups] = useState(defaultSetups);
  const [mode, setMode] = useState<RecallMode>("single");
  const [soundOn, setSoundOn] = useState(true);
  const [sound] = useState(() => createSoundPlayer(true));
  const [starting, setStarting] = useState(false);
  const historyRef = useRef<StoredSession[] | null>(null);
  const gameRef = useRef<ActiveGame | null>(null);

  useEffect(() => {
    historyRef.current = history;
    gameRef.current = game;
  }, [history, game]);

  // Preferences and history live in localStorage, so they are read after mount to keep the server and first client render identical.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSetups(loadSetups());
      setMode(loadMode());
      const on = loadSound();
      setSoundOn(on);
      sound.setEnabled(on);
    }, 0);
    return () => clearTimeout(timer);
  }, [sound]);

  useEffect(() => () => sound.close(), [sound]);

  useEffect(() => {
    if (!store) return;
    const timer = setTimeout(() => setHistory(loadHistory(store)), 0);
    return () => clearTimeout(timer);
  }, [store]);

  // An account also has history from its other devices: bring it in (and send anything waiting) once per visit.
  useEffect(() => {
    if (!store || userId === null) return;
    let cancelled = false;
    syncRecall(userId, { pull: true }).then((result) => {
      if (!cancelled && result.ok) setHistory(loadHistory(store));
    });
    return () => {
      cancelled = true;
    };
  }, [store, userId]);

  const changeSound = useCallback(
    (next: boolean) => {
      setSoundOn(next);
      sound.setEnabled(next);
      saveSound(next);
      if (next) sound.unlock();
    },
    [sound]
  );

  const changeMode = useCallback((next: RecallMode) => {
    setMode(next);
    saveMode(next);
  }, []);

  const changeConfig = useCallback((config: RecallConfig) => {
    setSetups((current) => {
      const next = { ...current, [config.mode]: config };
      saveSetups(next);
      return next;
    });
  }, []);

  const start = useCallback(
    (config: RecallConfig) => {
      setStarting(true);
      // Starting is a tap or key press, which is the only moment a browser allows sound to begin.
      sound.unlock();
      const own = (historyRef.current ?? []).filter((s) => s.config.mode === config.mode);
      const stats = computeStats(own, config.mode);
      setGame({ config, startedAt: Date.now(), clientId: newClientId(), previousBest: stats.bestScore, previousLongest: stats.longestRecalled, finished: null, saveState: "saved" });
      setView("playing");
      setStarting(false);
    },
    [sound]
  );

  const finish = useCallback(
    (played: PlayedRound[]) => {
      const current = gameRef.current;
      if (!current || current.finished) return;
      const data: SessionData = { clientId: current.clientId, startedAt: current.startedAt, endedAt: Date.now(), config: current.config, rounds: played };
      const saved = store ? saveSession(store, data) : false;
      if (store) {
        setHistory(loadHistory(store));
        // Send it to the account right away when there is a connection; otherwise the sync manager retries later.
        if (userId !== null) void syncRecall(userId);
      }
      setGame({ ...current, finished: data, saveState: saved ? "saved" : "failed" });
    },
    [store, userId]
  );

  const leave = useCallback(() => {
    setGame(null);
    setView("setup");
  }, []);

  const replay = useCallback(() => {
    if (game) start(game.config);
  }, [game, start]);

  if (view === "playing" && game) {
    return <GameScreen config={game.config} sound={sound} soundOn={soundOn} onSoundChange={changeSound} onFinished={finish} onSummary={() => setView("summary")} onQuit={leave} />;
  }

  if (view === "summary" && game?.finished) {
    return <SummaryScreen data={game.finished} previousBest={game.previousBest} previousLongest={game.previousLongest} saveState={game.saveState} onReplay={replay} onNewSetup={leave} />;
  }

  const tabs = [
    { id: "play", label: "Play" },
    { id: "stats", label: "Your stats" },
  ] as const;

  return (
    <div className="container space-y-6 py-8 sm:py-10">
      <PageHeader
        accent="recall"
        title="Number Recall"
        description="Watch a sequence of digits flash by, then type it back in the exact original order."
      />

      <div role="tablist" aria-label="Number Recall" className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`nr-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`nr-panel-${id}`}
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

      <div role="tabpanel" id="nr-panel-play" aria-labelledby="nr-tab-play" hidden={tab !== "play"}>
        <SetupScreen
          mode={mode}
          config={setups[mode]}
          onMode={changeMode}
          onChange={changeConfig}
          sound={soundOn}
          onSoundChange={changeSound}
          starting={starting}
          onStart={start}
        />
      </div>
      <div role="tabpanel" id="nr-panel-stats" aria-labelledby="nr-tab-stats" hidden={tab !== "stats"}>
        {tab === "stats" && <StatsPanel history={history} initialMode={mode} />}
      </div>
    </div>
  );
}
