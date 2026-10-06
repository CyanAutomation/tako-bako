import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isValidSeed, parseDifficultyLevel } from "./puzzle-input";

describe("puzzle seed validation", () => {
  it("[TB-INPUT-01] accepts the smallest and largest allowed codes", () => {
    assert.strictEqual(isValidSeed("a"), true);
    assert.strictEqual(isValidSeed("-".repeat(128)), true);
  });

  it("[TB-INPUT-01] rejects codes outside the charset or length range", () => {
    assert.strictEqual(isValidSeed("not safe"), false);
    assert.strictEqual(isValidSeed(""), false);
    assert.strictEqual(isValidSeed("a".repeat(129)), false);
    assert.strictEqual(isValidSeed("seed_underscore"), false);
  });
});

describe("puzzle difficulty parsing", () => {
  it("[TB-INPUT-01] accepts difficulty levels 1 and 12", () => {
    assert.strictEqual(parseDifficultyLevel("1"), 1);
    assert.strictEqual(parseDifficultyLevel("12"), 12);
  });

  it("[TB-INPUT-01] rejects difficulty levels 0 and 13", () => {
    assert.strictEqual(parseDifficultyLevel("0"), undefined);
    assert.strictEqual(parseDifficultyLevel("13"), undefined);
  });
});
