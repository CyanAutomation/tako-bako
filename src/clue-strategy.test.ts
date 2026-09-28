import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { clueStrategyLabel, parseClueStrategyResults, strategyForConstraintKind } from "./clue-strategy";

describe("clue strategies", () => {
  it("maps known solver constraint kinds to stable strategy labels", () => {
    assert.strictEqual(strategyForConstraintKind("matches"), "direct_match");
    assert.strictEqual(strategyForConstraintKind("distance"), "distance");
    assert.strictEqual(strategyForConstraintKind("Adjacent"), "adjacency");
    assert.strictEqual(strategyForConstraintKind("future-kind"), undefined);
    assert.strictEqual(clueStrategyLabel("direct_match"), "Direct match");
  });

  it("accepts only requested, recognized, sufficiently confident model labels", () => {
    const labels = parseClueStrategyResults({ strategies: [
      { clueId: "known", strategy: "adjacency", confidence: 0.91 },
      { clueId: "low", strategy: "distance", confidence: 0.62 },
      { clueId: "invented", strategy: "distance", confidence: 0.99 },
      { clueId: "bad-choice", strategy: "unrecognized", confidence: 1 },
      { clueId: "bad-confidence", strategy: "order", confidence: 2 },
    ] }, ["known", "low", "bad-choice", "bad-confidence"]);

    assert.deepStrictEqual([...labels], [["known", "adjacency"]]);
  });
});
