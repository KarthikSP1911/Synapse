import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AVATAR_IDS, DEFAULT_AVATAR, cleanLine, cleanText, normalizeUsername, parseAvatar, parseGoal, usernameProblem } from "./profile";

describe("usernames", () => {
  it("stores a valid username lower-cased and trimmed", () => {
    assert.equal(normalizeUsername("  Quick_Fox7 "), "quick_fox7");
    assert.equal(usernameProblem("  Quick_Fox7 "), null);
  });

  it("rejects the wrong length, characters and starts, each with a reason", () => {
    const cases: [string, RegExp][] = [
      ["ab", /at least 3/],
      ["a".repeat(21), /at most 20/],
      ["9lives", /start with a letter/],
      ["_hidden", /start with a letter/],
      ["no spaces", /letters, numbers and underscores/],
      ["dash-ed", /letters, numbers and underscores/],
      ["émile", /start with a letter|letters, numbers/],
      ["admin", /not available/],
    ];
    for (const [input, reason] of cases) {
      assert.equal(normalizeUsername(input), null, input);
      assert.match(usernameProblem(input) ?? "", reason, input);
    }
  });

  it("rejects anything that is not a string", () => {
    assert.equal(normalizeUsername(undefined), null);
    assert.equal(normalizeUsername(42), null);
    assert.ok(usernameProblem(null));
  });
});

describe("profile text", () => {
  it("collapses whitespace in single-line fields and caps the length", () => {
    assert.equal(cleanLine("  Ada \n  Lovelace  ", 40), "Ada Lovelace");
    assert.equal(cleanLine("x".repeat(100), 10), "x".repeat(10));
    assert.equal(cleanLine(5, 10), "");
  });

  it("keeps line breaks in the bio but not runs of blank lines", () => {
    assert.equal(cleanText("one\r\ntwo\n\n\n\nthree  ", 160), "one\ntwo\n\nthree");
  });
});

describe("avatars and choices", () => {
  it("falls back to the default avatar for an unknown id", () => {
    assert.equal(parseAvatar("rocket"), "rocket");
    assert.equal(parseAvatar("not-an-avatar"), DEFAULT_AVATAR);
    assert.equal(parseAvatar(undefined), DEFAULT_AVATAR);
  });

  it("lists every avatar once", () => {
    assert.equal(new Set(AVATAR_IDS).size, AVATAR_IDS.length);
  });

  it("treats an unknown goal as unset", () => {
    assert.equal(parseGoal("exam"), "exam");
    assert.equal(parseGoal("world-domination"), null);
  });
});
