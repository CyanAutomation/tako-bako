import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DIFFICULTY_LEVEL_PATTERN, isValidSeed, parseDifficultyLevel } from "./puzzle-input";
import { parseSharedPuzzleInput } from "./shared-puzzle";

describe("SEED_PATTERN boundaries", () => {
  it("accepts the smallest and largest allowed codes", () => {
    assert.strictEqual(isValidSeed("a"), true);
    assert.strictEqual(isValidSeed("-".repeat(128)), true);
  });

  it("rejects codes outside the charset or length range", () => {
    assert.strictEqual(isValidSeed("not safe"), false);
    assert.strictEqual(isValidSeed(""), false);
    assert.strictEqual(isValidSeed("a".repeat(129)), false);
    assert.strictEqual(isValidSeed("seed_underscore"), false);
  });
});

describe("DIFFICULTY_LEVEL_PATTERN boundaries", () => {
  it("accepts difficulty levels 1 and 12", () => {
    assert.strictEqual(DIFFICULTY_LEVEL_PATTERN.test("1"), true);
    assert.strictEqual(DIFFICULTY_LEVEL_PATTERN.test("12"), true);
    assert.strictEqual(parseDifficultyLevel("1"), 1);
    assert.strictEqual(parseDifficultyLevel("12"), 12);
  });

  it("rejects difficulty levels 0 and 13", () => {
    assert.strictEqual(DIFFICULTY_LEVEL_PATTERN.test("0"), false);
    assert.strictEqual(DIFFICULTY_LEVEL_PATTERN.test("13"), false);
    assert.strictEqual(parseDifficultyLevel("0"), undefined);
    assert.strictEqual(parseDifficultyLevel("13"), undefined);
  });
});

describe("consuming layers accept identical input", () => {
  it("accepts the same seed boundaries at the player layer", () => {
    assert.deepStrictEqual(parseSharedPuzzleInput("a"), { seed: "a" });
    assert.deepStrictEqual(parseSharedPuzzleInput("-".repeat(128)), { seed: "-".repeat(128) });
    assert.strictEqual(parseSharedPuzzleInput("not safe"), undefined);
    assert.strictEqual(parseSharedPuzzleInput("a".repeat(129)), undefined);
  });

  it("uses the same difficulty regex the API validates with", () => {
    assert.strictEqual(parseDifficultyLevel("1"), 1);
    assert.strictEqual(parseDifficultyLevel("12"), 12);
    assert.deepStrictEqual(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=parity-seed&difficulty=0"), {
      seed: "parity-seed",
    });
    assert.deepStrictEqual(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=parity-seed&difficulty=13"), {
      seed: "parity-seed",
    });
    assert.deepStrictEqual(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=parity-seed&difficulty=12"), {
      seed: "parity-seed",
      difficultyLevel: 12,
    });
  });
});