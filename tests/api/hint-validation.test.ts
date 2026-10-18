import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isBoundedText, isRecord, MAX_PUZZLE_TOKEN_LENGTH } from "../../api/hint-validation.js";

describe("MAX_PUZZLE_TOKEN_LENGTH boundary", () => {
  it("accepts a non-empty string at the shared puzzle-token size limit", () => {
    assert.equal(isBoundedText("x".repeat(MAX_PUZZLE_TOKEN_LENGTH), MAX_PUZZLE_TOKEN_LENGTH), true);
    assert.equal(MAX_PUZZLE_TOKEN_LENGTH, 16_384);
  });

  it("rejects an oversized puzzle token at the limit plus one", () => {
    assert.equal(isBoundedText("x".repeat(MAX_PUZZLE_TOKEN_LENGTH + 1), MAX_PUZZLE_TOKEN_LENGTH), false);
  });

  it("rejects empty strings and non-string tokens", () => {
    assert.equal(isBoundedText("", MAX_PUZZLE_TOKEN_LENGTH), false);
    assert.equal(isBoundedText(7, MAX_PUZZLE_TOKEN_LENGTH), false);
    assert.equal(isBoundedText(null, MAX_PUZZLE_TOKEN_LENGTH), false);
  });

  it("isRecord accepts plain objects and rejects arrays", () => {
    assert.equal(isRecord({ puzzleToken: "x" }), true);
    assert.equal(isRecord(["x"]), false);
  });
});
