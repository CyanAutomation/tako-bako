import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DAILY_TIME_ZONE, dailySeed } from "./daily";

describe("daily puzzle seed", () => {
  it("[TB-DAILY-01] uses one explicit UTC rollover for every player", () => {
    assert.strictEqual(DAILY_TIME_ZONE, "UTC");
    assert.strictEqual(dailySeed(new Date("2026-08-31T23:59:59.000Z")), "daily-2026-08-31");
    assert.strictEqual(dailySeed(new Date("2026-09-01T00:00:00.000Z")), "daily-2026-09-01");
  });

  it("throws a RangeError when given an invalid Date", () => {
    assert.throws(() => dailySeed(new Date(Number.NaN)), new RangeError("dailySeed requires a valid Date"));
  });
});
