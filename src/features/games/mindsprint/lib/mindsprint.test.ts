import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkAnswer, checkSequence, displayCalculation, evaluateSequence, parseAnswerText, sanitizeAnswer } from "./arithmetic";
import { DEFAULT_ROUND, PRESETS, difficultyLevel, difficultyMultiplier, parseRoundConfig, parseSetup } from "./config";
import { seededRng } from "@/lib/random";
import { GenerationError, generateRound, generateSession } from "./generate";
import { parseSessionData } from "./records";
import { scoreRound, scoreSession } from "./scoring";
import { computeStats } from "./stats";
import { loadHistory, loadSetup, markSynced, mergeRemote, pendingSessions, saveSession, saveSetup } from "./storage";
import { buildTimeline, runTimeline, timelineLength, type Timers } from "@/lib/timeline";
import { LIMITS, OPERATIONS, type Flash, type PlayedRound, type RoundConfig, type SessionData } from "./types";

const config = (overrides: Partial<RoundConfig> = {}): RoundConfig => ({ ...DEFAULT_ROUND, ...overrides });

/** `seq("20", "*3", "-5")` builds the flashes of 20 × 3 − 5. */
function seq(...tokens: string[]): Flash[] {
  const ops = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide" } as const;
  return tokens.map((t, i) => (i === 0 ? { op: null, value: t } : { op: ops[t[0] as keyof typeof ops], value: t.slice(1) }));
}

const answerOf = (flashes: Flash[]): string => {
  const result = evaluateSequence(flashes);
  assert.ok(result.ok, result.ok ? "" : result.reason);
  return result.answer;
};

describe("sequential evaluation", () => {
  it("applies operators left to right with no precedence", () => {
    assert.equal(answerOf(seq("20", "*3", "-5")), "55");
    assert.equal(answerOf(seq("10", "+5", "*2")), "30"); // not 20
    assert.equal(answerOf(seq("8", "/2", "+3")), "7");
    assert.equal(answerOf(seq("3", "+4", "*2", "-6", "/4")), "2");
  });

  it("is exact with decimals", () => {
    assert.equal(answerOf(seq("0.1", "+0.2")), "0.3");
    assert.equal(answerOf(seq("1.5", "*2.5")), "3.75");
    assert.equal(answerOf(seq("10", "/4")), "2.5");
  });

  it("handles negative numbers and totals", () => {
    assert.equal(answerOf(seq("5", "-12")), "-7");
    assert.equal(answerOf(seq("-6", "*-4", "-4")), "20");
    assert.equal(answerOf(seq("-9", "/3")), "-3");
    assert.equal(answerOf(seq("7", "-7")), "0");
  });

  it("refuses division by zero, non-finite results and malformed input", () => {
    assert.equal(evaluateSequence(seq("5", "/0")).ok, false);
    assert.equal(evaluateSequence(seq("1", "/3")).ok, false);
    assert.equal(evaluateSequence([]).ok, false);
    assert.equal(evaluateSequence([{ op: "add", value: "3" }]).ok, false);
    assert.equal(evaluateSequence([{ op: null, value: "3" }, { op: null, value: "4" }]).ok, false);
    assert.equal(evaluateSequence(seq("3", "+x")).ok, false);
  });

  it("reports each running total", () => {
    const result = evaluateSequence(seq("20", "*3", "-5"));
    assert.ok(result.ok);
    assert.deepEqual(result.steps.map((s) => s.total), ["20", "60", "55"]);
  });

  it("writes the calculation out with true minus signs and bracketed negatives", () => {
    assert.equal(displayCalculation(seq("20", "*3", "-5"), "55"), "20 × 3 − 5 = 55");
    assert.equal(displayCalculation(seq("4", "+-3"), "1"), "4 + (−3) = 1");
  });
});

