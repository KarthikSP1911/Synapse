import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { guestFetch } from "@/features/offline/lib/guest/api";
import { guestSkillSummaries } from "@/features/offline/lib/guest/progress";
import { loadGuestData } from "@/features/offline/lib/guest/storage";
import {
  chooseExponentsLevel,
  chooseExponentsMode,
  configFromState,
  editExponents,
  exponentsForLevel,
  initialSetupState,
  loadExponentsSetup,
  saveExponentsSetup,
} from "./practice/setup-state";
import { DEFAULT_SETTINGS } from "@/features/settings/lib/settings";
import { applyAttempt } from "./practice/item-stats";
import { checkAnswer, inputProblem } from "./answers";
import { questionFromId, toPublicQuestion } from "./build";
import { EXPONENT_RESULT_MAX, exponentCore, fitsResult } from "./exponents";
import { availableTypes, exponentBases, typeBlockReason } from "./exponents-pool";
import { idOfSpec, parseQuestionId } from "./ids";
import { exponentConceptLabel, EXPONENT_EXAMPLES } from "./meta";
import { buildPool, parseConfig, poolHas } from "./pools";
import { isInteger, rat, toFractionString } from "@/lib/rational";
import { EXERCISE_TYPES, SKILLS, type PracticeConfig, type Question } from "./types";

type ExponentsConfig = Extract<PracticeConfig, { skill: "exponents" }>;

function q(id: string): Question {
  const question = questionFromId(id);
  assert.ok(question, `${id} should parse`);
  return question;
}
const verdict = (id: string, answer: string) => checkAnswer(q(id), answer).status;
const accepts = (id: string, answer: string) => verdict(id, answer) === "correct";

/** A string the answer box accepts for the question's exact answer. */
function typedAnswer(question: Question): string {
  const expected = question.expected;
  assert.equal(typeof expected === "string", false);
  const r = expected as ReturnType<typeof rat>;
  return isInteger(r) ? r.n.toString() : toFractionString(r);
}

function config(patch: Partial<ExponentsConfig> = {}): ExponentsConfig {
  return {
    skill: "exponents",
    exerciseTypes: [...EXERCISE_TYPES.exponents],
    level: "custom",
    answerMode: "value",
    baseMin: 2,
    baseMax: 6,
    expMin: -4,
    expMax: 6,
    allowPositive: true,
    allowZero: true,
    allowNegative: true,
    negativeBases: true,
    maxResult: 100_000,
    ...patch,
  };
}

/** Builds the config the setup screen would for a level and mode, through the real validation. */
function levelConfig(level: "easy" | "medium" | "hard", answerMode: "power" | "value"): ExponentsConfig {
  const setup = exponentsForLevel(level, answerMode);
  const state = { ...initialSetupState(DEFAULT_SETTINGS), exponents: setup };
  const built = configFromState("exponents", state);
  assert.ok(built.ok, built.ok ? "" : built.error);
  assert.equal(built.config.skill, "exponents");
  return built.config as ExponentsConfig;
}

function specsOf(c: ExponentsConfig) {
  return buildPool(c).map((item) => {
    const spec = parseQuestionId(item.id);
    assert.ok(spec && spec.skill === "exponents", item.id);
    return { item, spec };
  });
}

