"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { useLocalStore, useViewerInfo } from "@/features/auth/components/viewer-provider";
import type { SaveState } from "@/features/games/shared/components/result-parts";
import { GameScreen } from "@/features/games/nback/components/game-screen";
import { ResultScreen } from "@/features/games/nback/components/result-screen";
import { SetupScreen } from "@/features/games/nback/components/setup-screen";
import { StatsPanel } from "@/features/games/nback/components/stats-panel";
import { TutorialDialog } from "@/features/games/nback/components/tutorial-dialog";
import { analyze } from "@/features/games/nback/lib/analysis";
import { suggestNextN } from "@/features/games/nback/lib/adaptive";
import { streamMode, withN } from "@/features/games/nback/lib/config";
import type { RunnerResult } from "@/features/games/nback/lib/runner";
import { MAX_SEED } from "@/features/games/nback/lib/records";
import { computeStats } from "@/features/games/nback/lib/stats";
import { loadHistory, loadSettings, markTutorialSeen, saveSession, saveSettings, tutorialSeen, type StoredSession } from "@/features/games/nback/lib/storage";
import { syncNback } from "@/features/games/nback/lib/sync";
import { DEFAULT_CONFIG, GENERATOR_VERSION, type NBackConfig, type SessionData } from "@/features/games/nback/lib/types";

interface ActiveGame {
  /** The settings this session was made from, kept so "Play again" can start the next one. */
  config: NBackConfig;
  seed: number;
  clientId: string;
  startedAt: number;
  /** Best n in this session's stream mode before it, to say when it is beaten. */
  previousBestN: number;
  finished: SessionData | null;
  saveState: SaveState;
}

type View = "setup" | "playing" | "results";
type Tab = "play" | "progress";

const newClientId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `nb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
/** The seed only has to differ between sessions; the sequence it makes is the same every time it is used. */
const newSeed = (): number => Math.floor(Math.random() * (MAX_SEED + 1));

export default function NBackApp() {
  const store = useLocalStore();
  const viewer = useViewerInfo();
  const userId = viewer.kind === "user" ? viewer.userId : null;

  const [view, setView] = useState<View>("setup");
  const [tab, setTab] = useState<Tab>("play");
  const [config, setConfig] = useState<NBackConfig>(DEFAULT_CONFIG);
  const [game, setGame] = useState<ActiveGame | null>(null);
  const [history, setHistory] = useState<StoredSession[] | null>(null);
  /** A start waiting for the first-time walkthrough to be read. */
  const [walkthrough, setWalkthrough] = useState<{ config: NBackConfig | null } | null>(null);
  const historyRef = useRef<StoredSession[] | null>(null);
  const gameRef = useRef<ActiveGame | null>(null);

  useEffect(() => {
    historyRef.current = history;
    gameRef.current = game;
  }, [history, game]);

  // Settings and history live in localStorage, so they are read after mount to keep the server and first client render identical.
  useEffect(() => {
    const timer = setTimeout(() => setConfig(loadSettings()), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!store) return;
    const timer = setTimeout(() => setHistory(loadHistory(store)), 0);
    return () => clearTimeout(timer);
  }, [store]);

  // An account also has history from its other devices: bring it in (and send anything waiting) once per visit.
  useEffect(() => {
    if (!store || userId === null) return;
    let cancelled = false;
    syncNback(userId, { pull: true }).then((result) => {
      if (!cancelled && result.ok) setHistory(loadHistory(store));
    });
    return () => {
      cancelled = true;
    };
  }, [store, userId]);

  const changeConfig = useCallback((next: NBackConfig) => {
    setConfig(next);
    saveSettings(next);
  }, []);

  const begin = useCallback((next: NBackConfig) => {
    const best = computeStats(historyRef.current ?? []).byMode[streamMode(next)].bestN;
    setGame({ config: next, seed: newSeed(), clientId: newClientId(), startedAt: Date.now(), previousBestN: best, finished: null, saveState: "saved" });
    setView("playing");
  }, []);

  /** The first session shows the walkthrough before the countdown; after that Start goes straight in. */
  const start = useCallback(
    (next: NBackConfig) => {
      if (tutorialSeen()) begin(next);
      else setWalkthrough({ config: next });
    },
    [begin]
  );

  const finish = useCallback(
    (result: RunnerResult) => {
      const current = gameRef.current;
      if (!current || current.finished) return;
      const data: SessionData = {
        clientId: current.clientId,
        startedAt: current.startedAt,
        endedAt: Date.now(),
        outcome: result.outcome,
        config: current.config,
        seed: current.seed,
        generator: GENERATOR_VERSION,
        responses: result.responses,
        durationMs: result.durationMs,
      };
      const saved = store ? saveSession(store, data) : false;
      if (store) {
        setHistory(loadHistory(store));
        // Send it to the account right away when there is a connection; otherwise the sync manager retries later.
        if (userId !== null) void syncNback(userId);
      }
      // With adaptive n on, the suggestion becomes the next session's n (never this one's).
      if (current.config.adaptive) {
        const n = suggestNextN({ n: current.config.n, accuracy: analyze(data).accuracy, outcome: data.outcome });
        changeConfig(withN(current.config, n));
      }
      setGame({ ...current, finished: data, saveState: saved ? "saved" : "failed" });
      setView("results");
    },
    [store, userId, changeConfig]
  );

  const leave = useCallback(() => {
    setGame(null);
    setView("setup");
  }, []);

  if (view === "playing" && game) {
    return <GameScreen key={game.clientId} config={game.config} seed={game.seed} onFinish={finish} onQuit={leave} />;
  }

  if (view === "results" && game?.finished) {
    return (
      <ResultScreen
        data={game.finished}
        previousBestN={game.previousBestN}
        saveState={game.saveState}
        onChange={leave}
        onRetry={() => begin(game.config)}
        onNext={(n) => begin(withN(game.config, n))}
      />
    );
  }

  const tabs = [
    { id: "play", label: "Play" },
    { id: "progress", label: "Your progress" },
  ] as const;

  return (
    <div className="container space-y-6 py-8 sm:py-10">
      <PageHeader accent="nback" title="N-Back" description="Watch the stimuli go by and say when one matches the one from n steps back. A working-memory workout." />

      <div role="tablist" aria-label="N-Back" className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`nb-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`nb-panel-${id}`}
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

      <div role="tabpanel" id="nb-panel-play" aria-labelledby="nb-tab-play" hidden={tab !== "play"}>
        <SetupScreen config={config} onChange={changeConfig} onStart={start} onHowTo={() => setWalkthrough({ config: null })} starting={false} />
      </div>
      <div role="tabpanel" id="nb-panel-progress" aria-labelledby="nb-tab-progress" hidden={tab !== "progress"}>
        {tab === "progress" && <StatsPanel history={history} />}
      </div>

      {walkthrough && (
        <TutorialDialog
          confirmLabel={walkthrough.config ? "Start playing" : "Got it"}
          onCancel={() => setWalkthrough(null)}
          onConfirm={() => {
            markTutorialSeen();
            const next = walkthrough.config;
            setWalkthrough(null);
            if (next) begin(next);
          }}
        />
      )}
    </div>
  );
}