describe("answer checking", () => {
  it("compares exactly, ignoring only how the number is written", () => {
    for (const typed of ["3.5", "3.50", "+3.5", " 3.5 ", "03.5"]) assert.equal(checkAnswer(typed, "3.5").status, "correct", typed);
    for (const typed of ["3.4", "3.51", "35", "-3.5", "3.5000001"]) assert.equal(checkAnswer(typed, "3.5").status, "incorrect", typed);
  });

  it("accepts both minus signs and treats minus zero as zero", () => {
    assert.equal(checkAnswer("-7", "-7").status, "correct");
    assert.equal(checkAnswer("−7", "-7").status, "correct");
    assert.equal(checkAnswer("7", "-7").status, "incorrect");
    assert.equal(checkAnswer("-0", "0").status, "correct");
    assert.equal(checkAnswer(".5", "0.5").status, "correct");
  });

  it("flags input that is not a number instead of marking it wrong", () => {
    for (const typed of ["", "  ", "abc", "1/2", "1,5", "--3", "3.", "1e3", "5%", "9".repeat(30)]) {
      const result = checkAnswer(typed, "3");
      assert.equal(result.status, "invalid", JSON.stringify(typed));
    }
    assert.equal(parseAnswerText("12").ok, true);
  });
});

describe("answer box", () => {
  const plain = { allowNegative: false, decimals: false };
  it("keeps only what the round can have as an answer", () => {
    assert.equal(sanitizeAnswer("12ab3", plain), "123");
    assert.equal(sanitizeAnswer("-12", plain), "12"); // no negatives in this round
    assert.equal(sanitizeAnswer("1.5", plain), "15"); // no decimals either
    assert.equal(sanitizeAnswer("-12", { allowNegative: true, decimals: false }), "-12");
    assert.equal(sanitizeAnswer("−12", { allowNegative: true, decimals: false }), "-12");
    assert.equal(sanitizeAnswer("1-2", { allowNegative: true, decimals: false }), "12"); // a minus only counts at the start
    assert.equal(sanitizeAnswer("1.2.3", { allowNegative: false, decimals: true }), "1.23");
    assert.equal(sanitizeAnswer("9".repeat(40), plain).length, 16);
  });

  it("only produces text the checker accepts", () => {
    for (const typed of ["-3.5", "12", "0.25", "-0", "7."]) {
      const clean = sanitizeAnswer(typed, { allowNegative: true, decimals: true });
      if (clean !== "7." && clean !== "") assert.equal(parseAnswerText(clean).ok, true, clean);
    }
  });
});

describe("sequence validation", () => {
  const c = config({ digits: 2, flashes: 3, operations: ["add", "subtract", "multiply", "divide"] });

  it("accepts a sequence that fits the settings", () => {
    assert.equal(checkSequence(c, seq("20", "*30", "-15")), null);
  });

  it("rejects numbers of the wrong size, wrong operators and the wrong length", () => {
    assert.match(checkSequence(c, seq("5", "+10", "+10")) ?? "", /2 digits/);
    assert.match(checkSequence(c, seq("100", "+10", "+10")) ?? "", /2 digits/);
    assert.match(checkSequence(config({ operations: ["add"], flashes: 3 }), seq("10", "-10", "+10")) ?? "", /not enabled/);
    assert.match(checkSequence(c, seq("10", "+10")) ?? "", /Expected 3/);
  });

  it("enforces the sign, decimal and size rules", () => {
    assert.match(checkSequence(c, seq("10", "+-20", "+10")) ?? "", /negative/);
    assert.match(checkSequence(c, seq("10", "+15.5", "+10")) ?? "", /decimal/);
    assert.match(checkSequence(c, seq("10", "-20", "+10")) ?? "", /limits/); // total would go below zero
    assert.match(checkSequence(config({ ...c, flashes: 4 }), seq("99", "*99", "*99", "*99")) ?? "", /limits/); // 96 million is past the cap
  });

  it("rejects a total that needs more decimal places than allowed, and division by zero", () => {
    const decimals = config({ digits: 1, flashes: 3, operations: ["multiply", "divide"], decimals: true, decimalPlaces: 1 });
    assert.match(checkSequence(decimals, seq("2.5", "*2.5", "*2")) ?? "", /limits/); // 6.25
    assert.match(checkSequence(decimals, seq("3", "/2", "/4")) ?? "", /limits/); // 1.5 then 0.375
  });

  it("rejects non-canonical numbers", () => {
    const c2 = config({ digits: 1, flashes: 2, decimals: true });
    assert.notEqual(checkSequence(c2, seq("1.50", "+2")), null);
    assert.notEqual(checkSequence(c2, seq("01", "+2")), null);
  });
});