describe("exponents: every exercise type", () => {
  it("evaluates powers", () => {
    assert.equal(q("exponents:v:evaluate:std:2:5").prompt, "2^5 = ?");
    assert.equal(q("exponents:v:evaluate:std:2:5").answerText, "32");
    assert.equal(q("exponents:v:evaluate:std:3:4").answerText, "81");
    assert.ok(accepts("exponents:v:evaluate:std:3:4", "81"));
  });

  it("finds the base", () => {
    assert.equal(q("exponents:v:base:direct:5:3").prompt, "?^3 = 125");
    assert.ok(accepts("exponents:v:base:direct:5:3", "5"));
    assert.equal(q("exponents:v:base:direct:3:4").prompt, "?^4 = 81 (? > 0)");
    assert.ok(accepts("exponents:v:base:direct:3:4", "3"));
    assert.equal(verdict("exponents:v:base:direct:5:3", "125"), "incorrect");
  });

  it("finds the exponent", () => {
    assert.equal(q("exponents:v:exponent:direct:2:5").prompt, "2^? = 32");
    assert.ok(accepts("exponents:v:exponent:direct:2:5", "5"));
    assert.equal(q("exponents:v:exponent:direct:3:4").prompt, "3^? = 81");
    assert.ok(accepts("exponents:v:exponent:direct:3:4", "4"));
    assert.equal(verdict("exponents:v:exponent:direct:3:4", "81"), "incorrect");
  });

  it("applies the multiplication law in both modes", () => {
    assert.equal(q("exponents:v:mul-law:std:2:3:4").prompt, "2^3 × 2^4 = ?");
    assert.ok(accepts("exponents:v:mul-law:std:2:3:4", "128"));
    assert.equal(q("exponents:p:mul-law:std:2:3:4").prompt, "2^3 × 2^4 = 2^?");
    assert.ok(accepts("exponents:p:mul-law:std:2:3:4", "7"));
    assert.ok(accepts("exponents:p:mul-law:std:2:5:7", "12"));
    assert.ok(accepts("exponents:v:mul-law:std:2:5:7", "4096"));
    assert.equal(verdict("exponents:p:mul-law:std:2:5:7", "4096"), "incorrect");
  });

  it("applies the division law in both modes", () => {
    assert.equal(q("exponents:v:div-law:std:3:5:2").prompt, "3^5 ÷ 3^2 = ?");
    assert.ok(accepts("exponents:v:div-law:std:3:5:2", "27"));
    assert.equal(q("exponents:p:div-law:std:3:5:2").prompt, "3^5 ÷ 3^2 = 3^?");
    assert.ok(accepts("exponents:p:div-law:std:3:5:2", "3"));
  });

  it("applies the power-of-a-power law in both modes", () => {
    assert.equal(q("exponents:v:power-law:std:2:3:2").prompt, "(2^3)^2 = ?");
    assert.ok(accepts("exponents:v:power-law:std:2:3:2", "64"));
    assert.equal(q("exponents:p:power-law:std:2:3:2").prompt, "(2^3)^2 = 2^?");
    assert.ok(accepts("exponents:p:power-law:std:2:3:2", "6"));
  });

  it("handles zero and negative exponents", () => {
    assert.equal(q("exponents:v:zero-negative:direct:5:0").prompt, "5^0 = ?");
    assert.ok(accepts("exponents:v:zero-negative:direct:5:0", "1"));
    assert.equal(q("exponents:v:zero-negative:direct:2:-3").prompt, "2^-3 = ?");
    assert.equal(q("exponents:v:zero-negative:direct:2:-3").answerText, "0.125");
    assert.equal(q("exponents:p:zero-negative:mul:10:-2:5").prompt, "10^-2 × 10^5 = 10^?");
    assert.ok(accepts("exponents:p:zero-negative:mul:10:-2:5", "3"));
    assert.equal(q("exponents:p:zero-negative:recip:2:3").prompt, "1 ÷ 2^3 = 2^?");
    assert.ok(accepts("exponents:p:zero-negative:recip:2:3", "-3"));
    assert.ok(accepts("exponents:v:zero-negative:recip:2:3", "0.125"));
  });

  it("simplifies multi-step expressions", () => {
    assert.equal(q("exponents:p:simplify:a:2:3:4:2").prompt, "2^3 × 2^4 ÷ 2^2 = 2^?");
    assert.ok(accepts("exponents:p:simplify:a:2:3:4:2", "5"));
    assert.ok(accepts("exponents:v:simplify:a:2:3:4:2", "32"));
    // (2^3)^2 ÷ 2^4 = 2^2; (2^3 × 2^4)^2 = 2^14; (2^5 ÷ 2^2)^3 = 2^9; 2^1 × 2^2 × 2^3 = 2^6
    assert.equal(q("exponents:p:simplify:c:2:3:2:4").prompt, "(2^3)^2 ÷ 2^4 = 2^?");
    assert.ok(accepts("exponents:p:simplify:c:2:3:2:4", "2"));
    assert.equal(q("exponents:p:simplify:d:2:3:4:2").prompt, "(2^3 × 2^4)^2 = 2^?");
    assert.ok(accepts("exponents:p:simplify:d:2:3:4:2", "14"));
    assert.equal(q("exponents:p:simplify:e:2:5:2:3").prompt, "(2^5 ÷ 2^2)^3 = 2^?");
    assert.ok(accepts("exponents:p:simplify:e:2:5:2:3", "9"));
    assert.ok(accepts("exponents:p:simplify:f:2:1:2:3", "6"));
    assert.equal(q("exponents:p:simplify:g:2:3:2:2:1").prompt, "(2^3)^2 ÷ (2^2)^1 = 2^?");
    assert.ok(accepts("exponents:p:simplify:g:2:3:2:2:1", "4"));
    assert.ok(accepts("exponents:p:simplify:i:2:3:2:2:3", "12"));
    assert.ok(accepts("exponents:p:simplify:b:3:2:2:1", "5"));
  });
});

describe("exponents: asking for the right thing", () => {
  it("power form asks for an exponent, or the base when that is what is missing", () => {
    const base = q("exponents:p:base:mul:5:3:4");
    assert.equal(base.prompt, "?^3 × ?^4 = 5^7");
    assert.ok(accepts(base.id, "5"));
    assert.equal(verdict(base.id, "7"), "incorrect");
    assert.equal(q("exponents:p:base:div:3:6:2").prompt, "?^6 ÷ ?^2 = 3^4 (? > 0)");
    assert.equal(q("exponents:p:base:pow:2:3:2").prompt, "(?^3)^2 = 2^6 (? > 0)");

    const exponent = q("exponents:p:exponent:mul2:2:3:4");
    assert.equal(exponent.prompt, "2^3 × 2^? = 2^7");
    assert.ok(accepts(exponent.id, "4"));
    assert.equal(q("exponents:p:exponent:mul1:2:3:4").prompt, "2^? × 2^4 = 2^7");
    assert.ok(accepts("exponents:p:exponent:mul1:2:3:4", "3"));
    assert.equal(q("exponents:p:exponent:div1:3:5:2").prompt, "3^? ÷ 3^2 = 3^3");
    assert.ok(accepts("exponents:p:exponent:div1:3:5:2", "5"));
    assert.equal(q("exponents:p:exponent:div2:3:5:2").prompt, "3^5 ÷ 3^? = 3^3");
    assert.ok(accepts("exponents:p:exponent:div2:3:5:2", "2"));
    assert.equal(q("exponents:p:exponent:pow1:2:3:4").prompt, "(2^?)^4 = 2^12");
    assert.ok(accepts("exponents:p:exponent:pow1:2:3:4", "3"));
    assert.equal(q("exponents:p:exponent:pow2:2:3:4").prompt, "(2^3)^? = 2^12");
    assert.ok(accepts("exponents:p:exponent:pow2:2:3:4", "4"));
  });

  it("final value asks for the number", () => {
    for (const id of ["exponents:v:mul-law:std:2:5:7", "exponents:v:power-law:std:2:3:2", "exponents:v:simplify:a:2:3:4:2"]) {
      assert.match(q(id).prompt, /= \?$/);
    }
    for (const id of ["exponents:p:mul-law:std:2:5:7", "exponents:p:power-law:std:2:3:2", "exponents:p:simplify:a:2:3:4:2"]) {
      assert.match(q(id).prompt, /= 2\^\?$/);
    }
  });

  it("marks the unknown base in the prompt and keeps negative answers in the signed format", () => {
    assert.equal(q("exponents:p:base:mul:-2:2:3").prompt, "?^2 × ?^3 = (-2)^5");
    assert.deepEqual(q("exponents:p:base:mul:-2:2:3").answerFormat, { kind: "integer", signed: true });
    assert.ok(accepts("exponents:p:base:mul:-2:2:3", "-2"));
    assert.equal(verdict("exponents:p:base:mul:-2:2:3", "2"), "incorrect");
  });
});

