import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { questionFromId } from "./build";
import { checkAnswer, inputProblem } from "./answers";
import { parseQuestionId } from "./ids";
import { buildPool, parseConfig, poolHas } from "./pools";
import { decimalPlaces, isInteger } from "./rational";
import type { PracticeConfig, Question } from "./types";

function q(id: string): Question {
  const question = questionFromId(id);
  assert.ok(question, `${id} should parse`);
  return question;
}
const status = (id: string, answer: string) => checkAnswer(q(id), answer).status;

const additive = (skill: "addition" | "subtraction", leftDigits: number[], rightDigits: number[], allowNegative = false): PracticeConfig =>
  skill === "addition"
    ? { skill, exerciseTypes: ["add"], leftDigits, rightDigits }
    : { skill, exerciseTypes: ["subtract"], leftDigits, rightDigits, allowNegative };

const dividing = (dividendDigits: number[], divisorDigits: number[], decimals: boolean): PracticeConfig => ({
  skill: "division",
  exerciseTypes: ["divide"],
  dividendDigits,
  divisorDigits,
  decimals,
});

const questionsOf = (config: PracticeConfig) => buildPool(config).map((item) => q(item.id));

describe("arithmetic question ids", () => {
  it("round-trips and rebuilds the same question", () => {
    for (const id of ["addition:47:38", "subtraction:23:58", "subtraction:58:23", "division:84:7", "division:15:4"]) {
      assert.ok(parseQuestionId(id), id);
      assert.equal(q(id).id, id);
    }
  });

  it("rejects ids that are malformed, out of range or have no clean answer", () => {
    const bad = [
      "addition:0:5", // operands start at 1
      "addition:5:10000", // five digits
      "addition:05:3", // not canonical
      "addition:1:2:3",
      "subtraction:5:5", // the answer would be zero
      "division:84:1", // dividing by one
      "division:5:7", // dividend must be larger
      "division:10:3", // 3.333... does not end
      "division:1:2", // dividend below the minimum
      "division:100:1000", // divisor above three digits
    ];
    for (const id of bad) assert.equal(parseQuestionId(id), null, id);
  });
});

describe("addition", () => {
  it("builds the sum with a worked explanation", () => {
    const question = q("addition:47:38");
    assert.equal(question.prompt, "47 + 38");
    assert.equal(question.answerText, "85");
    assert.equal(question.explanation, "Add 38 to 47 in parts: 47 + 30 = 77, 77 + 8 = 85.");
    assert.equal(status("addition:47:38", "85"), "correct");
    assert.equal(status("addition:47:38", "84"), "incorrect");
  });

  it("offers every digit combination, capped per combination", () => {
    for (const left of [1, 2, 3, 4]) {
      for (const right of [1, 2, 3, 4]) {
        const pool = buildPool(additive("addition", [left], [right]));
        assert.ok(pool.length > 0, `${left} + ${right} digits`);
        assert.ok(pool.length <= 120, `${left} + ${right} digits has ${pool.length}`);
      }
    }
    // One-digit pairs are few enough to list in full.
    assert.equal(buildPool(additive("addition", [1], [1])).length, 81);
  });

  it("keeps operands to the chosen digit counts", () => {
    for (const question of questionsOf(additive("addition", [3], [1]))) {
      assert.ok(question.skill === "addition");
      assert.ok(question.left >= 100 && question.left <= 999 && question.right >= 1 && question.right <= 9);
    }
  });
});

describe("subtraction", () => {
  it("never asks for a negative answer unless allowed", () => {
    const pool = questionsOf(additive("subtraction", [1, 2, 3], [1, 2, 3]));
    assert.ok(pool.length > 0);
    for (const question of pool) assert.ok(question.skill === "subtraction" && question.left > question.right, question.id);
  });

  it("includes negative answers when allowed", () => {
    const pool = questionsOf(additive("subtraction", [2], [2], true));
    assert.ok(pool.some((x) => x.skill === "subtraction" && x.left < x.right));
    assert.ok(pool.some((x) => x.skill === "subtraction" && x.left > x.right));
  });

  it("has no questions when the second number must be longer but negatives are off", () => {
    assert.equal(buildPool(additive("subtraction", [1], [3])).length, 0);
    assert.ok(buildPool(additive("subtraction", [1], [3], true)).length > 0);
  });

  it("explains a negative answer and shows the same answer box either way", () => {
    const negative = q("subtraction:23:58");
    const positive = q("subtraction:58:23");
    assert.equal(negative.answerText, "-35");
    assert.equal(positive.answerText, "35");
    assert.deepEqual(negative.answerFormat, positive.answerFormat);
    assert.deepEqual(negative.answerFormat, { kind: "integer", signed: true });
    assert.equal(negative.explanation, "58 is larger than 23, so work out 58 − 23 = 35 and make it negative: 23 − 58 = −35.");
    assert.equal(positive.explanation, "Subtract 23 in parts: 58 − 20 = 38, 38 − 3 = 35.");
  });

  it("checks signed answers exactly", () => {
    assert.equal(status("subtraction:23:58", "-35"), "correct");
    assert.equal(status("subtraction:23:58", "−35"), "correct"); // typographic minus
    assert.equal(status("subtraction:23:58", "35"), "incorrect");
    assert.equal(status("subtraction:58:23", "-35"), "incorrect");
    assert.equal(status("subtraction:58:23", "35"), "correct");
    for (const bad of ["--35", "35-", "- 35", "-", "-3.5.1"]) assert.equal(status("subtraction:23:58", bad), "invalid", bad);
  });

  it("only accepts a minus sign where the format is signed", () => {
    assert.equal(status("addition:47:38", "-85"), "invalid");
    assert.equal(status("division:84:7", "-12"), "invalid");
    assert.equal(inputProblem(q("subtraction:23:58").answerFormat, "-"), "Use digits, with an optional minus sign at the start.");
  });
});

