/**
 * The coin economy: every amount, price, limit and cooldown in one place. Nothing else in the app hard-codes a
 * number of coins; change a value here and the games, the shop, the server and the tests all follow.
 *
 * The server uses the same object to decide what a reward, a shield or a hint is worth, so a device can never
 * name its own amount (see `src/features/rewards/server/wallet.ts`).
 */

export type PuzzleDifficulty = "easy" | "medium" | "hard" | "expert";

export interface Economy {
  practice: {
    /** For each correct answer in a practice session. Skipped, timed-out and wrong answers earn nothing. */
    correctAnswer: number;
    /** Once, when a practice session ends having met the two limits below. */
    sessionBonus: number;
    /** Questions that must have been answered (right or wrong) for the session bonus. */
    minAnsweredForBonus: number;
    /** Whole percent of the answered questions that must be right for the session bonus. */
    minAccuracyPercentForBonus: number;
    /**
     * The same question answered again this soon after it was answered is the same submission sent twice (a double tap,
     * a retried request), not a second answer, and is not paid twice. A person cannot see and answer a question in less.
     */
    duplicateSubmissionMs: number;
  };
  mindsprint: RoundGame;
  recall: RoundGame;
  /** Sudoku, Queens, Zip and Patches: once, for a solved puzzle. A revealed or abandoned one earns nothing. */
  puzzle: Record<PuzzleDifficulty, number>;
  game2048: {
    /**
     * Coins for the highest tile of a run that counts (it ended, reached 2048 or had enough moves; see
     * `game2048Counts`). The largest tile at or below the run's highest sets the amount. Paid once, when the
     * run ends, never per merge. Runs whose highest tile is below the first row earn nothing.
     */
    byHighestTile: readonly (readonly [tile: number, coins: number])[];
  };
  shield: {
    /** Coins for one Streak Shield. */
    price: number;
    /** Most shields a user can hold at once. */
    maxInventory: number;
    /** How far back streak protection looks for missed days. A gap can only be as long as the inventory is large. */
    lookbackDays: number;
  };
  hint: {
    /** Coins for each hint that is actually delivered. */
    cost: number;
    /** After a delivered hint, how long until the same game or session may deliver another. */
    cooldownMs: number;
  };
  ledger: {
    /** Transactions kept on the device; older ones are folded into the opening balance (nothing is lost). */
    maxLocalEntries: number;
    /** Longest idempotency key accepted from a device. */
    maxKeyLength: number;
    /** Largest single credit a device-side or server-side reward may carry (a sanity bound, not a target). */
    maxSingleCredit: number;
  };
}

interface RoundGame {
  /** For each correct round (MindSprint) or perfectly recalled round (Number Recall). */
  correctRound: number;
  /** Once, for a finished session that met the two limits below. */
  sessionBonus: number;
  /** Rounds the session must have had. */
  minRoundsForBonus: number;
  /** Whole percent of its rounds that must have been right. */
  minAccuracyPercentForBonus: number;
}

export const ECONOMY: Economy = {
  practice: { correctAnswer: 2, sessionBonus: 5, minAnsweredForBonus: 5, minAccuracyPercentForBonus: 50, duplicateSubmissionMs: 400 },
  mindsprint: { correctRound: 2, sessionBonus: 5, minRoundsForBonus: 3, minAccuracyPercentForBonus: 50 },
  recall: { correctRound: 2, sessionBonus: 5, minRoundsForBonus: 3, minAccuracyPercentForBonus: 50 },
  puzzle: { easy: 10, medium: 15, hard: 20, expert: 30 },
  game2048: {
    byHighestTile: [
      [128, 3],
      [256, 5],
      [512, 8],
      [1024, 12],
      [2048, 20],
      [4096, 30],
      [8192, 40],
      [16384, 50],
    ],
  },
  shield: { price: 100, maxInventory: 5, lookbackDays: 90 },
  hint: { cost: 5, cooldownMs: 5000 },
  ledger: { maxLocalEntries: 500, maxKeyLength: 160, maxSingleCredit: 1000 },
};