describe("exponents: negative bases, brackets and precedence", () => {
  it("brackets a negative base and gets the sign right", () => {
    assert.equal(q("exponents:v:evaluate:std:-2:3").prompt, "(-2)^3 = ?");
    assert.ok(accepts("exponents:v:evaluate:std:-2:3", "-8"));
    assert.equal(verdict("exponents:v:evaluate:std:-2:3", "8"), "incorrect");
    assert.equal(q("exponents:v:evaluate:std:-2:4").answerText, "16");
    assert.equal(q("exponents:v:evaluate:std:-3:3").answerText, "-27");
    assert.ok(accepts("exponents:v:evaluate:std:-2:3", "−8"), "the typographic minus is accepted too");
  });

  it("keeps the brackets in a power of a power", () => {
    assert.equal(q("exponents:v:power-law:std:-2:3:2").prompt, "((-2)^3)^2 = ?");
    assert.ok(accepts("exponents:v:power-law:std:-2:3:2", "64"));
    assert.equal(q("exponents:v:power-law:std:-2:2:3").answerText, "64");
    assert.equal(q("exponents:v:power-law:std:-2:3:3").answerText, "-512");
    assert.equal(q("exponents:p:simplify:d:-3:1:2:2").prompt, "((-3)^1 × (-3)^2)^2 = (-3)^?");
  });

  it("applies the laws left to right with brackets first", () => {
    // 2^3 × 2^4 ÷ 2^2 reads (2^3 × 2^4) ÷ 2^2 = 2^5, and (2^3)^2 × 2^4 is 2^10, never 2^(3 × 2 × 4).
    assert.ok(accepts("exponents:v:simplify:a:2:3:4:2", "32"));
    assert.ok(accepts("exponents:p:simplify:b:2:3:2:4", "10"));
    assert.ok(accepts("exponents:v:simplify:b:2:3:2:4", "1024"));
    assert.equal(verdict("exponents:p:simplify:b:2:3:2:4", "24"), "incorrect");
    assert.ok(accepts("exponents:p:simplify:c:2:3:2:4", "2"));
  });

  it("only asks for a base when the sign can be recovered", () => {
    // An even power hides the sign of the base (both 3 and -3 give 81), so a negative base is never the answer there.
    assert.equal(parseQuestionId("exponents:v:base:direct:-3:4"), null);
    assert.equal(parseQuestionId("exponents:p:base:mul:-2:2:2"), null);
    assert.ok(parseQuestionId("exponents:v:base:direct:-3:3"));
    assert.equal(q("exponents:v:base:direct:-3:3").prompt, "?^3 = -27");
    assert.ok(accepts("exponents:v:base:direct:-3:3", "-3"));
  });
});

describe("exponents: fractional answers", () => {
  it("accepts a decimal, a fraction or any equivalent of an exact power", () => {
    const id = "exponents:v:zero-negative:direct:2:-3";
    for (const answer of ["0.125", ".125", "0.1250", "1/8", "2/16", " 1 / 8 "]) assert.ok(accepts(id, answer), answer);
    for (const answer of ["0.12", "0.13", "1/9", "8", "1/80"]) assert.equal(verdict(id, answer), "incorrect", answer);
    assert.equal(verdict(id, "-0.125"), "invalid", "an unsigned answer has no minus");
  });

  it("never rounds: a power with no short decimal is asked as a fraction", () => {
    const id = "exponents:v:mul-law:std:3:-5:3";
    assert.equal(q(id).answerText, "1/9");
    assert.ok(accepts(id, "1/9"));
    assert.equal(verdict(id, "0.111"), "incorrect");
    assert.equal(verdict(id, "0.1111111"), "incorrect");
    assert.deepEqual(q(id).answerFormat, { kind: "number", fractions: true });
  });

  it("is exact with long decimals", () => {
    const id = "exponents:v:zero-negative:direct:5:-4";
    assert.equal(q(id).answerText, "0.0016");
    assert.ok(accepts(id, "0.0016"));
    assert.ok(accepts(id, "1/625"));
    assert.equal(verdict(id, "0.0015"), "incorrect");
  });

  it("signs a negative fraction", () => {
    const id = "exponents:v:evaluate:std:-2:3";
    assert.deepEqual(q(id).answerFormat, { kind: "integer", signed: true });
    const fractional = "exponents:v:mul-law:std:-2:-1:-2";
    assert.equal(q(fractional).answerText, "-0.125");
    assert.deepEqual(q(fractional).answerFormat, { kind: "number", signed: true, fractions: true });
    for (const answer of ["-0.125", "-1/8", "−1/8"]) assert.ok(accepts(fractional, answer), answer);
    for (const answer of ["0.125", "1/8"]) assert.equal(verdict(fractional, answer), "incorrect", answer);
  });

  it("explains a negative exponent through the reciprocal", () => {
    assert.match(q("exponents:v:zero-negative:direct:2:-3").explanation ?? "", /2\^-3 = 1\/2\^3 = 1\/8 = 0\.125/);
  });

  it("rejects input the format cannot hold", () => {
    const fraction = q("exponents:v:zero-negative:direct:2:-3");
    assert.equal(inputProblem(fraction.answerFormat, "1/0"), "The denominator cannot be zero.");
    assert.ok(inputProblem(fraction.answerFormat, "1/2/3"));
    assert.ok(inputProblem(fraction.answerFormat, "abc"));
    assert.ok(inputProblem(fraction.answerFormat, "-1/8"), "no minus on an unsigned answer");
    assert.equal(inputProblem({ kind: "integer", signed: true }, "-12"), null);
    assert.ok(inputProblem({ kind: "integer" }, "-12"));
    assert.ok(inputProblem({ kind: "integer" }, "1/2"));
  });
});

