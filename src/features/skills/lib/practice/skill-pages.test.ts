import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COUNT_STEP_MS, GO_MS, type Timers } from "@/lib/timeline";
import { isNavActive } from "@/lib/nav";
import { countdownLength, runCountdown, startAfterCountdown, type CountdownStep } from "./practice-countdown";
import { PRACTICE_SOUND_KEY, loadPracticeSound, savePracticeSound } from "./practice-sound";
import { SKILL_PATHS, legacySkillRedirect, parseSkillParam, skillHref } from "../routes";
import { SKILLS } from "../types";

describe("skill routes", () => {
  it("accepts exactly the eight skills", () => {
    for (const skill of SKILLS) assert.equal(parseSkillParam(skill), skill);
    assert.equal(SKILLS.length, 8);
    for (const bad of ["", "Multiplication", "algebra", "square ", "../play", undefined, null, 7, ["square"]]) {
      assert.equal(parseSkillParam(bad), null, String(bad));
    }
  });

  it("gives every skill its own page", () => {
    assert.equal(skillHref("multiplication"), "/skills/multiplication");
    assert.deepEqual(SKILL_PATHS, SKILLS.map((s) => `/skills/${s}`));
  });

  it("redirects old /?skill= links to the skill page", () => {
    assert.equal(legacySkillRedirect("square"), "/skills/square");
    assert.equal(legacySkillRedirect("multiplication"), "/skills/multiplication");
  });

  it("leaves the hub alone for anything else", () => {
    assert.equal(legacySkillRedirect(undefined), null);
    assert.equal(legacySkillRedirect("nope"), null);
    assert.equal(legacySkillRedirect(["square", "addition"]), null);
  });

  it("marks Practice active on the hub and on every skill page only", () => {
    assert.equal(isNavActive("/", "/"), true);
    for (const path of SKILL_PATHS) assert.equal(isNavActive("/", path), true);
    assert.equal(isNavActive("/", "/progress"), false);
    assert.equal(isNavActive("/", "/mindsprint"), false);
    assert.equal(isNavActive("/progress", "/skills/square"), false);
    assert.equal(isNavActive("/progress", "/progress"), true);
  });

  it("lists every skill page in the service worker and the offline warm-up", () => {
    const worker = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
    const client = readFileSync(join(process.cwd(), "src", "features", "offline", "lib", "sw-client.ts"), "utf8");
    for (const path of SKILL_PATHS) assert.ok(worker.includes(`"${path}"`), `sw.js is missing ${path}`);
    assert.ok(client.includes("SKILL_PATHS"), "sw-client.ts does not warm the skill pages");
  });
});

/** Timers that never run by themselves: the test fires them in time order, as a clock would. */
function fakeTimers() {
  const scheduled: { fn: () => void; ms: number; cancelled: boolean; fired: boolean }[] = [];
  const timers: Timers = {
    setTimeout: (fn, ms) => scheduled.push({ fn, ms, cancelled: false, fired: false }) - 1,
    clearTimeout: (handle) => {
      scheduled[handle as number].cancelled = true;
    },
  };
  /** Runs everything due up to `ms` that has not been cancelled. */
  const advanceTo = (ms: number) => {
    for (const t of [...scheduled].sort((a, b) => a.ms - b.ms)) {
      if (t.ms <= ms && !t.cancelled && !t.fired) {
        t.fired = true;
        t.fn();
      }
    }
  };
  return { timers, scheduled, advanceTo };
}

describe("start countdown", () => {
  it("counts 3, 2, 1, then GO, then finishes after the signal", () => {
    const { timers, scheduled, advanceTo } = fakeTimers();
    const steps: CountdownStep[] = [];
    runCountdown((s) => steps.push(s), timers);
    assert.deepEqual(scheduled.map((t) => t.ms), [0, COUNT_STEP_MS, 2 * COUNT_STEP_MS, 3 * COUNT_STEP_MS, 3 * COUNT_STEP_MS + GO_MS]);
    assert.equal(countdownLength(), 3 * COUNT_STEP_MS + GO_MS);
    advanceTo(10_000);
    assert.deepEqual(steps, [{ kind: "count", value: 3 }, { kind: "count", value: 2 }, { kind: "count", value: 1 }, { kind: "go" }, { kind: "done" }]);
  });

  it("starts the session only once the countdown has finished", () => {
    const { timers, advanceTo } = fakeTimers();
    let started = 0;
    startAfterCountdown(() => {}, () => started++, timers);
    advanceTo(0);
    advanceTo(3 * COUNT_STEP_MS);
    assert.equal(started, 0, "no session while counting or showing GO");
    advanceTo(3 * COUNT_STEP_MS + GO_MS);
    assert.equal(started, 1);
  });

  it("creates no session when cancelled at any point before the end", () => {
    for (const cancelAt of [0, COUNT_STEP_MS, 2 * COUNT_STEP_MS, 3 * COUNT_STEP_MS, 3 * COUNT_STEP_MS + GO_MS - 1]) {
      const { timers, advanceTo } = fakeTimers();
      let started = 0;
      const cancel = startAfterCountdown(() => {}, () => started++, timers);
      advanceTo(cancelAt);
      cancel();
      advanceTo(60_000);
      assert.equal(started, 0, `cancelled at ${cancelAt}ms`);
    }
  });
});

describe("practice sound preference", () => {
  class MemoryStorage {
    items = new Map<string, string>();
    getItem(key: string) {
      return this.items.get(key) ?? null;
    }
    setItem(key: string, value: string) {
      this.items.set(key, value);
    }
  }
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as { localStorage?: unknown }).localStorage = storage;
  });

  it("defaults to on", () => {
    assert.equal(loadPracticeSound(), true);
  });

  it("remembers the choice", () => {
    savePracticeSound(false);
    assert.equal(loadPracticeSound(), false);
    savePracticeSound(true);
    assert.equal(loadPracticeSound(), true);
  });

  it("is kept apart from the games' sound setting", () => {
    assert.notEqual(PRACTICE_SOUND_KEY, "mathz:mindsprint:sound");
    storage.setItem("mathz:mindsprint:sound", "off");
    assert.equal(loadPracticeSound(), true);
    savePracticeSound(false);
    assert.equal(storage.getItem("mathz:mindsprint:sound"), "off");
    storage.setItem("mathz:mindsprint:sound", "on");
    assert.equal(loadPracticeSound(), false);
  });

  it("survives storage that throws", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    assert.equal(loadPracticeSound(), true);
    assert.doesNotThrow(() => savePracticeSound(false));
  });
});