describe("generator", () => {
  it("is repeatable for a given seed", () => {
    const a = generateRound(PRESETS[2].round, seededRng(7));
    const b = generateRound(PRESETS[2].round, seededRng(7));
    assert.deepEqual(a.flashes, b.flashes);
  });

  it("builds a valid sequence for every preset, every time", () => {
    for (const preset of PRESETS) {
      for (let seed = 1; seed <= 150; seed++) {
        const round = generateRound(preset.round, seededRng(seed * 31 + preset.rounds));
        assert.equal(checkSequence(round.config, round.flashes), null, `${preset.id} seed ${seed}: ${JSON.stringify(round.flashes)}`);
        assert.ok(evaluateSequence(round.flashes).ok);
      }
    }
  });

  it("holds its invariants across random settings", () => {
    const rng = seededRng(99);
    const pick = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
    let built = 0;
    for (let i = 0; i < 400; i++) {
      const operations = OPERATIONS.filter(() => rng() < 0.55);
      const c: RoundConfig = {
        flashes: pick(LIMITS.flashes.min, 9),
        digits: pick(1, 3),
        operations: operations.length ? operations : ["add"],
        allowNegative: rng() < 0.5,
        decimals: rng() < 0.5,
        decimalPlaces: pick(1, 3),
        displayMs: 500,
        gapMs: 200,
      };
      try {
        const round = generateRound(c, seededRng(i + 1000));
        built += 1;
        assert.equal(checkSequence(c, round.flashes), null, JSON.stringify(c));
        const result = evaluateSequence(round.flashes);
        assert.ok(result.ok);
        if (!c.allowNegative) assert.ok(result.steps.every((s) => !s.total.startsWith("-")), "no negative totals");
        for (const f of round.flashes.slice(1)) assert.ok(f.op && c.operations.includes(f.op));
        assert.ok(round.flashes.every((f) => f.op !== "divide" || Number(f.value) !== 0));
      } catch (error) {
        // Some settings genuinely have no valid sequence; those must be reported, not produce bad rounds.
        assert.ok(error instanceof GenerationError, String(error));
      }
    }
    assert.ok(built > 250, `only ${built} of 400 random settings could be built`);
  });

  it("uses every enabled operation in a long sequence", () => {
    const c = config({ flashes: 12, digits: 2, operations: ["add", "subtract", "multiply", "divide"], allowNegative: true });
    for (let seed = 1; seed <= 20; seed++) {
      const used = new Set(generateRound(c, seededRng(seed)).flashes.map((f) => f.op));
      for (const op of OPERATIONS) assert.ok(used.has(op), `${op} missing for seed ${seed}`);
    }
  });

  it("only produces negatives and decimals when asked", () => {
    const plain = config({ operations: ["add", "subtract", "multiply"], flashes: 8 });
    const rich = config({ operations: ["add", "subtract", "multiply"], flashes: 8, allowNegative: true, decimals: true, decimalPlaces: 2 });
    let negatives = 0;
    let decimals = 0;
    for (let seed = 1; seed <= 60; seed++) {
      assert.ok(generateRound(plain, seededRng(seed)).flashes.every((f) => !f.value.includes("-") && !f.value.includes(".")));
      for (const f of generateRound(rich, seededRng(seed)).flashes) {
        if (f.value.startsWith("-")) negatives += 1;
        if (f.value.includes(".")) decimals += 1;
      }
    }
    assert.ok(negatives > 0 && decimals > 0);
  });

  it("divides only exactly and never by zero", () => {
    const c = config({ flashes: 10, digits: 1, operations: ["divide", "multiply"], decimals: true, decimalPlaces: 2 });
    for (let seed = 1; seed <= 100; seed++) {
      const round = generateRound(c, seededRng(seed));
      const result = evaluateSequence(round.flashes);
      assert.ok(result.ok);
    }
  });

  it("reports settings that cannot work instead of looping or returning a bad round", () => {
    // Four-digit numbers multiplied four times always overshoot the size limit.
    assert.throws(() => generateRound(config({ digits: 4, flashes: 5, operations: ["multiply"] }), seededRng(1)), GenerationError);
    // Two-digit divisors run out of dividends after one division.
    assert.throws(() => generateRound(config({ digits: 2, flashes: 6, operations: ["divide"] }), seededRng(1)), GenerationError);
    assert.throws(() => generateSession([config(), config({ digits: 2, flashes: 6, operations: ["divide"] })], seededRng(1)), /Round 2/);
  });

  it("builds a whole session up front", () => {
    const rounds = generateSession([PRESETS[1].round, PRESETS[0].round, PRESETS[3].round], seededRng(5));
    assert.equal(rounds.length, 3);
    assert.equal(rounds[1].flashes.length, PRESETS[0].round.flashes);
  });
});