describe("exponents: invalid questions and ids", () => {
  const invalid: Array<[string, string]> = [
    ["exponents:v:evaluate:std:1:5", "base 1 makes every power equal"],
    ["exponents:v:evaluate:std:0:5", "base 0"],
    ["exponents:v:evaluate:std:21:2", "base beyond 20"],
    ["exponents:v:evaluate:std:2:13", "exponent beyond 12"],
    ["exponents:v:evaluate:std:2:1", "2^1 is not a calculation"],
    ["exponents:v:evaluate:std:2:-3", "a negative exponent is not an evaluate question"],
    ["exponents:v:evaluate:std:20:12", "result beyond the largest allowed"],
    ["exponents:p:evaluate:std:2:5", "evaluate has no power form"],
    ["exponents:p:zero-negative:direct:5:0", "direct zero/negative is final value only"],
    ["exponents:v:base:mul:2:3:4", "a base law question is power form only"],
    ["exponents:v:mul-law:std:20:12:12", "too large"],
    ["exponents:p:base:mul:2:3:-3", "a zero total exponent fits every base"],
    ["exponents:p:exponent:pow1:2:3:0", "a zero multiplier cannot be solved for"],
    ["exponents:p:exponent:pow2:2:0:3", "a zero multiplier cannot be solved for"],
    ["exponents:p:zero-negative:mul:2:1:2", "no zero or negative exponent in it"],
    ["exponents:v:zero-negative:direct:2:1", "a positive exponent is not a zero/negative question"],
    ["exponents:v:zero-negative:direct:2:-0", "non-canonical zero"],
    ["exponents:v:mul-law:std:2:03:4", "leading zero"],
    ["exponents:v:mul-law:std:2:+3:4", "plus sign"],
    ["exponents:v:mul-law:std:2:3", "too few numbers"],
    ["exponents:v:mul-law:std:2:3:4:5", "too many numbers"],
    ["exponents:v:mul-law:std:2:3.5:4", "not an integer"],
    ["exponents:v:mul-law:std:2:3:", "empty number"],
    ["exponents:v:mul-law:fast:2:3:4", "unknown variant"],
    ["exponents:v:constructor:std:2:3:4", "unknown exercise type"],
    ["exponents:v:mul-law:constructor:2:3:4", "prototype key as a variant"],
    ["exponents:x:mul-law:std:2:3:4", "unknown answer mode"],
    ["exponents:v:power-law:std:2:1:5", "raising to the power 1 changes nothing"],
    ["exponents:p:simplify:z:2:1:2:3", "unknown simplify shape"],
    ["exponents:v:evaluate", "nothing after the type"],
  ];
  for (const [id, why] of invalid) {
    it(`rejects ${id} (${why})`, () => {
      assert.equal(parseQuestionId(id), null);
      assert.equal(questionFromId(id), null);
    });
  }

  it("turns a spec that is out of limits into null rather than throwing", () => {
    assert.equal(exponentCore({ skill: "exponents", exerciseType: "mul-law", mode: "value", variant: "std", args: [2, 9999999, 3] }), null);
    assert.equal(exponentCore({ skill: "exponents", exerciseType: "mul-law", mode: "value", variant: "std", args: [2.5, 3, 3] }), null);
    assert.equal(exponentCore({ skill: "exponents", exerciseType: "mul-law", mode: "value", variant: "std", args: [] }), null);
  });

  it("never divides by zero: the bases are never 0 and a quotient is a power", () => {
    assert.equal(parseQuestionId("exponents:v:div-law:std:0:3:2"), null);
    assert.equal(parseQuestionId("exponents:v:zero-negative:direct:0:-2"), null);
    assert.ok(parseQuestionId("exponents:v:div-law:std:2:2:5"));
    assert.equal(q("exponents:v:div-law:std:2:2:5").answerText, "0.125");
  });

  it("round-trips every id exactly", () => {
    for (const id of ["exponents:p:mul-law:std:2:5:7", "exponents:v:base:direct:-3:3", "exponents:p:simplify:g:-2:3:-2:2:1"]) {
      const spec = parseQuestionId(id);
      assert.ok(spec);
      assert.equal(idOfSpec(spec), id);
    }
  });

  it("stays within the largest allowed answer", () => {
    const largest = q("exponents:v:evaluate:std:10:6");
    assert.equal(largest.answerText, "1000000");
    assert.equal(parseQuestionId("exponents:v:evaluate:std:10:7"), null);
    assert.ok(fitsResult(rat(EXPONENT_RESULT_MAX), EXPONENT_RESULT_MAX));
    assert.equal(fitsResult(rat(EXPONENT_RESULT_MAX + 1), EXPONENT_RESULT_MAX), false);
    assert.equal(fitsResult(rat(1, EXPONENT_RESULT_MAX + 1), EXPONENT_RESULT_MAX), false);
  });
});

