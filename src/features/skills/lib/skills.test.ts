import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { questionFromId } from "./build";
import { checkAnswer, inputProblem } from "./answers";
import { idOfSpec, parseQuestionId } from "./ids";
import { DEFAULT_BASE_RANGE, buildPool, parseConfig, poolSizeByType } from "./pools";
import { add, decimalPlaces, eq, mul, parseDecimal, rat, toDecimalString, toFractionString, toPercentNumber } from "@/lib/rational";
import { DIFFICULTIES, EXERCISE_TYPES, type PracticeConfig, type Question } from "./types";

function q(id: string): Question {
  const question = questionFromId(id);
  assert.ok(question, `${id} should parse`);
  return question;
}
const answerOf = (id: string) => q(id).answerText;
const correct = (id: string, answer: string) => checkAnswer(q(id), answer).status === "correct";
const status = (id: string, answer: string) => checkAnswer(q(id), answer).status;

describe("rational arithmetic", () => {
  it("is exact where floats are not", () => {
    assert.ok(eq(add(parseDecimal("0.1")!, parseDecimal("0.2")!), parseDecimal("0.3")!));
    assert.equal(toDecimalString(mul(rat(1, 8), rat(100))), "12.5");
    assert.equal(toPercentNumber(rat(1, 8)), "12.5");
    assert.equal(toDecimalString(rat(1, 3)), null);
    assert.equal(decimalPlaces(rat(7, 16)), 4);
    assert.equal(toFractionString(rat(6, 8)), "3/4");
  });

  it("parses plain decimals only", () => {
    assert.ok(eq(parseDecimal(".5")!, rat(1, 2)));
    assert.ok(eq(parseDecimal("0.50")!, rat(1, 2)));
    for (const bad of ["", ".", "5.", "-1", "1e3", "1,5", "abc", "1.2.3", "0.1234567891"]) {
      assert.equal(parseDecimal(bad), null, bad);
    }
  });

  it("refuses a zero denominator", () => {
    assert.throws(() => rat(1, 0));
  });
});

describe("spec examples", () => {
  it("percentages", () => {
    assert.equal(answerOf("percentage:of:10:240"), "24");
    assert.equal(answerOf("percentage:of:25:80"), "20");
    assert.equal(answerOf("percentage:of:15:200"), "30");
    assert.equal(answerOf("percentage:of:12.5:160"), "20");
    assert.equal(answerOf("percentage:what:15:60"), "25%");
    assert.equal(answerOf("percentage:what:30:120"), "25%");
    assert.equal(answerOf("percentage:what:45:90"), "50%");
    assert.equal(answerOf("percentage:change:increase:200:15"), "230");
    assert.equal(answerOf("percentage:change:decrease:400:25"), "300");
    assert.equal(answerOf("percentage:change:find:80:100"), "25%");
    assert.equal(answerOf("percentage:convert:d2p:0.75"), "75%");
    assert.equal(answerOf("percentage:convert:p2d:35"), "0.35");
    assert.equal(answerOf("percentage:convert:p2f:25"), "1/4");
  });

  it("fractions", () => {
    assert.equal(answerOf("fraction:simplify:12:16"), "3/4");
    assert.equal(answerOf("fraction:simplify:18:24"), "3/4");
    assert.equal(answerOf("fraction:simplify:45:60"), "3/4");
    assert.equal(answerOf("fraction:of:3/4:80"), "60");
    assert.equal(answerOf("fraction:of:2/5:100"), "40");
    assert.equal(answerOf("fraction:of:7/8:64"), "56");
    assert.equal(answerOf("fraction:compare:larger:3/4:2/3"), "3/4");
    assert.equal(answerOf("fraction:compare:relation:5/8:1/2"), "Greater than");
    assert.equal(answerOf("fraction:convert:f2d:1/4"), "0.25");
    assert.equal(answerOf("fraction:convert:f2p:3/5"), "60%");
    assert.equal(answerOf("fraction:convert:d2f:0.125"), "1/8");
  });

  it("squares", () => {
    assert.equal(answerOf("square:value:12"), "144");
    assert.equal(answerOf("square:value:17"), "289");
    assert.equal(answerOf("square:value:25"), "625");
    assert.equal(answerOf("square:value:48"), "2304");
    assert.equal(answerOf("square:value:75"), "5625");
    assert.equal(answerOf("square:root:144"), "12");
    assert.equal(answerOf("square:root:289"), "17");
    assert.equal(answerOf("square:root:625"), "25");
    assert.equal(answerOf("square:root:441"), "21");
    assert.equal(answerOf("square:missing:product:14"), "196");
    assert.equal(answerOf("square:missing:base:441"), "21");
  });

  it("multiplication keeps its existing semantics", () => {
    assert.equal(answerOf("multiplication:12:8"), "96");
    assert.equal(answerOf("multiplication:8:12"), "96");
    assert.notEqual(q("multiplication:12:8").id, q("multiplication:8:12").id);
    assert.equal(q("multiplication:7:6").explanation, undefined);
  });

  it("explains in the documented style", () => {
    assert.equal(q("percentage:of:25:80").explanation, "25% is one-quarter, and 80 ÷ 4 = 20.");
    assert.match(q("square:value:17").explanation!, /289/);
    assert.match(q("square:value:75").explanation!, /7 × 8 = 56/);
  });
});

