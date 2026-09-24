import { describe, expect, it } from "vitest";
import { DIFFICULTY_LEVEL_PATTERN, isValidSeed, parseDifficultyLevel } from "./puzzle-input";
import { parseSharedPuzzleInput } from "./shared-puzzle";

describe("SEED_PATTERN boundaries", () => {
  it("accepts the smallest and largest allowed codes", () => {
    expect(isValidSeed("a")).toBe(true);
    expect(isValidSeed("-".repeat(128))).toBe(true);
  });

  it("rejects codes outside the charset or length range", () => {
    expect(isValidSeed("not safe")).toBe(false);
    expect(isValidSeed("")).toBe(false);
    expect(isValidSeed("a".repeat(129))).toBe(false);
    expect(isValidSeed("seed_underscore")).toBe(false);
  });
});

describe("DIFFICULTY_LEVEL_PATTERN boundaries", () => {
  it("accepts difficulty levels 1 and 12", () => {
    expect(DIFFICULTY_LEVEL_PATTERN.test("1")).toBe(true);
    expect(DIFFICULTY_LEVEL_PATTERN.test("12")).toBe(true);
    expect(parseDifficultyLevel("1")).toBe(1);
    expect(parseDifficultyLevel("12")).toBe(12);
  });

  it("rejects difficulty levels 0 and 13", () => {
    expect(DIFFICULTY_LEVEL_PATTERN.test("0")).toBe(false);
    expect(DIFFICULTY_LEVEL_PATTERN.test("13")).toBe(false);
    expect(parseDifficultyLevel("0")).toBeUndefined();
    expect(parseDifficultyLevel("13")).toBeUndefined();
  });
});

describe("consuming layers accept identical input", () => {
  it("accepts the same seed boundaries at the player layer", () => {
    expect(parseSharedPuzzleInput("a")).toEqual({ seed: "a" });
    expect(parseSharedPuzzleInput("-".repeat(128))).toEqual({ seed: "-".repeat(128) });
    expect(parseSharedPuzzleInput("not safe")).toBeUndefined();
    expect(parseSharedPuzzleInput("a".repeat(129))).toBeUndefined();
  });

  it("uses the same difficulty regex the API validates with", () => {
    expect(parseDifficultyLevel("1")).toBe(1);
    expect(parseDifficultyLevel("12")).toBe(12);
    expect(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=parity-seed&difficulty=0")).toEqual({
      seed: "parity-seed",
    });
    expect(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=parity-seed&difficulty=13")).toEqual({
      seed: "parity-seed",
    });
    expect(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=parity-seed&difficulty=12")).toEqual({
      seed: "parity-seed",
      difficultyLevel: 12,
    });
  });
});