describe("exponents: configuration", () => {
  it("validates what the setup screen sends", () => {
    const ok = parseConfig(config());
    assert.ok(ok.ok);
    const bad = (patch: Record<string, unknown>) => parseConfig({ ...config(), ...patch });
    assert.equal(bad({ baseMin: 1 }).ok, false);
    assert.equal(bad({ baseMax: 21 }).ok, false);
    assert.equal(bad({ baseMin: 7, baseMax: 6 }).ok, false);
    assert.equal(bad({ expMin: -13 }).ok, false);
    assert.equal(bad({ expMax: 13 }).ok, false);
    assert.equal(bad({ expMin: 5, expMax: 4 }).ok, false);
    assert.equal(bad({ allowPositive: false, allowZero: false, allowNegative: false }).ok, false);
    assert.equal(bad({ maxResult: 5 }).ok, false);
    assert.equal(bad({ maxResult: EXPONENT_RESULT_MAX + 1 }).ok, false);
    assert.equal(bad({ level: "expert" }).ok, false);
    assert.equal(bad({ answerMode: "approx" }).ok, false);
    assert.equal(bad({ exerciseTypes: [] }).ok, false);
    assert.equal(bad({ exerciseTypes: ["nope"] }).ok, false);
    assert.equal(bad({ negativeBases: "yes" }).ok, false);
    assert.equal(bad({ baseMin: 2.5 }).ok, false);
    // Only negative exponents allowed but the range has none.
    assert.equal(bad({ allowPositive: false, allowZero: false, allowNegative: true, expMin: 1, expMax: 5 }).ok, false);
  });

  it("explains and drops the exercise types a mode or exponent kind cannot ask", () => {
    assert.ok(typeBlockReason("evaluate", "power", { allowPositive: true, allowZero: true, allowNegative: true })?.includes("Final Value"));
    assert.equal(typeBlockReason("evaluate", "value", { allowPositive: true, allowZero: false, allowNegative: false }), null);
    assert.ok(typeBlockReason("evaluate", "value", { allowPositive: false, allowZero: true, allowNegative: true }));
    assert.ok(typeBlockReason("zero-negative", "value", { allowPositive: true, allowZero: false, allowNegative: false }));
    assert.equal(typeBlockReason("zero-negative", "value", { allowPositive: true, allowZero: true, allowNegative: false }), null);
    assert.equal(availableTypes("value", { allowPositive: true, allowZero: true, allowNegative: true }).length, 8);
    assert.deepEqual(
      availableTypes("power", { allowPositive: true, allowZero: false, allowNegative: false }),
      ["base", "exponent", "mul-law", "div-law", "power-law", "simplify"]
    );
    // Evaluate is dropped in power form, not an error as long as something else is left.
    const parsed = parseConfig(config({ answerMode: "power", exerciseTypes: ["evaluate", "mul-law"] }));
    assert.ok(parsed.ok && parsed.config.skill === "exponents" && parsed.config.exerciseTypes.join() === "mul-law");
    assert.equal(parseConfig(config({ answerMode: "power", exerciseTypes: ["evaluate"] })).ok, false);
    assert.equal(parseConfig(config({ allowZero: false, allowNegative: false, exerciseTypes: ["zero-negative"] })).ok, false);
  });

  it("gives every example for every type in both modes (or none where the mode cannot ask it)", () => {
    for (const type of EXERCISE_TYPES.exponents) {
      assert.ok(EXPONENT_EXAMPLES[type]);
      assert.ok(EXPONENT_EXAMPLES[type].value.length > 0, type);
      assert.equal(EXPONENT_EXAMPLES[type].power.length > 0, type !== "evaluate", type);
    }
  });
});