describe("division", () => {
  it("answers whole and decimal quotients exactly", () => {
    assert.equal(q("division:84:7").answerText, "12");
    assert.equal(q("division:15:4").answerText, "3.75");
    assert.equal(status("division:15:4", "3.75"), "correct");
    assert.equal(status("division:15:4", "3.750"), "correct");
    assert.equal(status("division:15:4", "3.7"), "incorrect");
    assert.equal(status("division:84:7", "12.0"), "correct");
    assert.equal(q("division:15:4").explanation, "4 × 3 = 12, leaving 3. 3 ÷ 4 = 0.75, so 15 ÷ 4 = 3.75.");
    assert.equal(q("division:84:7").explanation, "7 × 12 = 84, so 84 ÷ 7 = 12.");
  });

  it("uses one answer format for every question, so the box never hints at a decimal", () => {
    assert.deepEqual(q("division:84:7").answerFormat, q("division:15:4").answerFormat);
  });

  it("asks whole-number answers only when decimals are off", () => {
    const pool = questionsOf(dividing([2, 3], [1, 2], false));
    assert.ok(pool.length > 0);
    for (const question of pool) assert.ok(isInteger(question.expected as never), question.id);
  });

  it("mixes whole and decimal answers, ending within two places, when decimals are on", () => {
    const pool = questionsOf(dividing([2, 3], [1, 2], true));
    assert.ok(pool.some((x) => isInteger(x.expected as never)));
    assert.ok(pool.some((x) => !isInteger(x.expected as never)));
    for (const question of pool) {
      assert.ok((decimalPlaces(question.expected as never) ?? 99) <= 2, question.id);
    }
  });

  it("keeps dividends and divisors to the chosen digit counts and above one", () => {
    for (const question of questionsOf(dividing([3], [2], true))) {
      assert.ok(question.skill === "division");
      assert.ok(question.dividend >= 100 && question.dividend <= 999 && question.divisor >= 10 && question.divisor <= 99, question.id);
      assert.ok(question.dividend > question.divisor);
    }
  });

  it("finds questions for every workable digit combination", () => {
    for (const dividend of [1, 2, 3, 4]) {
      for (const divisor of [1, 2, 3]) {
        if (divisor > dividend) continue; // e.g. a one-digit dividend cannot exceed a three-digit divisor
        for (const decimals of [true, false]) {
          assert.ok(buildPool(dividing([dividend], [divisor], decimals)).length > 0, `${dividend} ÷ ${divisor} digits, decimals ${decimals}`);
        }
      }
    }
  });
});

describe("arithmetic pools", () => {
  it("only contain ids that parse back, are unique and belong to the pool", () => {
    const configs = [
      additive("addition", [1, 2, 3, 4], [1, 2, 3, 4]),
      additive("subtraction", [1, 2, 3, 4], [1, 2, 3, 4], true),
      dividing([1, 2, 3, 4], [1, 2, 3], true),
    ];
    for (const config of configs) {
      const pool = buildPool(config);
      assert.equal(new Set(pool.map((item) => item.id)).size, pool.length);
      for (const item of pool) {
        assert.ok(parseQuestionId(item.id), item.id);
        assert.ok(poolHas(config, item.id));
      }
    }
  });

  it("do not include questions outside the chosen digit counts", () => {
    const config = additive("addition", [1], [1]);
    assert.equal(poolHas(config, "addition:47:38"), false);
  });

  it("give the same questions for the same configuration every time", () => {
    const first = buildPool(additive("addition", [3], [3])).map((item) => item.id);
    const second = buildPool(additive("addition", [3], [3])).map((item) => item.id);
    assert.deepEqual(first, second);
  });
});

describe("arithmetic config validation", () => {
  it("canonicalises digit lists", () => {
    const result = parseConfig({ skill: "addition", leftDigits: [3, 1, 3], rightDigits: [2] });
    assert.ok(result.ok);
    assert.deepEqual(result.ok && result.config, { skill: "addition", exerciseTypes: ["add"], leftDigits: [1, 3], rightDigits: [2] });
  });

  it("rejects empty, out-of-range and non-integer digit lists", () => {
    for (const leftDigits of [[], [0], [5], [1.5], ["2"], "2", null, undefined]) {
      assert.equal(parseConfig({ skill: "addition", leftDigits, rightDigits: [1] }).ok, false, JSON.stringify(leftDigits));
    }
    assert.equal(parseConfig({ skill: "division", dividendDigits: [2], divisorDigits: [4], decimals: true }).ok, false);
  });

  it("requires the flags that change the questions", () => {
    assert.equal(parseConfig({ skill: "subtraction", leftDigits: [2], rightDigits: [2] }).ok, false);
    assert.equal(parseConfig({ skill: "subtraction", leftDigits: [2], rightDigits: [2], allowNegative: "yes" }).ok, false);
    assert.equal(parseConfig({ skill: "division", dividendDigits: [2], divisorDigits: [1] }).ok, false);
    assert.ok(parseConfig({ skill: "subtraction", leftDigits: [2], rightDigits: [2], allowNegative: true }).ok);
    assert.ok(parseConfig({ skill: "division", dividendDigits: [2], divisorDigits: [1], decimals: false }).ok);
  });
});
