import { describe, expect, it } from "vitest";
import { courseFor, courseProgressLabel, courses, firstAvailableCourse, nextCourse, puzzleParametersForCourse } from "./curriculum";

describe("Puzzle Challenge curriculum", () => {
  it("uses the bridge at the two structural transitions while retaining all 12 levels", () => {
    expect(courses.filter(course => course.tier === "beginner").map(course => course.difficultyLevel)).toEqual([1, 2, 3, 4]);
    expect(courses.filter(course => course.tier === "intermediate").map(course => [course.templateId, course.difficultyLevel])).toEqual([["open-division-v2", 5], ["open-division-v2", 6], ["open-division-v2", 7], ["championship-bridge-v1", 8]]);
    expect(courses.filter(course => course.tier === "advanced").map(course => [course.templateId, course.difficultyLevel])).toEqual([["championship-bridge-v1", 9], ["championship-circuit-v2", 10], ["championship-circuit-v2", 11], ["championship-circuit-v2", 12]]);
  });

  it("maps each player-facing tier and level to the calibrated Yokaiba template", () => {
    expect(courseFor("beginner", 1)).toMatchObject({ label: "Beginner Level 1", templateId: "tournament-order-v2", difficultyLevel: 1 });
    expect(courseFor("intermediate", 3)).toMatchObject({ label: "Intermediate Level 3", templateId: "open-division-v2", difficultyLevel: 7 });
    expect(courseFor("advanced", 4)).toMatchObject({ label: "Advanced Level 4", templateId: "championship-circuit-v2", difficultyLevel: 12 });
  });

  it("advances from the fourth level of a tier to the first level of the next tier", () => {
    expect(nextCourse(courseFor("beginner", 4)!)).toMatchObject({ tier: "intermediate", level: 1 });
    expect(nextCourse(courseFor("advanced", 4)!)).toBeUndefined();
  });

  it("returns the first incomplete course as the continue target", () => {
    expect(firstAvailableCourse(["beginner-1", "beginner-2"])).toMatchObject({ tier: "beginner", level: 3 });
    expect(firstAvailableCourse(["beginner-1", "beginner-2", "beginner-3", "beginner-4"])).toMatchObject({ tier: "intermediate", level: 1 });
  });

  it("keeps generator parameters behind the player-facing curriculum", () => {
    expect(puzzleParametersForCourse(courseFor("intermediate", 4)!)).toEqual({ templateId: "championship-bridge-v1", difficultyLevel: 8 });
  });

  it("summarises current-tier progress for the compact header status", () => {
    expect(courseProgressLabel(courseFor("beginner", 3)!, new Set(["beginner-1", "beginner-2"]))).toBe("Beginner · 2/4 complete");
    expect(courseProgressLabel(courseFor("advanced", 1)!, new Set(["beginner-1", "intermediate-1"]))).toBe("Advanced · 0/4 complete");
  });
});