describe("exponents: pools", () => {
  const modes = ["power", "value"] as const;

  for (const mode of modes) {
    it(`generates questions for every enabled type in ${mode} form`, () => {
      const c = config({ answerMode: mode });
      const parsed = parseConfig(c);
      assert.ok(parsed.ok);
      const counts: Record<string, number> = {};
      for (const { spec } of specsOf(parsed.config as ExponentsConfig)) counts[spec.exerciseType] = (counts[spec.exerciseType] ?? 0) + 1;
      const expected = availableTypes(mode, c);
      for (const type of expected) assert.ok((counts[type] ?? 0) > 0, `${type} has no ${mode} questions`);
      for (const type of Object.keys(counts)) assert.ok(expected.includes(type as never), `${type} should not appear in ${mode} form`);
    });
  }

  it("builds a valid, exactly-answerable question for every pooled id, in every level and mode", () => {
    for (const level of ["easy", "medium", "hard"] as const) {
      for (const mode of modes) {
        const c = levelConfig(level, mode);
        const pool = buildPool(c);
        assert.ok(pool.length > 0, `${level}/${mode}`);
        assert.equal(new Set(pool.map((p) => p.id)).size, pool.length, "ids are unique");
        for (const item of pool) {
          const question = q(item.id);
          assert.equal(question.id, item.id);
          assert.equal(idOfSpec(parseQuestionId(item.id)!), item.id);
          assert.equal(question.skill, "exponents");
          assert.equal(question.exerciseType, item.exerciseType);
          assert.ok(question.explanation && question.hint);
          // The same question is used for display, checking and scoring: its own exact answer is always accepted.
          assert.equal(checkAnswer(question, typedAnswer(question)).status, "correct", item.id);
          assert.equal(toPublicQuestion(question).prompt, question.prompt);
          assert.equal((toPublicQuestion(question) as unknown as Record<string, unknown>).expected, undefined);
          assert.ok(poolHas(c, item.id));
        }
      }
    }
  });

  it("is deterministic, and a type's questions do not depend on which other types are on", () => {
    const all = config({ answerMode: "value" });
    assert.deepEqual(buildPool(all).map((p) => p.id), buildPool({ ...all }).map((p) => p.id));
    const onlyMul = buildPool(config({ exerciseTypes: ["mul-law"] })).map((p) => p.id);
    const fromAll = buildPool(all).filter((p) => p.exerciseType === "mul-law").map((p) => p.id);
    assert.deepEqual(new Set(onlyMul), new Set(fromAll));
    // The level's name does not change what is asked either.
    assert.deepEqual(buildPool(config({ level: "easy" })).map((p) => p.id), buildPool(config({ level: "hard" })).map((p) => p.id));
  });

  it("keeps each type to a bounded sample", () => {
    const pool = buildPool(config({ baseMax: 20, expMin: -12, expMax: 12 }));
    const counts: Record<string, number> = {};
    for (const item of pool) counts[item.exerciseType] = (counts[item.exerciseType] ?? 0) + 1;
    for (const [type, count] of Object.entries(counts)) assert.ok(count <= 170, `${type}: ${count}`);
  });

  it("respects the base range, the exponent range and the kinds of exponent", () => {
    const c = config({ baseMin: 3, baseMax: 5, expMin: 1, expMax: 4, allowZero: false, allowNegative: false, negativeBases: false });
    for (const { spec } of specsOf(c)) {
      const [base, ...exps] = spec.args;
      assert.ok(base >= 3 && base <= 5, `${idOfSpec(spec)} base`);
      for (const e of exps) assert.ok(e >= 1 && e <= 4, `${idOfSpec(spec)} exponent ${e}`);
      for (const shown of exponentCore(spec)!.exponents) assert.ok(shown > 0, `${idOfSpec(spec)} shows ${shown}`);
    }
  });

  it("only uses zero exponents when zero is allowed", () => {
    const zeroOnly = config({ expMin: 0, expMax: 3, allowPositive: false, allowZero: true, allowNegative: false, exerciseTypes: ["mul-law", "zero-negative"] });
    const pool = specsOf(zeroOnly);
    assert.ok(pool.length > 0);
    for (const { spec } of pool) assert.deepEqual(exponentCore(spec)!.exponents.filter((e) => e !== 0), [], idOfSpec(spec));
    const noZero = specsOf(config({ allowZero: false }));
    for (const { spec } of noZero) assert.ok(!exponentCore(spec)!.exponents.includes(0), idOfSpec(spec));
  });

  it("only uses negative exponents when they are allowed", () => {
    const without = specsOf(config({ allowNegative: false }));
    for (const { spec } of without) assert.ok(exponentCore(spec)!.exponents.every((e) => e >= 0), idOfSpec(spec));
    const withNegatives = specsOf(config({ allowNegative: true }));
    assert.ok(withNegatives.some(({ spec }) => exponentCore(spec)!.exponents.some((e) => e < 0)));
  });

  it("only uses negative bases when they are allowed", () => {
    assert.deepEqual(exponentBases(config({ baseMin: 2, baseMax: 3, negativeBases: false })), [2, 3]);
    assert.deepEqual(exponentBases(config({ baseMin: 2, baseMax: 3, negativeBases: true })), [2, 3, -2, -3]);
    assert.ok(specsOf(config({ negativeBases: false })).every(({ spec }) => spec.args[0] > 0));
    assert.ok(specsOf(config({ negativeBases: true })).some(({ spec }) => spec.args[0] < 0));
  });

  it("keeps final-value answers within the maximum result", () => {
    for (const maxResult of [1_000, 100_000, 1_000_000]) {
      const c = config({ maxResult, baseMax: 10, expMax: 12 });
      for (const { spec } of specsOf(c)) {
        const value = exponentCore(spec)!.value;
        assert.ok(value !== null && fitsResult(value, maxResult), `${idOfSpec(spec)} exceeds ${maxResult}`);
      }
    }
  });

  it("does not use the maximum result in power form", () => {
    const small = specsOf(config({ answerMode: "power", maxResult: 10, exerciseTypes: ["mul-law"] }));
    assert.ok(small.length > 0);
    assert.ok(small.every(({ spec }) => exponentCore(spec)!.value === null));
  });

  it("is empty, not broken, when nothing fits", () => {
    const tiny = config({ maxResult: 10, baseMin: 20, baseMax: 20, negativeBases: false, answerMode: "value", exerciseTypes: ["evaluate"] });
    assert.equal(buildPool(tiny).length, 0);
  });

  it("keeps a positive-only pool free of negative results", () => {
    const c = config({ expMin: 1, expMax: 6, allowZero: false, allowNegative: false, negativeBases: false, exerciseTypes: ["div-law"], answerMode: "power" });
    const pool = specsOf(c);
    assert.ok(pool.length > 0);
    // 2^3 ÷ 2^5 would need a negative exponent, which is switched off.
    for (const { spec } of pool) assert.ok(spec.args[1] > spec.args[2], idOfSpec(spec));
  });
});

