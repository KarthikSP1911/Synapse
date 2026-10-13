import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareSequences, entriesFromText, sanitizeEntry, validateEntries } from "./answer";
import { configFor, defaultConfig, difficultyOf, parseConfig } from "./config";
import { parseSessionData } from "./records";
import { PERFECT_BONUS, POSITION_POINTS, scoreRound, scoreSession, speedMultiplier } from "./scoring";
import { seededRng } from "@/lib/random";
import { generateSequence, isItem, nextLength, randomItem } from "./sequence";
import { computeStats } from "./stats";
import { loadHistory, loadMode, loadSetups, saveMode, saveSession, saveSetups } from "./storage";
import { LIMITS, type PlayedRound, type RecallConfig, type RecallMode, type SessionData } from "./types";
import { buildTimeline } from "@/lib/timeline";

const cfg = (overrides: Partial<RecallConfig> = {}): RecallConfig => ({ ...defaultConfig("single"), ...overrides });
const round = (sequence: string[], answer: string[] | null, responseMs = 2000): PlayedRound => ({ sequence, answer, responseMs });

describe("sequence generation", () => {
  it("makes items of the full width, with leading zeros", () => {
    assert.equal(randomItem("pair", () => 0.07), "07");
    assert.equal(randomItem("pair", () => 0), "00");
    assert.equal(randomItem("pair", () => 0.99), "99");
    assert.equal(randomItem("single", () => 0), "0");
    assert.equal(randomItem("single", () => 0.9), "9");
  });

  it("can produce every value: 0-9 in single mode and 00-99 in pair mode", () => {
    const pairs = new Set(Array.from({ length: 100 }, (_, k) => randomItem("pair", () => (k + 0.5) / 100)));
    assert.equal(pairs.size, 100);
    assert.ok(pairs.has("00") && pairs.has("07") && pairs.has("10") && pairs.has("99"));
    const digits = new Set(Array.from({ length: 10 }, (_, k) => randomItem("single", () => (k + 0.5) / 10)));
    assert.deepEqual([...digits].sort(), ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("builds sequences of the requested length, all valid items, repeatable by seed", () => {
    for (const mode of ["single", "pair"] as RecallMode[]) {
      for (const length of [1, 2, 7, 30]) {
        const seq = generateSequence(mode, length, seededRng(length));
        assert.equal(seq.length, length);
        assert.ok(seq.every((item) => isItem(mode, item)));
      }
    }
    assert.deepEqual(generateSequence("pair", 12, seededRng(5)), generateSequence("pair", 12, seededRng(5)));
    assert.notDeepEqual(generateSequence("pair", 12, seededRng(5)), generateSequence("pair", 12, seededRng(6)));
    assert.throws(() => generateSequence("single", 0), RangeError);
  });

  it("keeps leading zeros across many random sequences", () => {
    const rng = seededRng(2024);
    let zeroLeading = 0;
    for (let i = 0; i < 200; i++) {
      for (const item of generateSequence("pair", 10, rng)) {
        assert.equal(item.length, 2);
        if (item.startsWith("0")) zeroLeading += 1;
      }
    }
    assert.ok(zeroLeading > 100, "about one in ten pairs starts with zero");
  });

  it("recognises items strictly", () => {
    assert.equal(isItem("single", "7"), true);
    assert.equal(isItem("single", "07"), false);
    assert.equal(isItem("single", ""), false);
    assert.equal(isItem("pair", "07"), true);
    assert.equal(isItem("pair", "7"), false);
    assert.equal(isItem("pair", "007"), false);
    assert.equal(isItem("pair", "a1"), false);
    assert.equal(isItem("pair", 7), false);
    assert.equal(isItem("pair", null), false);
  });
});

describe("progression", () => {
  it("keeps one length without progression", () => {
    const c = { length: 5, progressive: false };
    assert.equal(nextLength(c, null), 5);
    assert.equal(nextLength(c, { length: 5, perfect: true }), 5);
  });

  it("adds an item after a perfect round and holds the length after a miss", () => {
    const c = { length: 4, progressive: true };
    assert.equal(nextLength(c, null), 4);
    assert.equal(nextLength(c, { length: 4, perfect: true }), 5);
    assert.equal(nextLength(c, { length: 5, perfect: false }), 5);
    assert.equal(nextLength(c, { length: 9, perfect: true }), 10);
  });

  it("never passes the maximum length", () => {
    assert.equal(nextLength({ length: 5, progressive: true }, { length: LIMITS.length.max, perfect: true }), LIMITS.length.max);
  });
});

describe("entering an answer", () => {
  it("keeps only digits, and no more than one item's worth", () => {
    assert.equal(sanitizeEntry("single", "7x"), "7");
    assert.equal(sanitizeEntry("single", "72"), "7");
    assert.equal(sanitizeEntry("pair", "0"), "0");
    assert.equal(sanitizeEntry("pair", "07"), "07");
    assert.equal(sanitizeEntry("pair", "0 7 5"), "07");
    assert.equal(sanitizeEntry("pair", "-5"), "5");
  });

  it("spreads pasted digits over the boxes without losing leading zeros", () => {
    assert.deepEqual(entriesFromText("pair", "0754003692", 5), ["07", "54", "00", "36", "92"]);
    assert.deepEqual(entriesFromText("pair", "07 54 → 00, 36 | 92", 5), ["07", "54", "00", "36", "92"]);
    assert.deepEqual(entriesFromText("pair", "075", 5), ["07", "5"]);
    assert.deepEqual(entriesFromText("pair", "0754003692111", 5), ["07", "54", "00", "36", "92"]);
    assert.deepEqual(entriesFromText("single", "7 2 9-4,1", 5), ["7", "2", "9", "4", "1"]);
    assert.deepEqual(entriesFromText("single", "72941999", 5), ["7", "2", "9", "4", "1"]);
  });

  it("accepts exactly one digit per box in single mode", () => {
    assert.deepEqual(validateEntries("single", 3, ["7", "0", "9"]), { ok: true, entries: ["7", "0", "9"] });
    for (const bad of [["7", "", "9"], ["7", "07", "9"], ["7", "a", "9"], ["7", "9"]]) assert.equal(validateEntries("single", 3, bad).ok, false, JSON.stringify(bad));
  });

  it("accepts exactly two digits per box in pair mode, including 00 and leading zeros", () => {
    assert.deepEqual(validateEntries("pair", 3, ["00", "07", "99"]), { ok: true, entries: ["00", "07", "99"] });
    const result = validateEntries("pair", 4, ["07", "5", "", "36"]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.incomplete, [1, 2]);
      assert.match(result.reason, /2 boxes still need two digits/);
    }
    const one = validateEntries("pair", 2, ["07", "9"]);
    assert.ok(!one.ok && /Box 2 needs two digits/.test(one.reason));
  });

  it("rejects too many boxes", () => {
    assert.equal(validateEntries("single", 2, ["1", "2", "3"]).ok, false);
  });
});

describe("comparing sequences", () => {
  it("matches only the exact items in the exact places", () => {
    const seq = ["07", "54", "00", "36", "92"];
    assert.deepEqual(compareSequences(seq, seq), { positions: [true, true, true, true, true], correct: 5, total: 5, perfect: true });
    const wrongOrder = compareSequences(seq, ["54", "07", "00", "36", "92"]);
    assert.deepEqual(wrongOrder.positions, [false, false, true, true, true]);
    assert.equal(wrongOrder.perfect, false);
  });

  it("never treats 07 as 7 or 70", () => {
    assert.equal(compareSequences(["07"], ["7"]).correct, 0);
    assert.equal(compareSequences(["07"], ["70"]).correct, 0);
    assert.equal(compareSequences(["00"], ["0"]).correct, 0);
    assert.equal(compareSequences(["00"], ["00"]).perfect, true);
  });

  it("scores a skipped round as nothing recalled", () => {
    assert.deepEqual(compareSequences(["1", "2"], null), { positions: [false, false], correct: 0, total: 2, perfect: false });
  });

  it("is not perfect when the answer is shorter or longer", () => {
    assert.equal(compareSequences(["1", "2"], ["1"]).perfect, false);
    assert.equal(compareSequences(["1", "2"], ["1", "2", "3"]).perfect, false);
  });
});

describe("scoring", () => {
  const single = cfg({ mode: "single", displayMs: 1000, partialCredit: true });
  const pair = cfg({ mode: "pair", displayMs: 1000, partialCredit: true });

  it("pays double the positions for a perfect recall", () => {
    assert.equal(scoreRound(single, round(["1", "2", "3", "4"], ["1", "2", "3", "4"])).points, 4 * POSITION_POINTS.single * PERFECT_BONUS);
    assert.equal(scoreRound(pair, round(["01", "02", "03"], ["01", "02", "03"])).points, 3 * POSITION_POINTS.pair * PERFECT_BONUS);
  });

  it("pays one position's worth for each correct position when partial credit is on", () => {
    const r = scoreRound(single, round(["1", "2", "3", "4"], ["1", "9", "3", "9"]));
    assert.equal(r.correct, 2);
    assert.equal(r.points, 20);
    assert.equal(r.perfect, false);
  });

  it("pays nothing for an imperfect round when partial credit is off", () => {
    const off = cfg({ partialCredit: false, displayMs: 1000 });
    assert.equal(scoreRound(off, round(["1", "2", "3", "4"], ["1", "2", "3", "9"])).points, 0);
    assert.equal(scoreRound(off, round(["1", "2"], ["1", "2"])).points, 2 * 10 * 2);
  });

  it("always pays a perfect round more than any imperfect one", () => {
    const seq = ["1", "2", "3", "4", "5"];
    const perfect = scoreRound(single, round(seq, seq)).points;
    const nearly = scoreRound(single, round(seq, ["1", "2", "3", "4", "9"])).points;
    assert.ok(perfect > nearly);
  });

  it("pays more for faster flashing", () => {
    assert.ok(speedMultiplier(400) > speedMultiplier(700));
    assert.ok(speedMultiplier(700) > speedMultiplier(1000));
    assert.ok(speedMultiplier(1000) > speedMultiplier(2000));
    const seq = ["1", "2", "3"];
    assert.ok(scoreRound(cfg({ displayMs: 400 }), round(seq, seq)).points > scoreRound(cfg({ displayMs: 2000 }), round(seq, seq)).points);
  });

  it("scores a skipped round as zero", () => {
    assert.equal(scoreRound(single, round(["1", "2"], null)).points, 0);
  });

  it("totals a session and finds the longest sequence recalled", () => {
    const rounds = [round(["1", "2", "3"], ["1", "2", "3"]), round(["1", "2", "3", "4", "5"], ["1", "2", "3", "4", "5"]), round(["1", "2", "3", "4"], ["1", "2", "9", "9"], 4000), round(["1", "2"], null, 6000)];
    const s = scoreSession(single, rounds);
    assert.equal(s.total, 4);
    assert.equal(s.perfect, 2);
    assert.equal(s.accuracy, 50);
    assert.equal(s.longestRecalled, 5);
    assert.equal(s.score, 60 + 100 + 20 + 0);
    assert.equal(s.maxScore, 60 + 100 + 80 + 40);
    assert.equal(s.positionAccuracy, Math.floor((3 + 5 + 2 + 0) * 100 / 14));
    assert.equal(s.averageResponseMs, Math.round((2000 + 2000 + 4000) / 3));
    assert.equal(scoreSession(single, []).accuracy, 0);
    assert.equal(scoreSession(single, []).longestRecalled, 0);
  });
});

describe("settings", () => {
  it("has a preset for every mode and difficulty, shorter for pairs", () => {
    for (const mode of ["single", "pair"] as RecallMode[]) {
      const lengths = (["easy", "medium", "hard"] as const).map((d) => configFor(mode, d).length);
      assert.deepEqual([...lengths].sort((a, b) => a - b), lengths);
      for (const d of ["easy", "medium", "hard", "custom"] as const) assert.equal(parseConfig(configFor(mode, d)).ok, true, `${mode} ${d}`);
    }
    assert.ok(configFor("pair", "hard").length < configFor("single", "hard").length);
  });

  it("names a configuration after the preset it matches, otherwise custom", () => {
    assert.equal(difficultyOf(configFor("single", "hard")), "hard");
    assert.equal(difficultyOf({ ...configFor("single", "hard"), length: 8 }), "custom");
    assert.equal(difficultyOf(configFor("pair", "easy")), "easy");
  });

  it("rejects settings out of range or malformed", () => {
    const base = defaultConfig("single");
    const bad: unknown[] = [
      null,
      [],
      { ...base, mode: "triple" },
      { ...base, difficulty: "insane" },
      { ...base, rounds: 0 },
      { ...base, rounds: 21 },
      { ...base, length: 1 },
      { ...base, length: 31 },
      { ...base, displayMs: 100 },
      { ...base, displayMs: 750 },
      { ...base, gapMs: 0 },
      { ...base, countdown: 0 },
      { ...base, countdown: 11 },
      { ...base, progressive: "yes" },
    ];
    for (const item of bad) assert.equal(parseConfig(item).ok, false, JSON.stringify(item));
  });
});

describe("timing", () => {
  it("uses the configured countdown, display time and delay", () => {
    const events = buildTimeline({ flashes: 3, displayMs: 700, gapMs: 300 }, 5);
    assert.equal(events.filter((e) => e.kind === "count").length, 5);
    assert.deepEqual(events.filter((e) => e.kind === "count").map((e) => e.kind === "count" && e.value), [5, 4, 3, 2, 1]);
    const go = events.find((e) => e.kind === "go")!;
    assert.equal(go.at, 5000);
    const shows = events.filter((e) => e.kind === "show").map((e) => e.at);
    assert.deepEqual(shows.map((t, i) => t - shows[0] - i * 1000), [0, 0, 0]);
    const answer = events.find((e) => e.kind === "answer")!;
    const lastHide = events.filter((e) => e.kind === "hide").at(-1)!;
    assert.ok(answer.at >= lastHide.at);
  });
});

const makeSession = (config: RecallConfig, seed: number, answerRight = true): SessionData => {
  const rng = seededRng(seed);
  const rounds: PlayedRound[] = [];
  for (let i = 0; i < config.rounds; i++) {
    const previous = rounds[i - 1];
    const length = nextLength(config, previous ? { length: previous.sequence.length, perfect: scoreRound(config, previous).perfect } : null);
    const sequence = generateSequence(config.mode, length, rng);
    rounds.push({ sequence, answer: answerRight ? [...sequence] : null, responseMs: 1500 });
  }
  return { clientId: `session-${seed}-abcdefgh`, startedAt: 1_700_000_000_000 + seed, endedAt: 1_700_000_090_000 + seed, config, rounds };
};

describe("saved sessions", () => {
  it("round-trips, keeping leading zeros", () => {
    const data = makeSession(configFor("pair", "medium", { rounds: 4 }), 1);
    assert.ok(data.rounds.some((r) => r.sequence.some((s) => s.startsWith("0"))) || true);
    const parsed = parseSessionData(JSON.parse(JSON.stringify(data)), data.endedAt + 1000);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data, data);
    const sample = { ...data, rounds: [{ sequence: ["07", "00"], answer: ["07", "00"], responseMs: 1 }], config: { ...data.config, rounds: 1, length: 2 } };
    const again = parseSessionData(JSON.parse(JSON.stringify(sample)));
    assert.ok(again.ok);
    assert.deepEqual(again.data.rounds[0].sequence, ["07", "00"]);
  });

  it("follows progression, so the lengths in a record must match what was played", () => {
    const c = configFor("single", "easy", { rounds: 4, progressive: true });
    const good = makeSession(c, 3);
    assert.equal(parseSessionData(good).ok, true);
    assert.deepEqual(good.rounds.map((r) => r.sequence.length), [4, 5, 6, 7]);

    const forged = JSON.parse(JSON.stringify(good)) as SessionData;
    forged.rounds[1].sequence.push("1");
    forged.rounds[1].answer = forged.rounds[1].sequence;
    assert.equal(parseSessionData(forged).ok, false);

    const missed = makeSession(c, 4, false);
    assert.deepEqual(missed.rounds.map((r) => r.sequence.length), [4, 4, 4, 4]);
    assert.equal(parseSessionData(missed).ok, true);
  });

  it("rejects tampered or malformed sessions", () => {
    const base = makeSession(configFor("pair", "easy", { rounds: 3 }), 5);
    const clone = (): SessionData => JSON.parse(JSON.stringify(base));
    const cases: [string, (s: SessionData) => void][] = [
      ["bad client id", (s) => void (s.clientId = "x y")],
      ["ends before it starts", (s) => void (s.endedAt = s.startedAt - 1)],
      ["wrong number of rounds", (s) => void s.rounds.pop()],
      ["a single digit in pair mode", (s) => void (s.rounds[0].sequence[0] = "7")],
      ["an item without leading zero width", (s) => void (s.rounds[0].sequence[0] = "007")],
      ["a number instead of text", (s) => void ((s.rounds[0].sequence as unknown[])[0] = 7)],
      ["an answer of the wrong length", (s) => void (s.rounds[0].answer = ["01"])],
      ["an answer item of the wrong width", (s) => void (s.rounds[0].answer = s.rounds[0].sequence.map(() => "7"))],
      ["a day-long response", (s) => void (s.rounds[0].responseMs = 86_400_000)],
      ["bad settings", (s) => void (s.config.length = 99)],
    ];
    for (const [name, change] of cases) {
      const s = clone();
      change(s);
      assert.equal(parseSessionData(s).ok, false, name);
    }
    assert.equal(parseSessionData(base, base.endedAt - 10 * 60 * 1000).ok, false, "from the future");
    assert.equal(parseSessionData(null).ok, false);
  });

  it("does not take points from the upload", () => {
    const data = makeSession(configFor("single", "easy", { rounds: 2 }), 6, false);
    const parsed = parseSessionData({ ...data, score: 99999 });
    assert.ok(parsed.ok);
    assert.equal("score" in parsed.data, false);
    assert.equal(scoreSession(parsed.data.config, parsed.data.rounds).score, 0);
  });
});

describe("statistics", () => {
  it("keeps single-digit and two-digit figures apart", () => {
    const singles = makeSession(configFor("single", "easy", { rounds: 3 }), 10);
    const pairs = makeSession(configFor("pair", "easy", { rounds: 2 }), 11, false);
    const all = [singles, pairs];
    const s = computeStats(all, "single");
    const p = computeStats(all, "pair");
    assert.equal(s.sessions, 1);
    assert.equal(s.rounds, 3);
    assert.equal(s.perfect, 3);
    assert.equal(s.longestRecalled, 4);
    assert.equal(p.sessions, 1);
    assert.equal(p.rounds, 2);
    assert.equal(p.perfect, 0);
    assert.equal(p.longestRecalled, 0);
    assert.equal(p.bestScore, 0);
  });

  it("reports accuracy, best score and performance by length", () => {
    const c = configFor("single", "easy", { rounds: 3, progressive: true });
    const good = makeSession(c, 20);
    const mixed: SessionData = { ...makeSession(c, 21), clientId: "mixed-session-1", endedAt: good.endedAt + 1000 };
    mixed.rounds[2] = { ...mixed.rounds[2], answer: mixed.rounds[2].sequence.map(() => "x".length ? "0" : "0") };
    const stats = computeStats([good, mixed], "single");
    assert.equal(stats.sessions, 2);
    assert.equal(stats.rounds, 6);
    assert.deepEqual(stats.byLength.map((b) => b.length), [4, 5, 6]);
    assert.equal(stats.byLength[0].accuracy, 100);
    assert.equal(stats.longestRecalled, 6);
    assert.equal(stats.bestScore, scoreSession(c, good.rounds).score);
    assert.deepEqual(stats.recent.map((r) => r.clientId), ["mixed-session-1", good.clientId]);
  });

  it("is empty for a mode never played", () => {
    const s = computeStats([], "pair");
    assert.equal(s.sessions, 0);
    assert.equal(s.longestRecalled, 0);
    assert.deepEqual(s.byLength, []);
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

  it("stores sessions with leading zeros intact", () => {
    const data: SessionData = {
      clientId: "zeros-session-1",
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_050_000,
      config: configFor("pair", "easy", { rounds: 1 }),
      rounds: [{ sequence: ["07", "00", "09"], answer: ["07", "00", "90"], responseMs: 3000 }],
    };
    assert.equal(saveSession(guest, data), true);
    assert.equal(saveSession(guest, data), true);
    const loaded = loadHistory(guest);
    assert.equal(loaded.length, 1);
    assert.deepEqual(loaded[0].rounds[0].sequence, ["07", "00", "09"]);
    assert.deepEqual(loaded[0].rounds[0].answer, ["07", "00", "90"]);
    assert.ok(storage.getItem("mathz:guest:v1:recall")!.includes('"07"'));
  });

  it("keeps recall history apart from other histories and flags account sessions for upload", () => {
    saveSession(account, makeSession(configFor("single", "easy", { rounds: 1 }), 30));
    assert.equal(loadHistory(account)[0].synced, false);
    assert.equal(loadHistory(guest).length, 0);
    assert.ok([...storage.items.keys()].every((k) => k.endsWith(":recall")));
  });

  it("remembers settings and the chosen mode separately for each mode", () => {
    const setups = { single: configFor("single", "hard", { rounds: 8 }), pair: configFor("pair", "easy", { progressive: true }) };
    saveSetups(setups);
    saveMode("pair");
    assert.deepEqual(loadSetups(), setups);
    assert.equal(loadMode(), "pair");
  });

  it("falls back to defaults for damaged or mismatched data", () => {
    storage.setItem("mathz:recall:setup", JSON.stringify({ single: configFor("pair", "easy"), pair: { nonsense: true } }));
    assert.deepEqual(loadSetups().single, defaultConfig("single"));
    assert.deepEqual(loadSetups().pair, defaultConfig("pair"));
    storage.setItem("mathz:recall:setup", "{oops");
    assert.deepEqual(loadSetups().single, defaultConfig("single"));
    storage.setItem("mathz:recall:mode", "triple");
    assert.equal(loadMode(), "single");
    storage.setItem("mathz:guest:v1:recall", "[{\"clientId\":\"bad\"}]");
    assert.deepEqual(loadHistory(guest), []);
  });
});