describe("stable question ids", () => {
  const samples = [
    "multiplication:12:8",
    "percentage:of:25:80",
    "percentage:of:12.5:160",
    "percentage:what:15:60",
    "percentage:change:increase:200:15",
    "percentage:change:decrease:400:25",
    "percentage:change:find:80:100",
    "percentage:change:multi:200:10:-10",
    "percentage:convert:d2p:0.75",
    "percentage:convert:p2d:35",
    "percentage:convert:p2f:25",
    "percentage:convert:f2p:3/4",
    "fraction:simplify:12:16",
    "fraction:of:3/4:80",
    "fraction:compare:larger:3/4:2/3",
    "fraction:compare:relation:5/8:1/2",
    "fraction:convert:f2d:1/4",
    "fraction:convert:d2f:0.125",
    "square:value:17",
    "square:root:289",
    "square:missing:product:14",
    "square:missing:base:441",
  ];

  it("round-trips every example id", () => {
    for (const id of samples) {
      const spec = parseQuestionId(id);
      assert.ok(spec, id);
      assert.equal(idOfSpec(spec), id);
      assert.equal(q(id).id, id);
    }
  });

  it("rejects malformed, non-canonical and nonsensical ids", () => {
    const bad = [
      "",
      "unknown:1:2",
      "multiplication:0:5",
      "multiplication:21:5",
      "multiplication:05:5",
      "multiplication:5:5:5",
      "percentage:of:25.0:80",
      "percentage:of:0:80",
      "percentage:of:25:0",
      "percentage:what:5:0",
      "percentage:what:1:3", // 33.333...% never ends
      "percentage:change:decrease:100:100",
      "percentage:change:find:0:10",
      "percentage:change:find:10:10",
      "percentage:convert:p2f:100",
      "percentage:convert:f2p:1/3",
      "percentage:convert:f2p:2/4", // not in lowest terms
      "fraction:simplify:3:4", // already simplified
      "fraction:simplify:4:2", // reduces to a whole number
      "fraction:simplify:5:0",
      "fraction:of:6/8:80",
      "fraction:of:1/3:10", // 3.333...
      "fraction:of:1/0:10",
      "fraction:compare:larger:1/2:2/4", // equal values
      "fraction:compare:larger:3/4:3/4",
      "fraction:convert:f2d:1/3",
      "fraction:convert:d2f:2",
      "square:value:0",
      "square:value:101",
      "square:root:290",
      "square:missing:base:442",
      "square:missing:sideways:3",
    ];
    for (const id of bad) assert.equal(parseQuestionId(id), null, id);
    assert.equal(parseQuestionId(undefined), null);
    assert.equal(parseQuestionId(12), null);
    assert.equal(parseQuestionId("x".repeat(200)), null);
  });

  it("gives related questions a shared concept", () => {
    assert.equal(q("square:value:17").concept, q("square:root:289").concept);
    assert.equal(q("fraction:compare:larger:3/4:2/3").concept, q("fraction:compare:relation:2/3:3/4").concept);
    assert.equal(q("fraction:simplify:12:16").concept, q("fraction:of:3/4:80").concept);
    assert.notEqual(q("multiplication:12:8").concept, q("multiplication:8:12").concept);
  });
});