describe("exponents: difficulty levels", () => {
  it("Easy asks small positive powers: evaluation and the basic laws", () => {
    const c = levelConfig("easy", "value");
    assert.deepEqual(c.exerciseTypes, ["evaluate", "mul-law", "div-law"]);
    for (const { spec, item } of specsOf(c)) {
      const [base, ...exps] = spec.args;
      assert.ok(base >= 2 && base <= 5, item.id);
      assert.ok(exps.every((e) => e >= 1), item.id);
      assert.ok(fitsResult(exponentCore(spec)!.value!, c.maxResult), item.id);
      assert.equal(questionFromId(item.id)!.difficulty, "beginner", item.id);
    }
  });

  it("Medium adds missing bases and exponents, power of a power and the zero exponent, still without negatives", () => {
    const c = levelConfig("medium", "value");
    for (const type of ["base", "exponent", "power-law", "zero-negative"] as const) assert.ok(c.exerciseTypes.includes(type), type);
    const specs = specsOf(c).map(({ spec }) => spec);
    assert.ok(specs.every((s) => s.args[0] > 0));
    assert.ok(specs.every((s) => exponentCore(s)!.exponents.every((e) => e >= 0)));
    assert.ok(specs.some((s) => exponentCore(s)!.exponents.includes(0)));
    assert.ok(specs.some((s) => s.exerciseType === "base"));
  });

  it("Hard brings in negative exponents and bases, brackets and multi-step simplifying", () => {
    for (const mode of modes()) {
      const c = levelConfig("hard", mode);
      assert.ok(c.exerciseTypes.includes("simplify"));
      const specs = specsOf(c).map(({ spec }) => spec);
      assert.ok(specs.some((s) => s.args[0] < 0), "negative bases");
      assert.ok(specs.some((s) => exponentCore(s)!.exponents.some((e) => e < 0)), "negative exponents");
      assert.ok(specs.some((s) => s.exerciseType === "simplify" && q(idOfSpec(s)).prompt.includes("(")), "brackets");
      assert.ok(specs.some((s) => q(idOfSpec(s)).difficulty === "advanced"));
    }
  });

  it("each level asks harder questions than the one before", () => {
    const rank = { beginner: 0, intermediate: 1, advanced: 2 } as const;
    const mean = (level: "easy" | "medium" | "hard") => {
      const pool = buildPool(levelConfig(level, "value"));
      return pool.reduce((sum, item) => sum + rank[q(item.id).difficulty], 0) / pool.length;
    }
    assert.ok(mean("easy") < mean("medium"), "easy < medium");
    assert.ok(mean("medium") < mean("hard"), "medium < hard");
  });

  it("drops evaluate from a level's types in power form and re-applies the preset when the mode changes", () => {
    assert.ok(!levelConfig("easy", "power").exerciseTypes.includes("evaluate"));
    assert.ok(!levelConfig("medium", "power").exerciseTypes.includes("evaluate"));
    const easy = exponentsForLevel("easy", "value");
    assert.deepEqual(chooseExponentsMode(easy, "power").exerciseTypes, ["mul-law", "div-law"]);
    assert.equal(chooseExponentsMode(easy, "power").level, "easy");
    assert.deepEqual(chooseExponentsMode(chooseExponentsMode(easy, "power"), "value").exerciseTypes, ["evaluate", "mul-law", "div-law"]);
  });

  it("switches to Custom as soon as an option is changed, keeping the values", () => {
    const medium = exponentsForLevel("medium", "value");
    const edited = editExponents(medium, { baseMax: "12" });
    assert.equal(edited.level, "custom");
    assert.equal(edited.baseMax, "12");
    assert.equal(edited.expMax, medium.expMax);
    assert.equal(chooseExponentsLevel(edited, "custom").baseMax, "12");
    assert.equal(chooseExponentsLevel(edited, "hard").level, "hard");
    // Turning off zero and negative exponents drops the type that depends on them.
    const noZero = editExponents(exponentsForLevel("hard", "value"), { allowZero: false, allowNegative: false });
    assert.ok(!noZero.exerciseTypes.includes("zero-negative"));
    assert.ok(noZero.exerciseTypes.length > 0);
  });
});

function modes() {
  return ["power", "value"] as const;
}

describe("exponents: the setup screen", () => {
  const base = initialSetupState(DEFAULT_SETTINGS);

  it("starts from the default difficulty", () => {
    assert.equal(base.exponents.level, "easy");
    assert.equal(base.exponents.answerMode, "value");
    assert.equal(initialSetupState({ ...DEFAULT_SETTINGS, difficulty: "advanced" }).exponents.level, "hard");
    assert.equal(initialSetupState({ ...DEFAULT_SETTINGS, difficulty: "intermediate" }).exponents.level, "medium");
  });

  it("turns typed ranges into a configuration, and refuses half-typed ones", () => {
    const edit = (patch: object) => configFromState("exponents", { ...base, exponents: { ...base.exponents, ...patch } });
    const good = edit({ baseMin: "3", baseMax: "9", expMin: "-3", expMax: "7" });
    assert.ok(good.ok && good.config.skill === "exponents" && good.config.baseMin === 3 && good.config.expMin === -3 && good.config.expMax === 7);
    for (const patch of [{ baseMin: "" }, { baseMin: "1" }, { baseMax: "21" }, { baseMin: "9", baseMax: "3" }, { expMin: "-" }, { expMin: "-13" }, { expMax: "13" }, { expMin: "5", expMax: "2" }]) {
      const built = edit(patch);
      assert.equal(built.ok, false, JSON.stringify(patch));
    }
    assert.match((edit({ baseMin: "1" }) as { error: string }).error, /base range between 2 and 20/);
    assert.match((edit({ expMin: "-" }) as { error: string }).error, /exponent range between -12 and 12/);
  });

  it("remembers the last options on this device, field by field", () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const fallback = exponentsForLevel("easy", "value");
    assert.deepEqual(loadExponentsSetup(fallback), fallback, "nothing saved yet");
    const custom = editExponents(chooseExponentsMode(exponentsForLevel("hard", "value"), "power"), { baseMax: "12", expMin: "-8" });
    saveExponentsSetup(custom);
    assert.deepEqual(loadExponentsSetup(fallback), custom);
    // A damaged value falls back on its own without losing the rest.
    store.set("math-trainer:setup:exponents", JSON.stringify({ ...custom, baseMax: "banana", maxResult: 3, allowZero: "yes" }));
    const partial = loadExponentsSetup(fallback);
    assert.equal(partial.baseMax, fallback.baseMax);
    assert.equal(partial.maxResult, fallback.maxResult);
    assert.equal(partial.allowZero, fallback.allowZero);
    assert.equal(partial.expMin, "-8");
    store.set("math-trainer:setup:exponents", "{not json");
    assert.deepEqual(loadExponentsSetup(fallback), fallback);
  });
});

