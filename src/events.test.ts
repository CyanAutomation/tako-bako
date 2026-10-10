import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { clampElapsedMs } from "./events";

describe("clampElapsedMs", () => {
  it("[TB-EVENT-01] omits elapsed time until a puzzle has started", () => {
    assert.strictEqual(clampElapsedMs(undefined, 1_000), undefined);
  });

  it("[TB-EVENT-01] measures elapsed time from any valid start timestamp", () => {
    assert.strictEqual(clampElapsedMs(0, 1_000), 1_000);
    assert.strictEqual(clampElapsedMs(1_000, 61_000), 60_000);
  });

  it("[TB-EVENT-01] bounds elapsed time to zero through 24 hours", () => {
    assert.strictEqual(clampElapsedMs(1_000, 900), 0);
    assert.strictEqual(clampElapsedMs(1_000, 100_000_000), 86_400_000);
  });
});
