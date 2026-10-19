import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseSharedPuzzleInput } from "./shared-puzzle";

describe("parseSharedPuzzleInput", () => {
  it("accepts a puzzle code", () => {
    assert.deepStrictEqual(parseSharedPuzzleInput("friendly-seed-42"), { seed: "friendly-seed-42" });
  });

  it("keeps old full URLs on v4 when the model was not recorded", () => {
    assert.deepStrictEqual(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=legacy-seed"), {
      seed: "legacy-seed",
      difficultyModel: "v4",
    });
  });

  it("accepts a full shared-puzzle link and keeps its puzzle settings", () => {
    assert.deepStrictEqual(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=friendly-seed-42&mode=shared&template=championship-circuit-v2&difficulty=10&difficultyModel=v5"), {
      seed: "friendly-seed-42",
      templateId: "championship-circuit-v2",
      difficultyLevel: 10,
      difficultyModel: "v5",
    });
  });

  it("keeps the course information from a challenge link so it can open the exact puzzle", () => {
    assert.deepStrictEqual(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=course-seed&mode=challenge&tier=intermediate&level=3"), {
      seed: "course-seed",
      difficultyModel: "v4",
      tier: "intermediate",
      level: 3,
    });
  });

  it("rejects links and codes without a safe puzzle code", () => {
    assert.strictEqual(parseSharedPuzzleInput("https://tako-bako.vercel.app/?seed=not safe"), undefined);
    assert.strictEqual(parseSharedPuzzleInput("https://example.com/no-puzzle-here"), undefined);
  });
});