describe("exponents: concepts and progress", () => {
  it("groups questions by the idea they practise", () => {
    assert.equal(q("exponents:v:evaluate:std:2:5").concept, "exponents:powers-of:2");
    assert.equal(q("exponents:v:evaluate:std:-2:3").concept, "exponents:powers-of:2");
    assert.equal(q("exponents:v:exponent:direct:2:5").concept, "exponents:powers-of:2");
    assert.equal(q("exponents:p:mul-law:std:2:5:7").concept, "exponents:law:product");
    assert.equal(q("exponents:p:div-law:std:2:5:2").concept, "exponents:law:quotient");
    assert.equal(q("exponents:p:power-law:std:2:3:2").concept, "exponents:law:power");
    assert.equal(q("exponents:p:zero-negative:mul:10:-2:5").concept, "exponents:zero-negative");
    assert.equal(q("exponents:p:simplify:a:2:3:4:2").concept, "exponents:simplify");
    assert.equal(exponentConceptLabel("powers-of:2"), "Powers of 2");
    assert.equal(exponentConceptLabel("law:product"), "Product law");
    assert.equal(exponentConceptLabel("simplify"), "Multi-step simplifying");
    assert.equal(exponentConceptLabel("something-new"), "something-new");
  });

  it("is a registered skill with an exercise type list", () => {
    assert.ok(SKILLS.includes("exponents"));
    assert.equal(EXERCISE_TYPES.exponents.length, 8);
  });

  it("scores attempts like every other skill", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const first = applyAttempt(null, { outcome: "correct", hinted: false, responseTimeMs: 4000 }, "exponents", now);
    assert.equal(first.totalAttempts, 1);
    assert.equal(first.correctAttempts, 1);
    const second = applyAttempt(first, { outcome: "incorrect", hinted: false, responseTimeMs: 4000 }, "exponents", now);
    assert.equal(second.incorrectAttempts, 1);
    assert.equal(second.box, 1);
  });
});

// A minimal in-memory localStorage; node has none.
class MemoryStorage {
  private items = new Map<string, string>();
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

describe("exponents: sessions, progress and review", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  });

  const post = (url: string, body?: unknown) =>
    guestFetch(url, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });

  const sessionBody = (answerMode: "power" | "value") => {
    const c = levelConfig("hard", answerMode);
    return { skill: "exponents", mode: "fixed", targetQuestionCount: 10, config: c };
  };

  async function next(id: number) {
    const res = await guestFetch(`/api/sessions/${id}/next`);
    assert.equal(res.status, 200);
    return (await res.json()).question;
  }

  for (const mode of modes()) {
    it(`runs a ${mode}-form session from the first question to the progress figures`, async () => {
      const created = await post("/api/sessions", sessionBody(mode));
      assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
      const { id } = await created.json();
      const seen = new Set<string>();
      for (let i = 0; i < 6; i += 1) {
        const question = await next(id);
        assert.equal(question.skill, "exponents");
        assert.equal(question.answer, undefined, "the answer must not reach the screen");
        seen.add(question.id);
        const answer = typedAnswer(q(question.id));
        const result = await (await post(`/api/sessions/${id}/attempt`, { questionId: question.id, userAnswer: answer, responseTimeMs: 2000 })).json();
        assert.equal(result.isCorrect, true, question.id);
      }
      assert.ok(seen.size > 1, "questions should vary");
      const summary = guestSkillSummaries(loadGuestData()).exponents;
      assert.equal(summary.attempts, 6);
      assert.equal(summary.accuracy, 100);
    });
  }

  it("refuses an answer the format cannot hold, a foreign question and an invalid config", async () => {
    const { id } = await (await post("/api/sessions", sessionBody("value"))).json();
    const question = await next(id);
    assert.equal((await post(`/api/sessions/${id}/attempt`, { questionId: question.id, userAnswer: "abc", responseTimeMs: 100 })).status, 400);
    // Valid question, but not one this session's configuration can ask.
    assert.equal((await post(`/api/sessions/${id}/attempt`, { questionId: "exponents:v:evaluate:std:19:2", userAnswer: "361", responseTimeMs: 100 })).status, 400);
    assert.equal((await post(`/api/sessions/${id}/attempt`, { questionId: "exponents:v:evaluate:std:1:5", userAnswer: "1", responseTimeMs: 100 })).status, 400);
    const bad = await post("/api/sessions", { ...sessionBody("value"), config: { ...levelConfig("hard", "value"), baseMin: 1 } });
    assert.equal(bad.status, 400);
    const empty = await post("/api/sessions", {
      ...sessionBody("value"),
      config: config({ maxResult: 10, baseMin: 20, baseMax: 20, negativeBases: false, exerciseTypes: ["evaluate"] }),
    });
    assert.equal(empty.status, 400);
  });

  it("scores a wrong answer, keeps it for review and retries only the mistakes", async () => {
    const { id } = await (await post("/api/sessions", sessionBody("power"))).json();
    const first = await next(id);
    const right = typedAnswer(q(first.id));
    const wrong = String(Number(right) + 1);
    const result = await (await post(`/api/sessions/${id}/attempt`, { questionId: first.id, userAnswer: wrong, responseTimeMs: 3000 })).json();
    assert.equal(result.isCorrect, false);
    assert.equal(result.outcome, "incorrect");
    assert.equal(result.correctAnswer, q(first.id).answerText);

    const review = await (await post("/api/sessions", { mode: "review", reviewSessionId: id })).json();
    assert.deepEqual(review.questionList, [first.id]);
    const again = await next(review.id);
    assert.equal(again.id, first.id);
    assert.equal(again.prompt, q(first.id).prompt);
    const retried = await (await post(`/api/sessions/${review.id}/attempt`, { questionId: first.id, userAnswer: right, responseTimeMs: 2000 })).json();
    assert.equal(retried.isCorrect, true);

    // The same mistakes can be pulled in by skill and exercise type from the last few days.
    const recent = await post("/api/sessions", { mode: "review", reviewRecentDays: 7, skill: "exponents" });
    assert.equal(recent.status, 201);
    const byType = await post("/api/sessions", { mode: "review", reviewRecentDays: 7, skill: "exponents", exerciseType: first.exerciseType });
    assert.equal(byType.status, 201);
    const other = await post("/api/sessions", { mode: "review", reviewRecentDays: 7, skill: "square" });
    assert.equal(other.status, 400);

    const data = loadGuestData();
    const stat = data.stats[first.id];
    assert.equal(stat.skill, "exponents");
    assert.equal(stat.exerciseType, first.exerciseType);
    assert.equal(stat.totalAttempts, 2);
    assert.equal(stat.concept, q(first.id).concept);
  });
});
