import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { derivePlayerStateFeatures, hintStrengthForProgress, hintStrengthRank, parsePlayerStateAssessment, PLAYER_PUZZLE_STATES, policyForPlayerState, serializePlayerStateFeatures, type PlayerStateFeatures } from "./player-state";

function features(overrides: Partial<PlayerStateFeatures> = {}): PlayerStateFeatures {
  return {
    affirmativeCount: 0,
    negativeCount: 0,
    totalMatches: 16,
    readinessPercent: 0,
    hintsUsed: 0,
    mistakes: 0,
    elapsedMs: 0,
    usedClueCount: 0,
    unusedClueCount: 4,
    usedStrategyCounts: {},
    smartMarking: false,
    ...overrides,
  };
}

describe("player puzzle state", () => {
  it("accepts only a typed player-state choice with sufficient confidence", () => {
    assert.deepStrictEqual(parsePlayerStateAssessment({ answers: { player_state: { type: "choice", choice: "stalled", confidence: 0.9 } } }), { state: "stalled", confidence: 0.9 });
    assert.deepStrictEqual(parsePlayerStateAssessment({ answers: { player_state: { type: "choice", choice: "progressing", confidence: 0.75 } } }), { state: "progressing", confidence: 0.75 });
    for (const answer of [
      { type: "text", choice: "stalled", confidence: 0.9 },
      { type: "choice", choice: "invented", confidence: 0.9 },
      { type: "choice", choice: "stalled", confidence: 0.74 },
      { type: "choice", choice: "stalled", confidence: 1.1 },
      { type: "choice", choice: "stalled", confidence: Number.NaN },
      { type: "choice", choice: "stalled", confidence: "0.9" },
      { type: "choice", choice: "stalled" },
    ]) {
      assert.strictEqual(parsePlayerStateAssessment({ answers: { player_state: answer } }), undefined);
    }
    for (const malformed of [null, [], {}, { answers: [] }, { answers: {} }, { answers: { player_state: [] } }]) {
      assert.strictEqual(parsePlayerStateAssessment(malformed), undefined);
    }
    for (const state of PLAYER_PUZZLE_STATES) {
      assert.strictEqual(parsePlayerStateAssessment({ answers: { player_state: { type: "choice", choice: state, confidence: 0.9 } } })?.state, state);
    }
  });

  it("derives compact counts and strategy totals in code", () => {
    const derived = derivePlayerStateFeatures({
      board: [{ mark: "yes" }, { mark: "no" }, { mark: "no" }],
      totalMatches: 4,
      hintsUsed: 2,
      mistakes: 1,
      elapsedMs: 30_000,
      clues: [{ id: "a", strategy: "adjacency" }, { id: "b", strategy: "order" }, { id: "c", strategy: "adjacency" }],
      usedClueIds: new Set(["a", "c", "unknown"]),
      smartMarking: true,
    });

    assert.deepStrictEqual(derived, {
      affirmativeCount: 1,
      negativeCount: 2,
      totalMatches: 4,
      readinessPercent: 25,
      hintsUsed: 2,
      mistakes: 1,
      elapsedMs: 30_000,
      usedClueCount: 2,
      unusedClueCount: 1,
      usedStrategyCounts: { adjacency: 2 },
      smartMarking: true,
    });
    assert.deepStrictEqual(serializePlayerStateFeatures(derived).used_strategy_counts, { adjacency: 2 });

    const fullReadiness = derivePlayerStateFeatures({
      board: Array.from({ length: 5 }, () => ({ mark: "yes" as const })),
      totalMatches: 4,
      hintsUsed: 0,
      mistakes: 0,
      elapsedMs: 0,
      clues: [{ id: "known" }],
      usedClueIds: new Set(["missing"]),
      smartMarking: false,
    });
    assert.strictEqual(fullReadiness.readinessPercent, 100);
    assert.strictEqual(fullReadiness.usedClueCount, 0);
    assert.strictEqual(fullReadiness.unusedClueCount, 1);
  });

  it("preserves the existing progress thresholds for all hint strengths", () => {
    assert.strictEqual(hintStrengthForProgress(0, 8), "clue");
    assert.strictEqual(hintStrengthForProgress(1, 8), "elimination");
    assert.strictEqual(hintStrengthForProgress(3, 8), "elimination");
    assert.strictEqual(hintStrengthForProgress(4, 8), "placement");
    assert.strictEqual(hintStrengthForProgress(8, 8), "placement");
  });

  it("keeps the first requested hint at progress-based strength and caps later escalation", () => {
    assert.deepStrictEqual(policyForPlayerState("ready_for_stronger_hint", features()), {
      hintKind: "clue",
      maxHintStrength: "clue",
      preferredCandidateType: "clue",
    });

    const repeatedNoProgress = features({ hintsUsed: 1 });
    assert.deepStrictEqual(policyForPlayerState("stalled", repeatedNoProgress), {
      hintKind: "elimination",
      maxHintStrength: "elimination",
      preferredCandidateType: "elimination",
    });

    const repeatedEarlyProgress = features({ affirmativeCount: 2, readinessPercent: 13, hintsUsed: 1 });
    assert.deepStrictEqual(policyForPlayerState("ready_for_stronger_hint", repeatedEarlyProgress), {
      hintKind: "placement",
      maxHintStrength: "placement",
      preferredCandidateType: "placement",
    });
  });

  it("maps wrong-turn and strategy-nudge states to less revealing assistance", () => {
    const noProgress = features({ hintsUsed: 0 });
    assert.deepStrictEqual(policyForPlayerState("likely_wrong_turn", noProgress), { hintKind: "clue", maxHintStrength: "clue" });
    assert.deepStrictEqual(policyForPlayerState("needs_strategy_nudge", features({ affirmativeCount: 8, readinessPercent: 50 })), {
      hintKind: "clue",
      maxHintStrength: "placement",
      preferredCandidateType: "clue",
    });
  });

  it("never exceeds the deterministic strength ceiling for any accepted state", () => {
    for (const state of PLAYER_PUZZLE_STATES) {
      for (const hintsUsed of [0, 1, 2, 100]) {
        for (const affirmativeCount of [0, 1, 7, 8, 16]) {
          const current = features({ affirmativeCount, hintsUsed });
          const baseStrength = hintStrengthForProgress(affirmativeCount, current.totalMatches);
          const policy = policyForPlayerState(state, current);
          const maxAllowedRank = hintsUsed === 0
            ? hintStrengthRank(baseStrength)
            : Math.min(2, hintStrengthRank(baseStrength) + 1);

          assert.ok(hintStrengthRank(policy.hintKind) <= maxAllowedRank, `${state} exceeded the hint ceiling at ${affirmativeCount} matches and ${hintsUsed} hints`);
          assert.ok(hintStrengthRank(policy.maxHintStrength) <= maxAllowedRank);
          if (hintsUsed === 0) assert.strictEqual(policy.maxHintStrength, baseStrength);
        }
      }
    }
  });

  it("evaluates synthetic labeled states through typed parsing and deterministic policy", () => {
    const scenarios = [
      { state: "progressing", features: features({ affirmativeCount: 4, readinessPercent: 25 }), expectedHint: "elimination" },
      { state: "stalled", features: features({ hintsUsed: 1, elapsedMs: 180_000 }), expectedHint: "elimination" },
      { state: "likely_wrong_turn", features: features({ affirmativeCount: 10, readinessPercent: 63, mistakes: 1 }), expectedHint: "elimination" },
      { state: "needs_strategy_nudge", features: features({ hintsUsed: 1, usedClueCount: 3 }), expectedHint: "clue" },
      { state: "ready_for_stronger_hint", features: features({ affirmativeCount: 3, readinessPercent: 19, hintsUsed: 2 }), expectedHint: "placement" },
    ] as const;

    for (const scenario of scenarios) {
      const assessment = parsePlayerStateAssessment({ answers: { player_state: { type: "choice", choice: scenario.state, confidence: 0.88 } } });
      assert.strictEqual(assessment?.state, scenario.state);
      assert.strictEqual(policyForPlayerState(assessment!.state, scenario.features).hintKind, scenario.expectedHint);
    }
  });
});
