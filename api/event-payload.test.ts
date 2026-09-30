import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseEventPayload } from "./event-payload.js";

describe("parseEventPayload", () => {
  it("keeps only allowlisted outcome fields", () => {
    assert.deepStrictEqual(parseEventPayload({
      event: "puzzle_completed", templateId: "tournament-order-v2", requestedDifficultyLevel: 1,
      assessedDifficultyLevel: 12, clueCount: 64, elapsedMs: 86_400_000, hintsUsed: 100,
      mistakes: 0, smartMarkingEnabled: true, seed: "must-not-forward",
    }), {
      event: "puzzle_completed", templateId: "tournament-order-v2", requestedDifficultyLevel: 1,
      assessedDifficultyLevel: 12, clueCount: 64, elapsedMs: 86_400_000, hintsUsed: 100,
      mistakes: 0, smartMarkingEnabled: true,
    });
  });

  it("rejects invalid identity and field boundaries", () => {
    const valid = { event: "puzzle_started", templateId: "tournament-order-v1" };
    const invalid: unknown[] = [
      null,
      [],
      { ...valid, event: "unknown" },
      { ...valid, templateId: "private-template" },
      { ...valid, requestedDifficultyLevel: 0 },
      { ...valid, elapsedMs: 86_400_001 },
      { ...valid, mistakes: 1.5 },
      { ...valid, smartMarkingEnabled: "yes" },
    ];

    for (const value of invalid) assert.strictEqual(parseEventPayload(value), undefined);
  });
});
