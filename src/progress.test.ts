import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { completeCourse, emptyProgress, isCourseUnlocked, parseProgress, resetProgress, shouldAdvanceProgress } from "./progress";

describe("Puzzle Challenge progress", () => {
  it("starts with Beginner Level 1 as the only available course", () => {
    const progress = emptyProgress();
    assert.strictEqual(isCourseUnlocked(progress, "beginner-1"), true);
    assert.strictEqual(isCourseUnlocked(progress, "beginner-2"), false);
  });

  it("unlocks exactly the next course when the current one is completed", () => {
    const progress = completeCourse(emptyProgress(), "beginner-1");
    assert.deepStrictEqual(progress.completed, ["beginner-1"]);
    assert.strictEqual(isCourseUnlocked(progress, "beginner-2"), true);
    assert.strictEqual(isCourseUnlocked(progress, "beginner-3"), false);
  });

  it("is idempotent and ignores malformed stored values", () => {
    const complete = completeCourse(completeCourse(emptyProgress(), "beginner-1"), "beginner-1");
    assert.deepStrictEqual(complete.completed, ["beginner-1"]);
    assert.deepStrictEqual(parseProgress('{"version":1,"completed":["beginner-1","not-a-course"]}'), { version: 1, completed: ["beginner-1"] });
    assert.deepStrictEqual(parseProgress("not json"), emptyProgress());
  });

  it("resets only Puzzle Challenge completion back to the first level", () => {
    assert.deepStrictEqual(resetProgress(), emptyProgress());
    assert.strictEqual(isCourseUnlocked(resetProgress(), "beginner-1"), true);
    assert.strictEqual(isCourseUnlocked(resetProgress(), "beginner-2"), false);
  });

  it("only awards course progression in Puzzle Challenge mode", () => {
    assert.strictEqual(shouldAdvanceProgress("challenge"), true);
    assert.strictEqual(shouldAdvanceProgress("shared"), false);
    assert.strictEqual(shouldAdvanceProgress("daily"), false);
  });
});
