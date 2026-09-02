import { describe, expect, it } from "vitest";
import { courseFor, courseProgressLabel, firstAvailableCourse, nextCourse, puzzleParametersForCourse } from "./curriculum";

describe("Puzzle Challenge curriculum", () => {
  it("maps each player-facing tier and level to the calibrated Yokaiba template", () => {
    expect(courseFor("beginner", 1)).toMatchObject({ label: "Beginner Level 1", templateId: "tournament-order-v1", difficultyLevel: 1 });
    expect(courseFor("intermediate", 3)).toMatchObject({ label: "Intermediate Level 3", templateId: "open-division-v2", difficultyLevel: 3 });
    expect(courseFor("advanced", 5)).toMatchObject({ label: "Advanced Level 5", templateId: "championship-circuit-v2", difficultyLevel: 5 });
  });

  it("advances from the fifth level of a tier to the first level of the next tier", () => {
    expect(nextCourse(courseFor("beginner", 5)!)).toMatchObject({ tier: "intermediate", level: 1 });
    expect(nextCourse(courseFor("advanced", 5)!)).toBeUndefined();
  });

  it("returns the first incomplete course as the continue target", () => {
    expect(firstAvailableCourse(["beginner-1", "beginner-2"])).toMatchObject({ tier: "beginner", level: 3 });
    expect(firstAvailableCourse(["beginner-1", "beginner-2", "beginner-3", "beginner-4", "beginner-5"])).toMatchObject({ tier: "intermediate", level: 1 });
  });

  it("keeps generator parameters behind the player-facing curriculum", () => {
    expect(puzzleParametersForCourse(courseFor("intermediate", 2)!)).toEqual({ templateId: "open-division-v2", difficultyLevel: 2 });
  });

  it("summarises current-tier progress for the compact header status", () => {
    expect(courseProgressLabel(courseFor("beginner", 3)!, new Set(["beginner-1", "beginner-2"]))).toBe("Beginner · 2/5 complete");
    expect(courseProgressLabel(courseFor("advanced", 1)!, new Set(["beginner-1", "intermediate-1"]))).toBe("Advanced · 0/5 complete");
  });
});
