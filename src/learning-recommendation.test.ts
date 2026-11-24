import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLearningRecommendation,
  fallbackLearningStrategy,
  parseLearningRecommendationStrategy,
  strategyUsageCountsForGame,
} from "./learning-recommendation";

describe("learning recommendations", () => {
  it("chooses the least-used strategy with stable catalog-order tie breaking", () => {
    assert.equal(fallbackLearningStrategy({
      direct_match: 1,
      elimination: 1,
      adjacency: 0,
      order: 0,
    }), "adjacency");
  });

  it("builds player-facing copy from the app-owned strategy catalog", () => {
    assert.deepEqual(buildLearningRecommendation("adjacency"), {
      strategy: "adjacency",
      title: "A strategy to carry forward",
      focus: "Neighbours",
      body: "Uses next-to or adjacent positions. Look for this kind of reasoning in your next puzzle.",
    });
  });

  it("counts only strategies for clues that the player used", () => {
    assert.deepEqual(strategyUsageCountsForGame([
      { id: "one", text: "A matches North.", strategy: "direct_match" },
      { id: "two", text: "B is next to the keeper." },
      { id: "unused", text: "C is last.", strategy: "order" },
    ], { two: "adjacency" }, new Set(["one", "two"])), {
      direct_match: 1,
      adjacency: 1,
    });
  });

  it("accepts only a confident Jev choice from the known strategy catalog", () => {
    assert.equal(parseLearningRecommendationStrategy({
      answers: { practice_strategy: { type: "choice", choice: "adjacency", confidence: 0.9 } },
    }), "adjacency");
    assert.equal(parseLearningRecommendationStrategy({
      answers: { practice_strategy: { type: "choice", choice: "adjacency", confidence: 0.5 } },
    }), undefined);
    assert.equal(parseLearningRecommendationStrategy({
      answers: { practice_strategy: { type: "text", text: "free-form model copy", confidence: 1 } },
    }), undefined);
    assert.equal(parseLearningRecommendationStrategy({
      answers: { practice_strategy: { type: "choice", choice: "invented_strategy", confidence: 1 } },
    }), undefined);
  });
});
