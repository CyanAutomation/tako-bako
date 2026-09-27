import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { yokaibaGenerateParams, YOKAIBA_GENERATE_URL, YOKAIBA_ORIGIN } from "./yokaiba";

describe("yokaibaGenerateParams", () => {
  it("serializes templateId and seed before any optional parameters", () => {
    const parameters = yokaibaGenerateParams("tournament-order-v2", "champion-day");
    assert.strictEqual(parameters.toString(), "templateId=tournament-order-v2&seed=champion-day");
  });

  it("appends difficultyLevel and allowSeedFallback when a difficulty is present", () => {
    const parameters = yokaibaGenerateParams("tournament-order-v2", "champion-day", "8");
    assert.strictEqual(parameters.toString(), "templateId=tournament-order-v2&seed=champion-day&difficultyLevel=8&allowSeedFallback=true");
  });

  it("skips allowSeedFallback when no difficulty is given", () => {
    const parameters = yokaibaGenerateParams("open-division-v2", "seed", undefined);
    assert.strictEqual(parameters.has("allowSeedFallback"), false);
  });
});

describe("yokaiba endpoints", () => {
  it("derives the generate URL from the shared origin", () => {
    assert.strictEqual(YOKAIBA_GENERATE_URL, `${YOKAIBA_ORIGIN}/v1/puzzles/generate`);
  });
});