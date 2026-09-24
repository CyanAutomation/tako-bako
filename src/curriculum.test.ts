import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertPartialMatch } from "../test-utils.js";

import { courseFor, courseProgressLabel, courses, firstAvailableCourse, nextCourse, puzzleParametersForCourse } from "./curriculum";

describe("Puzzle Challenge curriculum", () => {
  it("uses the bridge at the two structural transitions while retaining all 12 levels", () => {
    assert.deepStrictEqual(courses.filter(course => course.tier === "beginner").map(course => course.difficultyLevel), [1, 2, 3, 4]);
    assert.deepStrictEqual(courses.filter(course => course.tier === "intermediate").map(course => [course.templateId, course.difficultyLevel]), [["open-division-v2", 5], ["open-division-v2", 6], ["open-division-v2", 7], ["championship-bridge-v1", 8]]);
    assert.deepStrictEqual(courses.filter(course => course.tier === "advanced").map(course => [course.templateId, course.difficultyLevel]), [["championship-bridge-v1", 9], ["championship-circuit-v2", 10], ["championship-circuit-v2", 11], ["championship-circuit-v2", 12]]);
  });

  it("maps each player-facing tier and level to the calibrated Yokaiba template", () => {
    assertPartialMatch(courseFor("beginner", 1), { label: "Beginner Level 1", templateId: "tournament-order-v2", difficultyLevel: 1 });
    assertPartialMatch(courseFor("intermediate", 3), { label: "Intermediate Level 3", templateId: "open-division-v2", difficultyLevel: 7 });
    assertPartialMatch(courseFor("advanced", 4), { label: "Advanced Level 4", templateId: "championship-circuit-v2", difficultyLevel: 12 });
  });

  it("advances from the fourth level of a tier to the first level of the next tier", () => {
    assertPartialMatch(nextCourse(courseFor("beginner", 4)!), { tier: "intermediate", level: 1 });
    assert.strictEqual(nextCourse(courseFor("advanced", 4)!), undefined);
  });

  it("returns the first incomplete course as the continue target", () => {
    assertPartialMatch(firstAvailableCourse(["beginner-1", "beginner-2"]), { tier: "beginner", level: 3 });
    assertPartialMatch(firstAvailableCourse(["beginner-1", "beginner-2", "beginner-3", "beginner-4"]), { tier: "intermediate", level: 1 });
  });

  it("keeps generator parameters behind the player-facing curriculum", () => {
    assert.deepStrictEqual(puzzleParametersForCourse(courseFor("intermediate", 4)!), { templateId: "championship-bridge-v1", difficultyLevel: 8 });
  });

  it("summarises current-tier progress for the compact header status", () => {
    assert.strictEqual(courseProgressLabel(courseFor("beginner", 3)!, new Set(["beginner-1", "beginner-2"])), "Beginner · 2/4 complete");
    assert.strictEqual(courseProgressLabel(courseFor("advanced", 1)!, new Set(["beginner-1", "intermediate-1"])), "Advanced · 0/4 complete");
  });
});
