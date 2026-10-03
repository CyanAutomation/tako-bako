import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseEventPayload } from "../../server/event-payload.js";

describe("parseEventPayload", () => {
  it("keeps only allowlisted outcome fields", () => {
    assert.deepStrictEqual(parseEventPayload({
      event: "puzzle_completed", templateId: "tournament-order-v2", requestedDifficultyLevel: 1,
      assessedDifficultyLevel: 12, clueCount: 64, elapsedMs: 86_400_000, hintsUsed: 100,
      mistakes: 0, smartMarkingEnabled: true, seed: "must-not-forward",
    }), {
      schemaVersion: 0,
      event: "puzzle_completed", templateId: "tournament-order-v2", requestedDifficultyLevel: 1,
      assessedDifficultyLevel: 12, clueCount: 64, elapsedMs: 86_400_000, hintsUsed: 100,
      mistakes: 0, smartMarkingEnabled: true,
    });
  });

  it("requires the version 1 counters needed to interpret each outcome", () => {
    const valid = { schemaVersion: 1, event: "puzzle_completed", templateId: "tournament-order-v2", elapsedMs: 1000, hintsUsed: 2, mistakes: 1 };
    assert.deepStrictEqual(parseEventPayload(valid), valid);
    assert.strictEqual(parseEventPayload({ schemaVersion: 1, event: "puzzle_completed", templateId: "tournament-order-v2" }), undefined);
    assert.strictEqual(parseEventPayload({ schemaVersion: 1, event: "hint_used", templateId: "tournament-order-v2" }), undefined);
    assert.strictEqual(parseEventPayload({ schemaVersion: 1, event: "mistake", templateId: "tournament-order-v2" }), undefined);
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
      { ...valid, schemaVersion: 2 },
      { ...valid, schemaVersion: null },
    ];

    for (const value of invalid) assert.strictEqual(parseEventPayload(value), undefined);
  });
});