describe("config", () => {
  it("accepts every preset and the default", () => {
    for (const preset of PRESETS) assert.equal(parseRoundConfig(preset.round).ok, true, preset.id);
    assert.equal(parseRoundConfig(DEFAULT_ROUND).ok, true);
  });

  it("rejects out-of-range or malformed settings", () => {
    const bad: unknown[] = [
      null,
      [],
      { ...DEFAULT_ROUND, flashes: 1 },
      { ...DEFAULT_ROUND, flashes: 16 },
      { ...DEFAULT_ROUND, digits: 0 },
      { ...DEFAULT_ROUND, digits: 5 },
      { ...DEFAULT_ROUND, operations: [] },
      { ...DEFAULT_ROUND, operations: ["power"] },
      { ...DEFAULT_ROUND, displayMs: 150 },
      { ...DEFAULT_ROUND, displayMs: 1050 },
      { ...DEFAULT_ROUND, gapMs: 0 },
      { ...DEFAULT_ROUND, decimalPlaces: 4 },
      { ...DEFAULT_ROUND, allowNegative: "yes" },
    ];
    for (const item of bad) assert.equal(parseRoundConfig(item).ok, false, JSON.stringify(item));
    assert.equal(parseSetup([]), null);
    assert.equal(parseSetup(Array.from({ length: 21 }, () => DEFAULT_ROUND)), null);
  });

  it("puts operations in a fixed order without repeats", () => {
    const parsed = parseRoundConfig({ ...DEFAULT_ROUND, operations: ["divide", "add", "add"] });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.config.operations, ["add", "divide"]);
  });

  it("orders the preset difficulties", () => {
    assert.deepEqual(PRESETS.map((p) => difficultyLevel(p.round)), ["Easy", "Medium", "Hard", "Expert"]);
    const multipliers = PRESETS.map((p) => difficultyMultiplier(p.round));
    assert.deepEqual([...multipliers].sort((a, b) => a - b), multipliers);
    assert.equal(difficultyMultiplier(config({ digits: 1, flashes: 3, operations: ["add"], displayMs: 3000 })), 1);
  });
});

