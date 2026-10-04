import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildGameEventPayload, clampElapsedMs, type GameEventPayload } from "./events";

const basePayload: GameEventPayload = {
  schemaVersion: 1,
  event: "puzzle_completed",
  templateId: "tournament-order-v1",
  requestedDifficultyLevel: 3,
  assessedDifficultyLevel: 2,
  clueCount: 5,
  elapsedMs: 60_000,
  hintsUsed: 1,
  mistakes: 0,
};

describe("clampElapsedMs", () => {
  it("returns undefined when no start time is known", () => {
    assert.strictEqual(clampElapsedMs(0), undefined);
  });

  it("returns the elapsed time for short sessions", () => {
    assert.strictEqual(clampElapsedMs(1_000, 61_000), 60_000);
  });

  it("clamps sessions past 24 hours", () => {
    assert.strictEqual(clampElapsedMs(1_000, 100_000_000), 86_400_000);
  });
});

describe("game event payload", () => {
  it("serializes exact v1 field names with no extra keys", () => {
    const serialized = JSON.stringify(buildGameEventPayload(basePayload));
    assert.deepStrictEqual(JSON.parse(serialized), {
      schemaVersion: 1,
      event: "puzzle_completed",
      templateId: "tournament-order-v1",
      requestedDifficultyLevel: 3,
      assessedDifficultyLevel: 2,
      clueCount: 5,
      elapsedMs: 60_000,
      hintsUsed: 1,
      mistakes: 0,
    });
  });

  it("omits undefined elapsedMs and omits smartMarkingEnabled when absent", () => {
    const serialized = JSON.stringify(buildGameEventPayload({ ...basePayload, elapsedMs: undefined }));
    assert.deepStrictEqual(JSON.parse(serialized), {
      schemaVersion: 1,
      event: "puzzle_completed",
      templateId: "tournament-order-v1",
      requestedDifficultyLevel: 3,
      assessedDifficultyLevel: 2,
      clueCount: 5,
      hintsUsed: 1,
      mistakes: 0,
    });
    assert.ok(!Object.hasOwn(JSON.parse(serialized), "smartMarkingEnabled"));
  });

  it("includes smartMarkingEnabled only when passed", () => {
    const serialized = JSON.stringify(buildGameEventPayload({ ...basePayload, smartMarkingEnabled: true }));
    assert.strictEqual(JSON.parse(serialized).smartMarkingEnabled, true);
  });
});