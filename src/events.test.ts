import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { clampElapsedMs } from "./events";

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
