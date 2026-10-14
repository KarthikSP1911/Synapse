import { ECONOMY, type Economy, type PuzzleDifficulty } from "@/features/rewards/lib/economy";
import type { Grant } from "@/features/rewards/lib/types";

/**
 * What an activity is worth. Each function turns something that already happened and was already saved or verified
 * (an answered question, a finished session, a solved puzzle) into the rewards it earns. Every reward has a key made
 * from the thing's own identity, so the same activity produces the same keys however often it is looked at: the
 * device credits them as it saves, the server credits them again when the record is uploaded, and the second time
 * changes nothing.
 *
 * Nothing is paid for opening a page, starting a game, refreshing, or moving between screens, because none of those
 * leave a saved record to reward. Wrong, skipped and timed-out answers, abandoned sessions, revealed Sudokus and
 * given-up puzzles earn nothing either.
 */

const percent = (part: number, whole: number): number => (whole === 0 ? 0 : Math.floor((part * 100) / whole));

// ---------------------------------------------------------------------------
// Practice
// ---------------------------------------------------------------------------

export interface PracticeAttemptLike {
  outcome: string;
  /** The question that was answered; used to recognise one submission sent twice. */
  questionId?: string;
  /** When it was answered (epoch ms); unique within a session, so it identifies the attempt. */
  at: number;
}

const answered = (attempts: readonly PracticeAttemptLike[]) => attempts.filter((a) => a.outcome === "correct" || a.outcome === "incorrect");

/**
 * Two coins for each correct answer. `sessionRef` identifies the session (its client id). An attempt that repeats the
 * question of the attempt just before it within `duplicateSubmissionMs` is a doubled submission and earns nothing.
 */
export function practiceAnswerGrants(sessionRef: string, attempts: readonly PracticeAttemptLike[], economy: Economy = ECONOMY): Grant[] {
  const ordered = [...attempts].sort((a, b) => a.at - b.at);
  return ordered
    .filter((a, i) => {
      const previous = ordered[i - 1];
      const doubled = previous !== undefined && a.questionId !== undefined && previous.questionId === a.questionId && a.at - previous.at < economy.practice.duplicateSubmissionMs;
      return a.outcome === "correct" && !doubled;
    })
    .map((a) => ({ key: `practice:${sessionRef}:${a.at}`, amount: economy.practice.correctAnswer, reason: "Correct answer", ref: sessionRef, at: a.at }));
}

/**
 * The bonus for a practice session that ended: at least `minAnsweredForBonus` questions answered and enough of them
 * right. A session that is merely idle or left open has not ended and earns none. Paid once per session.
 */
export function practiceBonusGrants(sessionRef: string, attempts: readonly PracticeAttemptLike[], endedAt: number | null, economy: Economy = ECONOMY): Grant[] {
  if (endedAt === null) return [];
  const done = answered(attempts);
  const right = done.filter((a) => a.outcome === "correct").length;
  const { minAnsweredForBonus, minAccuracyPercentForBonus, sessionBonus } = economy.practice;
  if (done.length < minAnsweredForBonus || percent(right, done.length) < minAccuracyPercentForBonus) return [];
  return [{ key: `practice:${sessionRef}:bonus`, amount: sessionBonus, reason: "Practice session completed", ref: sessionRef, at: endedAt }];
}

// ---------------------------------------------------------------------------
// MindSprint and Number Recall
// ---------------------------------------------------------------------------

/**
 * One reward per correct round plus the session bonus. `rounds[i]` is whether round i was right (for Number Recall,
 * recalled perfectly). The caller only has finished sessions, since the games save a session only once every round is played.
 */
export function roundGameGrants(
  game: "mindsprint" | "recall",
  session: { clientId: string; endedAt: number; rounds: readonly boolean[] },
  economy: Economy = ECONOMY
): Grant[] {
  const rules = economy[game];
  const label = game === "mindsprint" ? "MindSprint" : "Number Recall";
  const grants: Grant[] = [];
  session.rounds.forEach((correct, index) => {
    if (correct) grants.push({ key: `${game}:${session.clientId}:r${index + 1}`, amount: rules.correctRound, reason: `${label} round ${index + 1}`, ref: session.clientId, at: session.endedAt });
  });
  const right = session.rounds.filter(Boolean).length;
  if (session.rounds.length >= rules.minRoundsForBonus && percent(right, session.rounds.length) >= rules.minAccuracyPercentForBonus) {
    grants.push({ key: `${game}:${session.clientId}:bonus`, amount: rules.sessionBonus, reason: `${label} session completed`, ref: session.clientId, at: session.endedAt });
  }
  return grants;
}

// ---------------------------------------------------------------------------
// Puzzles and 2048
// ---------------------------------------------------------------------------

const PUZZLE_LABEL = { sudoku: "Sudoku", queens: "Queens", zip: "Zip" } as const;

/** Coins for a solved Sudoku, Queens or Zip, by difficulty. Once per game id (restarting keeps the id). */
export function puzzleGrants(
  game: keyof typeof PUZZLE_LABEL,
  session: { clientId: string; completed: boolean; difficulty: PuzzleDifficulty; endedAt: number },
  economy: Economy = ECONOMY
): Grant[] {
  if (!session.completed) return [];
  const amount = economy.puzzle[session.difficulty];
  if (!(amount > 0)) return [];
  const level = session.difficulty[0].toUpperCase() + session.difficulty.slice(1);
  return [{ key: `${game}:${session.clientId}`, amount, reason: `${level} ${PUZZLE_LABEL[game]} solved`, ref: session.clientId, at: session.endedAt }];
}

/** Coins for the highest tile of a 2048 run: the largest threshold at or below it. Zero below the first threshold. */
export function highestTileReward(highestTile: number, economy: Economy = ECONOMY): number {
  let coins = 0;
  for (const [tile, amount] of economy.game2048.byHighestTile) if (highestTile >= tile) coins = amount;
  return coins;
}

/**
 * The reward for a 2048 run that counts as played (the caller passes `counts`, from the same rule the streak uses).
 * It is paid once, when the run is saved, and depends only on the highest tile, never on individual merges.
 */
export function game2048Grants(session: { clientId: string; highestTile: number; endedAt: number }, counts: boolean, economy: Economy = ECONOMY): Grant[] {
  if (!counts) return [];
  const amount = highestTileReward(session.highestTile, economy);
  return amount > 0 ? [{ key: `game2048:${session.clientId}`, amount, reason: `2048 run, highest tile ${session.highestTile}`, ref: session.clientId, at: session.endedAt }] : [];
}