describe("answer validation", () => {
  it("numeric answers are exact and tolerate harmless formatting", () => {
    assert.ok(correct("percentage:convert:p2d:50", "0.5"));
    assert.ok(correct("percentage:convert:p2d:50", "0.50"));
    assert.ok(correct("percentage:convert:p2d:50", ".5"));
    assert.ok(correct("percentage:convert:p2d:50", "  0.5  "));
    assert.equal(status("percentage:convert:p2d:50", "0.49"), "incorrect");
    assert.equal(status("percentage:convert:p2d:50", "0.5000001"), "incorrect");
    assert.ok(correct("percentage:of:10:240", "24.0"));
    assert.equal(status("percentage:of:10:240", "240"), "incorrect");
    assert.equal(status("percentage:of:12.5:160", "20.5"), "incorrect");
  });

  it("percent signs are accepted only on percent answers", () => {
    assert.ok(correct("percentage:what:15:60", "25%"));
    assert.ok(correct("percentage:what:15:60", "25"));
    assert.ok(correct("percentage:what:15:60", "25 %"));
    assert.ok(correct("percentage:what:15:60", "25.0%"));
    assert.equal(status("percentage:what:15:60", "26%"), "incorrect");
    assert.equal(status("percentage:of:10:240", "24%"), "invalid");
    assert.equal(status("percentage:convert:p2d:35", "35%"), "invalid");
  });

  it("decimal percentages are exact", () => {
    assert.ok(correct("percentage:convert:d2p:0.125", "12.5%"));
    assert.ok(correct("percentage:convert:d2p:0.125", "12.50"));
    assert.equal(status("percentage:convert:d2p:0.125", "12%"), "incorrect");
    assert.equal(status("percentage:convert:d2p:0.125", "13"), "incorrect");
  });

  it("fractions: spacing is normalised, lookalikes are not accepted", () => {
    assert.ok(correct("fraction:simplify:12:16", "3/4"));
    assert.ok(correct("fraction:simplify:12:16", " 3 / 4 "));
    assert.ok(correct("fraction:simplify:12:16", "03/04"));
    assert.equal(status("fraction:simplify:12:16", "3/40"), "incorrect");
    assert.equal(status("fraction:simplify:12:16", "13/4"), "incorrect");
    assert.equal(status("fraction:simplify:12:16", "3/5"), "incorrect");
    assert.equal(status("fraction:simplify:12:16", "0.75"), "invalid");
    assert.equal(status("fraction:simplify:12:16", "3/0"), "invalid");
    assert.equal(status("fraction:simplify:12:16", "3//4"), "invalid");
    assert.equal(status("fraction:simplify:12:16", "three quarters"), "invalid");
  });

  it("simplify demands lowest terms, other fraction answers accept equivalents only when allowed", () => {
    assert.equal(status("fraction:simplify:12:16", "6/8"), "incorrect");
    assert.equal(status("fraction:simplify:12:16", "12/16"), "incorrect");
    assert.equal(status("fraction:convert:d2f:0.125", "2/16"), "incorrect");
    assert.ok(correct("fraction:convert:d2f:0.125", "1/8"));
    assert.equal(status("percentage:convert:p2f:25", "25/100"), "incorrect");
    assert.ok(correct("percentage:convert:p2f:25", "1/4"));
  });

  it("choices must be one of the offered options", () => {
    assert.ok(correct("fraction:compare:larger:3/4:2/3", "3/4"));
    assert.equal(status("fraction:compare:larger:3/4:2/3", "2/3"), "incorrect");
    assert.equal(status("fraction:compare:larger:3/4:2/3", "6/8"), "invalid");
    assert.ok(correct("fraction:compare:relation:5/8:1/2", "gt"));
    assert.equal(status("fraction:compare:relation:5/8:1/2", "lt"), "incorrect");
    assert.equal(status("fraction:compare:relation:5/8:1/2", "greater"), "invalid");
    assert.ok(correct("fraction:compare:relation:2/4:1/2", "eq"));
    assert.ok(correct("fraction:compare:relation:1/3:1/2", "lt"));
  });

  it("rejects empty, oversized and non-string input", () => {
    for (const bad of ["", "   ", "1".repeat(30), "-5", "1e3", "12,5", null, undefined, 42, {}]) {
      assert.equal(status("square:value:12", bad as string), "invalid", String(bad));
    }
    assert.equal(inputProblem({ kind: "integer" }, "12"), null);
    assert.notEqual(inputProblem({ kind: "integer" }, "x"), null);
  });

  it("squares validate integers and roots", () => {
    assert.ok(correct("square:value:17", "289"));
    assert.equal(status("square:value:17", "288"), "incorrect");
    assert.equal(status("square:value:17", "289.5"), "incorrect");
    assert.ok(correct("square:root:441", "21"));
    assert.equal(status("square:root:441", "441"), "incorrect");
    assert.ok(correct("square:missing:base:441", "21"));
  });

  it("every question accepts its own canonical answer", () => {
    for (const config of sampleConfigs()) {
      for (const item of buildPool(config)) {
        const question = q(item.id);
        const check = checkAnswer(question, question.expected === question.answerText ? question.answerText : question.answerText);
        // Choice questions are answered by value, not label.
        if (question.answerFormat.kind === "choice") {
          assert.equal(checkAnswer(question, question.expected as string).status, "correct", item.id);
        } else {
          assert.equal(check.status, "correct", `${item.id} -> ${question.answerText}`);
        }
      }
    }
  });
});

