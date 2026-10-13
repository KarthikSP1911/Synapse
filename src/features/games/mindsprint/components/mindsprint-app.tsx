"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { GameScreen } from "@/features/games/mindsprint/components/game-screen";
import { SetupScreen, type SetupProblem } from "@/features/games/mindsprint/components/setup-screen";
import { StatsPanel } from "@/features/games/mindsprint/components/stats-panel";
import { SummaryScreen } from "@/features/games/mindsprint/components/summary-screen";
import type { SaveState } from "@/features/games/shared/components/result-parts";
import { useLocalStore, useViewerInfo } from "@/features/auth/components/viewer-provider";
import { GenerationError, generateSession } from "@/features/games/mindsprint/lib/generate";
import { scoreSession } from "@/features/games/mindsprint/lib/scoring";
import { createSoundPlayer } from "@/features/games/mindsprint/lib/sound";
import { loadHistory, loadSound, saveSession, saveSound, type StoredSession } from "@/features/games/mindsprint/lib/storage";
import { syncMindsprint } from "@/features/games/mindsprint/lib/sync";
import type { GeneratedRound, PlayedRound, RoundConfig, SessionData } from "@/features/games/mindsprint/lib/types";

interface ActiveGame {
  /** The setup this game was made from, kept so "Play again" can build a fresh game from it. */
  configs: RoundConfig[];
  rounds: GeneratedRound[];
  startedAt: number;
  clientId: string;
  /** Best score before this game, to say when it is beaten. */
  previousBest: number;
  finished: SessionData | null;
  saveState: SaveState;
}

type View = "setup" | "playing" | "summary";
type Tab = "play" | "stats";

const newClientId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

const bestOf = (history: readonly StoredSession[] | null): number => (history ?? []).reduce((best, s) => Math.max(best, scoreSession(s.rounds).score), 0);

export default function MindsprintApp() {
  const store = useLocalStore();
  const viewer = useViewerInfo();
  const userId = viewer.kind === "user" ? viewer.userId : null;

  const [view, setView] = useState<View>("setup");
  const [tab, setTab] = useState<Tab>("play");
  const [game, setGame] = useState<ActiveGame | null>(null);
  const [history, setHistory] = useState<StoredSession[] | null>(null);
  const [problem, setProblem] = useState<SetupProblem | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [sound] = useState(() => createSoundPlayer(true));
  const historyRef = useRef<StoredSession[] | null>(null);
  const gameRef = useRef<ActiveGame | null>(null);

  useEffect(() => {
    historyRef.current = history;
    gameRef.current = game;
  }, [history, game]);

  // Preferences and history live in localStorage, so they are read after mount to keep the server and first client render identical.
  useEffect(() => {
    const timer = setTimeout(() => {
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
    syncMindsprint(userId, { pull: true }).then((result) => {
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

  const [starting, setStarting] = useState(false);

  const start = useCallback(
    (configs: RoundConfig[]) => {
      setProblem(null);
      setStarting(true);
      // Starting is a tap or key press, which is the only moment a browser allows sound to begin.
      sound.unlock();
      // Give the "Preparing" state a frame to paint before the (synchronous) generation runs.
      setTimeout(() => {
        try {
          // Every sequence is built and checked here, before the first countdown, and kept hidden until its round is over.
          const rounds = generateSession(configs);
          setGame({ configs, rounds, startedAt: Date.now(), clientId: newClientId(), previousBest: bestOf(historyRef.current), finished: null, saveState: "saved" });
          setView("playing");
        } catch (error) {
          if (!(error instanceof GenerationError)) throw error;
          setProblem({ message: error.message, round: error.round });
          setView("setup");
        } finally {
          setStarting(false);
        }
      }, 30);
    },
    [sound]
  );

  const finish = useCallback(
    (played: PlayedRound[]) => {
      const current = gameRef.current;
      if (!current || current.finished) return;
      const data: SessionData = { clientId: current.clientId, startedAt: current.startedAt, endedAt: Date.now(), rounds: played };
      const saved = store ? saveSession(store, data) : false;
      if (store) {
        setHistory(loadHistory(store));
        // Send it to the account right away when there is a connection; otherwise the sync manager retries later.
        if (userId !== null) void syncMindsprint(userId);
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
    if (game) start(game.configs);
  }, [game, start]);

  const tabs = useMemo(
    () =>
      [
        { id: "play", label: "Play" },
        { id: "stats", label: "Your stats" },
      ] as const,
    []
  );

  if (view === "playing" && game) {
    return (
      <GameScreen
        rounds={game.rounds}
        sound={sound}
        soundOn={soundOn}
        onSoundChange={changeSound}
        onFinished={finish}
        onSummary={() => setView("summary")}
        onQuit={leave}
      />
    );
  }

  if (view === "summary" && game?.finished) {
    return <SummaryScreen data={game.finished} previousBest={game.previousBest} saveState={game.saveState} onReplay={replay} onNewSetup={leave} />;
  }

  return (
    <div className="container space-y-6 py-8 sm:py-10">
      <PageHeader
        accent="mindsprint"
        title="MindSprint"
        description="Numbers flash by one at a time. Do the sums in your head, then give the result once they are gone."
      />

      <div role="tablist" aria-label="MindSprint" className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`ms-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`ms-panel-${id}`}
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

      <div role="tabpanel" id="ms-panel-play" aria-labelledby="ms-tab-play" hidden={tab !== "play"}>
        <SetupScreen sound={soundOn} onSoundChange={changeSound} problem={problem} starting={starting} onStart={start} />
      </div>
      <div role="tabpanel" id="ms-panel-stats" aria-labelledby="ms-tab-stats" hidden={tab !== "stats"}>
        {tab === "stats" && <StatsPanel history={history} />}
      </div>
    </div>
  );
}
