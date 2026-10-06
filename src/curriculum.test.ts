import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertPartialMatch } from "../test-utils.js";

import { courseFor, courseForId, courseProgressLabel, courses, firstAvailableCourse, nextCourse, puzzleParametersForCourse } from "./curriculum";

describe("Puzzle Challenge curriculum", () => {
  it("[TB-CHALLENGE-01] maps all twelve player-facing courses to their calibrated Yokaiba parameters", () => {
    const expected = [
      ["beginner-1", "tournament-order-v2", 1],
      ["beginner-2", "tournament-order-v2", 2],
      ["beginner-3", "tournament-order-v2", 3],
      ["beginner-4", "tournament-order-v2", 4],
      ["intermediate-1", "open-division-v2", 5],
      ["intermediate-2", "open-division-v2", 6],
      ["intermediate-3", "open-division-v2", 7],
      ["intermediate-4", "championship-bridge-v1", 8],
      ["advanced-1", "championship-bridge-v1", 9],
      ["advanced-2", "championship-circuit-v2", 10],
      ["advanced-3", "championship-circuit-v2", 11],
      ["advanced-4", "championship-circuit-v2", 12],
    ] as const;

    assert.deepStrictEqual(courses.map(course => [course.id, course.templateId, course.difficultyLevel]), expected);
    for (const [id, templateId, difficultyLevel] of expected) {
      assert.deepStrictEqual(puzzleParametersForCourse(courseForId(id)!), { templateId, difficultyLevel });
    }
  });

  it("advances from the fourth level of a tier to the first level of the next tier", () => {
    assertPartialMatch(nextCourse(courseFor("beginner", 4)!), { tier: "intermediate", level: 1 });
    assert.strictEqual(nextCourse(courseFor("advanced", 4)!), undefined);
  });

  it("returns the first incomplete course as the continue target", () => {
    assertPartialMatch(firstAvailableCourse(["beginner-1", "beginner-2"]), { tier: "beginner", level: 3 });
    assertPartialMatch(firstAvailableCourse(["beginner-1", "beginner-2", "beginner-3", "beginner-4"]), { tier: "intermediate", level: 1 });
  });

  it("summarises current-tier progress for the compact header status", () => {
    assert.strictEqual(courseProgressLabel(courseFor("beginner", 3)!, new Set(["beginner-1", "beginner-2"])), "Beginner · 2/4 complete");
    assert.strictEqual(courseProgressLabel(courseFor("advanced", 1)!, new Set(["beginner-1", "intermediate-1"])), "Advanced · 0/4 complete");
  });
});