describe("scoring", () => {
  const easy = config({ digits: 1, flashes: 3, operations: ["add"], displayMs: 3000 }); // multiplier 1
  const played = (flashes: Flash[], answer: string | null, c = easy, responseMs = 2000): PlayedRound => ({ config: c, flashes, answer, responseMs });

  it("pays base points times the multiplier for a correct round and nothing otherwise", () => {
    const flashes = seq("2", "+3", "+4");
    assert.equal(scoreRound(played(flashes, "9")).points, 100);
    assert.equal(scoreRound(played(flashes, "8")).points, 0);
    assert.equal(scoreRound(played(flashes, null)).points, 0);
    assert.equal(scoreRound(played(flashes, "nine")).points, 0);
    const harder = config({ digits: 2, flashes: 3, operations: ["add"], displayMs: 3000 });
    assert.equal(scoreRound(played(seq("20", "+30", "+40"), "90", harder)).points, 150);
  });

  it("marks unusable input as not answered", () => {
    const flashes = seq("2", "+3", "+4");
    assert.equal(scoreRound(played(flashes, "nine")).answered, false);
    assert.equal(scoreRound(played(flashes, "8")).answered, true);
    assert.equal(scoreRound(played(flashes, null)).answered, false);
  });

  it("totals a session", () => {
    const rounds = [played(seq("2", "+3", "+4"), "9", easy, 1000), played(seq("1", "+1", "+1"), "4", easy, 3000), played(seq("5", "+5", "+5"), "15", easy, 5000)];
    const score = scoreSession(rounds);
    assert.equal(score.score, 200);
    assert.equal(score.maxScore, 300);
    assert.equal(score.correct, 2);
    assert.equal(score.total, 3);
    assert.equal(score.accuracy, 66);
    assert.equal(score.averageResponseMs, 3000);
    assert.equal(scoreSession([]).accuracy, 0);
  });

  it("scores the sequence that was flashed, which is the one in the record", () => {
    const round = generateRound(PRESETS[1].round, seededRng(11));
    const answer = answerOf(round.flashes);
    const outcome = scoreRound({ config: round.config, flashes: round.flashes, answer, responseMs: 1500 });
    assert.equal(outcome.correct, true);
    assert.equal(outcome.correctAnswer, answer);
  });
});

describe("timeline", () => {
  it("counts down, signals, then flashes with the configured display time and gap", () => {
    const events = buildTimeline({ flashes: 3, displayMs: 800, gapMs: 300 });
    assert.deepEqual(events.slice(0, 4).map((e) => [e.at, e.kind]), [[0, "count"], [1000, "count"], [2000, "count"], [3000, "go"]]);
    const shows = events.filter((e) => e.kind === "show").map((e) => e.at);
    const hides = events.filter((e) => e.kind === "hide").map((e) => e.at);
    assert.deepEqual(shows, [3600, 4700, 5800]);
    assert.deepEqual(hides, [4400, 5500, 6600]);
    assert.equal(timelineLength(events), 6600);
  });

  it("opens the answer only after the last number is hidden", () => {
    const events = buildTimeline({ flashes: 4, displayMs: 500, gapMs: 200 });
    const lastHide = events.filter((e) => e.kind === "hide").at(-1)!;
    const answerIndex = events.findIndex((e) => e.kind === "answer");
    assert.equal(events.filter((e) => e.kind === "answer").length, 1);
    assert.ok(events[answerIndex].at >= lastHide.at);
    assert.ok(events.indexOf(lastHide) < answerIndex);
    // The blank gap always separates one number from the next.
    for (let i = 0; i < 3; i++) {
      const hide = events.find((e) => e.kind === "hide" && e.index === i)!;
      const next = events.find((e) => e.kind === "show" && e.index === i + 1)!;
      assert.equal(next.at - hide.at, 200);
    }
  });

  it("schedules every event at its own time and can be cancelled", () => {
    const scheduled: { fn: () => void; ms: number; cancelled: boolean }[] = [];
    const timers: Timers = {
      setTimeout: (fn, ms) => scheduled.push({ fn, ms, cancelled: false }) - 1,
      clearTimeout: (h) => {
        scheduled[h as number].cancelled = true;
      },
    };
    const events = buildTimeline({ flashes: 2, displayMs: 400, gapMs: 100 });
    const fired: string[] = [];
    const cancel = runTimeline(events, (e) => fired.push(e.kind), timers);
    assert.deepEqual(scheduled.map((s) => s.ms), events.map((e) => e.at));
    scheduled.slice(0, 5).forEach((s) => s.fn());
    cancel();
    assert.ok(scheduled.slice(5).every((s) => s.cancelled));
    assert.deepEqual(fired, ["count", "count", "count", "go", "show"]);
  });
});