function sampleConfigs(): PracticeConfig[] {
  const configs: PracticeConfig[] = [
    { skill: "multiplication", exerciseTypes: ["multiply"], left: [2, 3, 12, 20], right: [1, 7, 20] },
    { skill: "square", exerciseTypes: ["value", "root", "missing"], rangeMin: 1, rangeMax: 100 },
  ];
  for (const difficulty of DIFFICULTIES) {
    configs.push({
      skill: "percentage",
      exerciseTypes: [...EXERCISE_TYPES.percentage],
      difficulty,
      ...DEFAULT_BASE_RANGE[difficulty],
    });
    configs.push({ skill: "fraction", exerciseTypes: [...EXERCISE_TYPES.fraction], difficulty });
  }
  return configs;
}

describe("practice pools", () => {
  it("every pool question is valid, unique, in tier and has a clean exact answer", () => {
    for (const config of sampleConfigs()) {
      const pool = buildPool(config);
      assert.ok(pool.length > 0, JSON.stringify(config));
      const ids = new Set<string>();
      for (const item of pool) {
        assert.ok(!ids.has(item.id), `duplicate ${item.id}`);
        ids.add(item.id);
        const question = q(item.id);
        assert.equal(question.skill, config.skill);
        assert.ok(config.exerciseTypes.includes(question.exerciseType as never), item.id);
        assert.equal(question.exerciseType, item.exerciseType);
        assert.equal(question.concept, item.concept);
        if ("difficulty" in config) assert.equal(question.difficulty, config.difficulty, item.id);
        if (typeof question.expected !== "string" && question.answerFormat.kind !== "fraction") {
          const places = decimalPlaces(question.expected);
          assert.ok(places !== null && places <= 4, `${item.id} has no clean answer`);
          assert.ok(question.expected.n >= 0, `${item.id} negative`);
        }
        assert.ok(question.prompt.length > 0);
        assert.doesNotMatch(question.prompt, /NaN|undefined|Infinity/);
        assert.doesNotMatch(question.answerText, /NaN|undefined|Infinity|null/);
      }
    }
  });

  it("every enabled exercise type is represented at every difficulty", () => {
    for (const config of sampleConfigs()) {
      if (config.skill === "multiplication") continue;
      const counts = poolSizeByType(config);
      for (const type of config.exerciseTypes) {
        assert.ok((counts[type as never] ?? 0) > 0, `${config.skill}/${type} empty for ${JSON.stringify(config)}`);
      }
    }
  });

  it("stays a manageable size", () => {
    for (const config of sampleConfigs()) assert.ok(buildPool(config).length <= 5000);
  });

  it("only mixes exercise types that are enabled", () => {
    const only = buildPool({ skill: "square", exerciseTypes: ["value"], rangeMin: 1, rangeMax: 20 });
    assert.equal(only.length, 20);
    assert.ok(only.every((i) => i.exerciseType === "value"));
    const both = buildPool({ skill: "square", exerciseTypes: ["value", "root"], rangeMin: 1, rangeMax: 20 });
    assert.equal(both.length, 40);
    const missing = buildPool({ skill: "square", exerciseTypes: ["missing"], rangeMin: 1, rangeMax: 10 });
    assert.equal(missing.length, 20);
  });

  it("respects square and percentage ranges", () => {
    const squares = buildPool({ skill: "square", exerciseTypes: ["value"], rangeMin: 30, rangeMax: 32 });
    assert.deepEqual(squares.map((i) => i.id), ["square:value:30", "square:value:31", "square:value:32"]);
    const pct = buildPool({ skill: "percentage", exerciseTypes: ["of"], difficulty: "beginner", baseMin: 100, baseMax: 120 });
    for (const item of pct) {
      const base = Number(item.id.split(":")[3]);
      assert.ok(base >= 100 && base <= 120, item.id);
    }
  });

  it("beginner percentages use only the common percentages", () => {
    const pool = buildPool({ skill: "percentage", exerciseTypes: ["of"], difficulty: "beginner", ...DEFAULT_BASE_RANGE.beginner });
    const seen = new Set(pool.map((i) => Number(i.id.split(":")[2])));
    assert.deepEqual([...seen].sort((a, b) => a - b), [1, 5, 10, 20, 25, 50, 75]);
  });

  it("advanced percentages include decimal percentages and multi-step changes", () => {
    const of = buildPool({ skill: "percentage", exerciseTypes: ["of"], difficulty: "advanced", ...DEFAULT_BASE_RANGE.advanced });
    assert.ok(of.some((i) => i.id.includes("12.5")));
    const change = buildPool({ skill: "percentage", exerciseTypes: ["change"], difficulty: "advanced", ...DEFAULT_BASE_RANGE.advanced });
    assert.ok(change.some((i) => i.id.includes(":multi:")));
    const beginnerChange = buildPool({ skill: "percentage", exerciseTypes: ["change"], difficulty: "beginner", ...DEFAULT_BASE_RANGE.beginner });
    assert.ok(!beginnerChange.some((i) => i.id.includes(":multi:")));
  });

  it("returns an empty pool when the range cannot satisfy the rules", () => {
    // No multiple of 20 fits between 21 and 39, so 5% questions cannot exist; other percents still can.
    const pool = buildPool({ skill: "percentage", exerciseTypes: ["of"], difficulty: "beginner", baseMin: 21, baseMax: 21 });
    assert.ok(pool.every((i) => Number(i.id.split(":")[3]) === 21));
    const none = buildPool({ skill: "percentage", exerciseTypes: ["of"], difficulty: "beginner", baseMin: 1, baseMax: 1 });
    assert.equal(none.length, 0);
  });

  it("easier fraction levels start with clean results", () => {
    const beginner = buildPool({ skill: "fraction", exerciseTypes: ["of"], difficulty: "beginner" });
    for (const item of beginner) {
      const question = q(item.id);
      assert.ok(typeof question.expected !== "string" && question.expected.d === BigInt(1), item.id);
    }
    const simplify = buildPool({ skill: "fraction", exerciseTypes: ["simplify"], difficulty: "beginner" });
    for (const item of simplify) {
      const [, , num, den] = item.id.split(":").map(Number);
      assert.ok(den <= 20 && num < den, item.id);
    }
  });

  it("fraction conversions only ever use terminating decimals", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const item of buildPool({ skill: "fraction", exerciseTypes: ["convert"], difficulty })) {
        const question = q(item.id);
        assert.ok(typeof question.expected !== "string" && decimalPlaces(question.expected) !== null, item.id);
      }
    }
  });
});

