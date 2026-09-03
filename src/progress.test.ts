import { describe, expect, it } from "vitest";
import { completeCourse, emptyProgress, isCourseUnlocked, parseProgress, resetProgress, shouldAdvanceProgress } from "./progress";

describe("Puzzle Challenge progress", () => {
  it("starts with Beginner Level 1 as the only available course", () => {
    const progress = emptyProgress();
    expect(isCourseUnlocked(progress, "beginner-1")).toBe(true);
    expect(isCourseUnlocked(progress, "beginner-2")).toBe(false);
  });

  it("unlocks exactly the next course when the current one is completed", () => {
    const progress = completeCourse(emptyProgress(), "beginner-1");
    expect(progress.completed).toEqual(["beginner-1"]);
    expect(isCourseUnlocked(progress, "beginner-2")).toBe(true);
    expect(isCourseUnlocked(progress, "beginner-3")).toBe(false);
  });

  it("is idempotent and ignores malformed stored values", () => {
    const complete = completeCourse(completeCourse(emptyProgress(), "beginner-1"), "beginner-1");
    expect(complete.completed).toEqual(["beginner-1"]);
    expect(parseProgress('{"version":1,"completed":["beginner-1","not-a-course"]}')).toEqual({ version: 1, completed: ["beginner-1"] });
    expect(parseProgress("not json")).toEqual(emptyProgress());
  });

  it("resets only Puzzle Challenge completion back to the first level", () => {
    expect(resetProgress()).toEqual(emptyProgress());
    expect(isCourseUnlocked(resetProgress(), "beginner-1")).toBe(true);
    expect(isCourseUnlocked(resetProgress(), "beginner-2")).toBe(false);
  });

  it("only awards course progression in Puzzle Challenge mode", () => {
    expect(shouldAdvanceProgress("challenge")).toBe(true);
    expect(shouldAdvanceProgress("shared")).toBe(false);
    expect(shouldAdvanceProgress("daily")).toBe(false);
  });
});