describe("saved sessions", () => {
  const sessionFrom = (seed: number, answerRight = true): SessionData => {
    const rounds = generateSession([PRESETS[0].round, PRESETS[1].round], seededRng(seed)).map((r) => ({
      config: r.config,
      flashes: r.flashes,
      answer: answerRight ? answerOf(r.flashes) : "0.123",
      responseMs: 1800,
    }));
    return { clientId: `session-${seed}-abcdefgh`, startedAt: 1_700_000_000_000 + seed, endedAt: 1_700_000_060_000 + seed, rounds };
  };

  it("round-trips through the strict parser", () => {
    const data = sessionFrom(1);
    const parsed = parseSessionData(JSON.parse(JSON.stringify(data)), data.endedAt + 1000);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data, data);
  });

  it("rejects tampered or malformed sessions", () => {
    const base = sessionFrom(2);
    const clone = (): SessionData => JSON.parse(JSON.stringify(base));
    const cases: [string, (s: SessionData) => void][] = [
      ["bad client id", (s) => void (s.clientId = "x y")],
      ["ends before it starts", (s) => void (s.endedAt = s.startedAt - 1)],
      ["no rounds", (s) => void (s.rounds = [])],
      ["a sequence that does not fit its settings", (s) => void (s.rounds[0].config.digits = 3)],
      ["an operator that is not enabled", (s) => void (s.rounds[0].flashes[1].op = "divide")],
      ["division by zero", (s) => void ((s.rounds[0].config.operations = ["divide"]), (s.rounds[0].flashes[1] = { op: "divide", value: "0" }))],
      ["a response time of a day", (s) => void (s.rounds[0].responseMs = 86_400_000)],
      ["a very long answer", (s) => void (s.rounds[0].answer = "1".repeat(40))],
    ];
    for (const [name, change] of cases) {
      const s = clone();
      change(s);
      assert.equal(parseSessionData(s).ok, false, name);
    }
    assert.equal(parseSessionData(base, base.endedAt - 10 * 60 * 1000).ok, false, "from the future");
    assert.equal(parseSessionData(null).ok, false);
  });

  it("does not take correctness or points from the upload", () => {
    const data = sessionFrom(3, false);
    const smuggled = { ...data, score: 99999, rounds: data.rounds.map((r) => ({ ...r, correct: true, points: 500 })) };
    const parsed = parseSessionData(smuggled);
    assert.ok(parsed.ok);
    assert.equal(scoreSession(parsed.data.rounds).score, 0);
    assert.equal("score" in parsed.data, false);
  });
});

describe("statistics", () => {
  const rounds = (c: RoundConfig, correct: boolean[], responseMs = 2000): PlayedRound[] =>
    correct.map((ok, i) => {
      const r = generateRound(c, seededRng(i + 1));
      return { config: c, flashes: r.flashes, answer: ok ? answerOf(r.flashes) : "123456", responseMs };
    });
  const session = (id: string, endedAt: number, rs: PlayedRound[]): SessionData => ({ clientId: id.padEnd(8, "0"), startedAt: endedAt - 1000, endedAt, rounds: rs });

  it("is empty for a new player", () => {
    const s = computeStats([]);
    assert.equal(s.sessions, 0);
    assert.equal(s.bestScore, 0);
    assert.equal(s.accuracy, 0);
    assert.deepEqual(s.recent, []);
  });

  it("aggregates accuracy, best score, speed, difficulty and operations", () => {
    const easy = PRESETS[0].round; // add, subtract
    const medium = PRESETS[1].round; // add, subtract, multiply
    const a = session("aaaaaaaa", 2000, rounds(easy, [true, true, false]));
    const b = session("bbbbbbbb", 3000, rounds(medium, [true, false], 4000));
    const s = computeStats([a, b]);
    assert.equal(s.sessions, 2);
    assert.equal(s.rounds, 5);
    assert.equal(s.correct, 3);
    assert.equal(s.accuracy, 60);
    assert.equal(s.averageResponseMs, 2800);
    assert.equal(s.bestScore, Math.max(scoreSession(a.rounds).score, scoreSession(b.rounds).score));
    assert.equal(s.byLevel.Easy.rounds, 3);
    assert.equal(s.byLevel.Easy.accuracy, 66);
    assert.equal(s.byLevel.Medium.rounds, 2);
    assert.equal(s.byLevel.Hard.rounds, 0);
    assert.equal(s.byOperation.add.rounds, 5);
    assert.equal(s.byOperation.multiply.rounds, 2);
    assert.equal(s.byOperation.divide.rounds, 0);
    assert.deepEqual(s.recent.map((r) => r.clientId), [b.clientId, a.clientId]);
  });
});