describe("config validation", () => {
  it("accepts and canonicalises valid configs", () => {
    const r = parseConfig({ skill: "multiplication", left: [3, 1, 3], right: [2] });
    assert.deepEqual(r.ok && r.config, { skill: "multiplication", exerciseTypes: ["multiply"], left: [1, 3], right: [2] });
    const sq = parseConfig({ skill: "square", exerciseTypes: ["root", "value"], rangeMin: 5, rangeMax: 60 });
    assert.deepEqual(sq.ok && sq.config, { skill: "square", exerciseTypes: ["value", "root"], rangeMin: 5, rangeMax: 60 });
  });

  it("rejects bad input", () => {
    const bad: unknown[] = [
      null,
      [],
      {},
      { skill: "division" },
      { skill: "multiplication", left: [0], right: [1] },
      { skill: "multiplication", left: [1], right: [21] },
      { skill: "multiplication", left: [], right: [1] },
      { skill: "square", exerciseTypes: [], rangeMin: 1, rangeMax: 20 },
      { skill: "square", exerciseTypes: ["value"], rangeMin: 0, rangeMax: 20 },
      { skill: "square", exerciseTypes: ["value"], rangeMin: 10, rangeMax: 101 },
      { skill: "square", exerciseTypes: ["value"], rangeMin: 20, rangeMax: 10 },
      { skill: "square", exerciseTypes: ["value", "cube"], rangeMin: 1, rangeMax: 10 },
      { skill: "percentage", exerciseTypes: ["of"], difficulty: "expert", baseMin: 1, baseMax: 10 },
      { skill: "percentage", exerciseTypes: ["of"], difficulty: "beginner", baseMin: 0, baseMax: 10 },
      { skill: "percentage", exerciseTypes: ["of"], difficulty: "beginner", baseMin: 5, baseMax: 10001 },
      { skill: "fraction", exerciseTypes: ["of"] },
      { skill: "fraction", exerciseTypes: ["simplify", "bogus"], difficulty: "beginner" },
    ];
    for (const raw of bad) assert.equal(parseConfig(raw).ok, false, JSON.stringify(raw));
  });
});
