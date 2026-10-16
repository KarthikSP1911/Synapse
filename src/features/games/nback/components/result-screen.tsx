"use client";

import { RotateCcw, SkipForward, SlidersHorizontal, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Page, PageHeader, StatTile } from "@/components/layout/page-header";
import { RecordBanner, SaveStatus, type SaveState } from "@/features/games/shared/components/result-parts";
import { Lives } from "@/features/games/nback/components/lives";
import { analyze } from "@/features/games/nback/lib/analysis";
import { activeStreams, streamMode } from "@/features/games/nback/lib/config";
import { suggestNextN } from "@/features/games/nback/lib/adaptive";
import { sessionGrants } from "@/features/games/nback/lib/rewards";
import { LIVES, MODE_LABEL, STREAM_LABEL, type SessionData } from "@/features/games/nback/lib/types";

const barColor = (accuracy: number) => (accuracy >= 80 ? "bg-success" : accuracy >= 50 ? "bg-warning" : "bg-destructive");
const clock = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const pct = (value: number): number => Math.round(value);

/**
 * The end-of-session screen, for a completed session and for a Game Over alike. Everything on it is worked out by
 * replaying the saved record (`analyze`), the same way the stats and the server do, so it can never disagree with
 * what was saved.
 */
export function ResultScreen({
  data,
  previousBestN,
  saveState,
  onChange,
  onRetry,
  onNext,
}: {
  data: SessionData;
  /** The best n reached in this mode before this session (0 for none). */
  previousBestN: number;
  saveState: SaveState;
  onChange: () => void;
  /** Play again with exactly the settings just used. */
  onRetry: () => void;
  /** Play the next session; with adaptive n on, at the suggested n. */
  onNext: (n: number) => void;
}) {
  const { config } = data;
  const a = analyze(data);
  const { result } = a;
  const gameOver = data.outcome === "gameover";
  const accuracy = pct(a.accuracy);
  const coins = sessionGrants(data).reduce((sum, g) => sum + g.amount, 0);
  const suggested = config.adaptive ? suggestNextN({ n: config.n, accuracy: a.accuracy, outcome: data.outcome }) : config.n;
  const newBest = a.setsBestN && config.n > previousBestN;
  const mode = MODE_LABEL[streamMode(config)];
  const changed = suggested !== config.n;

  return (
    <Page narrow>
      <PageHeader
        accent="nback"
        eyebrow={`${gameOver ? "Game over" : "Session complete"} · ${mode} · n = ${config.n}`}
        title={gameOver ? "Game over" : `${accuracy}% accuracy`}
        description={
          gameOver
            ? `You lost your last life at trial ${result.gameOverTrial} of ${config.trials}. No coins this time; play a session to the end to earn them.`
            : `${result.trialsPlayed} trials played with ${result.livesRemaining} of ${LIVES} lives left.`
        }
        actions={
          <>
            <Button variant="outline" onClick={onChange}>
              <SlidersHorizontal /> Change settings
            </Button>
            <Button variant={changed ? "outline" : "default"} onClick={onRetry} autoFocus={!changed}>
              <RotateCcw /> {changed ? `Try again at n = ${config.n}` : "Play again"}
            </Button>
            {changed && (
              <Button onClick={() => onNext(suggested)} autoFocus>
                <SkipForward /> Play at n = {suggested}
              </Button>
            )}
          </>
        }
      />

      {newBest && (
        <RecordBanner>
          New best n for {mode.toLowerCase()} n-back: {config.n}
          {previousBestN > 0 ? `, up from ${previousBestN}` : ""}.
        </RecordBanner>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Accuracy" value={`${accuracy}%`} tone={a.accuracy >= 80 ? "success" : a.accuracy >= 50 ? "warning" : "danger"} hint={`${result.overall.correct} of ${result.overall.total} decisions right`} />
        <StatTile label="Score" value={a.points.toLocaleString()} hint="decisions × n" />
        <StatTile label="Coins" value={coins > 0 ? `+${coins}` : "0"} hint={gameOver ? "none for Game Over" : coins > 0 ? `${a.difficulty} reward` : "no reward"} />
        <StatTile label="Time" value={clock(data.durationMs)} hint={`${result.trialsPlayed} of ${config.trials} trials`} />
      </div>

      <section aria-labelledby="nb-summary" className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 id="nb-summary" className="text-lg font-semibold tracking-tight">
          Session
        </h2>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Item label="Outcome" value={gameOver ? "Game over" : "Completed"} />
          <Item label="Lives remaining" value={<Lives lives={result.livesRemaining} />} />
          <Item label="n level" value={String(config.n)} />
          <Item label="Streams" value={activeStreams(config).map((s) => STREAM_LABEL[s]).join(" + ")} />
          <Item label="Board" value={`${config.grid}×${config.grid}`} />
          <Item label="Trials played" value={`${result.trialsPlayed} of ${config.trials}`} />
          {gameOver && <Item label="Last life lost at" value={`trial ${result.gameOverTrial}`} />}
          {result.livesLostAt.length > 0 && !gameOver && <Item label="Lives lost at" value={result.livesLostAt.map((t) => `trial ${t}`).join(", ")} />}
        </dl>
      </section>

      <section aria-labelledby="nb-streams" className="space-y-3">
        <h2 id="nb-streams" className="text-lg font-semibold tracking-tight">
          By stream
        </h2>
        <ul className="space-y-3">
          {activeStreams(config).map((stream) => {
            const s = result.perStream[stream]!;
            const acc = pct(s.accuracy);
            return (
              <li key={stream} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold">{STREAM_LABEL[stream]}</span>
                  <span className="font-mono text-sm font-semibold tabular-nums">{acc}%</span>
                </div>
                <Progress value={acc} className="mt-2 h-1.5 bg-secondary" indicatorColor={barColor(s.accuracy)} aria-label={`${STREAM_LABEL[stream]} accuracy ${acc}%`} />
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  <Count label="Hits" value={s.hits} />
                  <Count label="Misses" value={s.misses} />
                  <Count label="False alarms" value={s.falseAlarms} />
                  <Count label="Correct rejections" value={s.correctRejections} />
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">
                  {s.matches === 0 ? "No matches came up in this stream." : `Caught ${s.hits} of ${s.matches} ${s.matches === 1 ? "match" : "matches"} (${pct(s.detection ?? 0)}%).`} Accuracy is (hits + correct rejections) ÷ {s.scoreable} scored trials.
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {config.adaptive && (
        <section aria-labelledby="nb-next" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
          {suggested > config.n ? <TrendingUp className="size-5 shrink-0 text-success" aria-hidden /> : suggested < config.n ? <TrendingDown className="size-5 shrink-0 text-warning" aria-hidden /> : <Minus className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
          <div>
            <h2 id="nb-next" className="text-sm font-semibold">
              Suggested next n: {suggested}
            </h2>
            <p className="text-xs text-muted-foreground">
              {gameOver
                ? "A Game Over counts as a failed session, so n goes down by one."
                : suggested > config.n
                  ? `${accuracy}% accuracy is at or above 80%, so n goes up by one.`
                  : suggested < config.n
                    ? `${accuracy}% accuracy is below 50%, so n goes down by one.`
                    : `${accuracy}% accuracy keeps n where it is.`}{" "}
              It is used from your next session.
            </p>
          </div>
        </section>
      )}

      <SaveStatus state={saveState} noun="session" className="text-center" />
    </Page>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