describe("device storage", () => {
  class MemoryStorage {
    items = new Map<string, string>();
    getItem(key: string) {
      return this.items.get(key) ?? null;
    }
    setItem(key: string, value: string) {
      this.items.set(key, value);
    }
    removeItem(key: string) {
      this.items.delete(key);
    }
  }
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as { localStorage?: unknown }).localStorage = storage;
  });

  const guest = { key: "mathz:guest:v1", syncable: false };
  const account = { key: "mathz:user:v1:7", syncable: true };
  const make = (n: number): SessionData => {
    const r = generateRound(PRESETS[0].round, seededRng(n));
    return { clientId: `client-${n}-abcdefgh`, startedAt: 1_700_000_000_000 + n * 1000, endedAt: 1_700_000_000_500 + n * 1000, rounds: [{ config: r.config, flashes: r.flashes, answer: answerOf(r.flashes), responseMs: 900 }] };
  };

  it("saves a session once, however many times it is saved", () => {
    assert.equal(saveSession(guest, make(1)), true);
    assert.equal(saveSession(guest, make(1)), true);
    assert.equal(loadHistory(guest).length, 1);
    assert.deepEqual(loadHistory(guest)[0], make(1));
  });

  it("keeps guests and accounts apart, and never flags a guest's sessions for upload", () => {
    saveSession(guest, make(1));
    saveSession(account, make(2));
    assert.deepEqual(loadHistory(guest).map((s) => s.clientId), [make(1).clientId]);
    assert.deepEqual(loadHistory(account).map((s) => s.clientId), [make(2).clientId]);
    assert.equal(pendingSessions(guest).length, 0);
    assert.equal(pendingSessions(account).length, 1);
  });

  it("marks sessions uploaded and merges history from another device", () => {
    saveSession(account, make(1));
    saveSession(account, make(2));
    markSynced(account, [make(1).clientId]);
    assert.deepEqual(pendingSessions(account).map((s) => s.clientId), [make(2).clientId]);
    assert.equal(mergeRemote(account, [make(1), make(3)]), 1);
    assert.equal(loadHistory(account).length, 3);
    assert.equal(pendingSessions(account).length, 1);
    assert.equal(mergeRemote(account, [make(3)]), 0);
  });

  it("drops the oldest uploaded sessions beyond the limit but keeps those still waiting", () => {
    for (let n = 1; n <= 105; n++) saveSession(account, make(n));
    assert.equal(loadHistory(account).length, 105); // all are still waiting to be uploaded
    markSynced(account, Array.from({ length: 60 }, (_, i) => make(i + 1).clientId));
    saveSession(account, make(106));
    const ids = loadHistory(account).map((s) => s.clientId);
    assert.equal(ids.length, 100);
    assert.ok(ids.includes(make(106).clientId));
    assert.ok(ids.includes(make(105).clientId));
    assert.ok(!ids.includes(make(1).clientId));
  });

  it("ignores damaged data and falls back to defaults", () => {
    storage.setItem("mathz:guest:v1:mindsprint", "{not json");
    assert.deepEqual(loadHistory(guest), []);
    storage.setItem("mathz:guest:v1:mindsprint", JSON.stringify([make(1), { clientId: "bad", rounds: [] }]));
    assert.equal(loadHistory(guest).length, 1);
    storage.setItem("mathz:mindsprint:setup", "[]");
    assert.equal(loadSetup().length, 5);
  });

  it("remembers the setup", () => {
    saveSetup([PRESETS[3].round, PRESETS[0].round]);
    assert.deepEqual(loadSetup(), [PRESETS[3].round, PRESETS[0].round]);
  });

  it("survives storage that refuses to write", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    assert.equal(saveSession(guest, make(1)), false);
  });
});
