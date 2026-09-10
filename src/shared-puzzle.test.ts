import { describe, expect, it } from "vitest";
import { parseSharedPuzzleInput } from "./shared-puzzle";

describe("parseSharedPuzzleInput", () => {
  it("accepts a puzzle code", () => {
    expect(parseSharedPuzzleInput("friendly-seed-42")).toEqual({ seed: "friendly-seed-42" });
  });

  it("accepts a full shared-puzzle link and keeps its puzzle settings", () => {
    expect(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=friendly-seed-42&mode=shared&template=championship-circuit-v2&difficulty=10")).toEqual({
      seed: "friendly-seed-42",
      templateId: "championship-circuit-v2",
      difficultyLevel: 10,
    });
  });

  it("keeps the course information from a challenge link so it can open the exact puzzle", () => {
    expect(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=course-seed&mode=challenge&tier=intermediate&level=3")).toEqual({
      seed: "course-seed",
      tier: "intermediate",
      level: 3,
    });
  });

  it("rejects links and codes without a safe puzzle code", () => {
    expect(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=not safe")).toBeUndefined();
    expect(parseSharedPuzzleInput("https://example.com/no-puzzle-here")).toBeUndefined();
  });
});
