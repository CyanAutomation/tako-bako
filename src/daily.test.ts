import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DAILY_TIME_ZONE, dailySeed, dailySeedFromParts } from "./daily";

describe("daily puzzle seed", () => {
  it("uses one explicit UTC rollover for every player", () => {
    assert.strictEqual(DAILY_TIME_ZONE, "UTC");
    assert.strictEqual(dailySeed(new Date("2026-08-31T23:59:59.000Z")), "daily-2026-08-31");
    assert.strictEqual(dailySeed(new Date("2026-09-01T00:00:00.000Z")), "daily-2026-09-01");
  });

  it("rejects an invalid Date at the module boundary", () => {
    assert.throws(() => dailySeed(new Date(Number.NaN)), new RangeError("dailySeed requires a valid Date"));
  });

  it("rejects an incomplete date parts collection", () => {
    assert.throws(() =>
      dailySeedFromParts([
        { type: "year", value: "2026" },
        { type: "literal", value: "-" },
        { type: "month", value: "08" },
      ]), new RegExp("Missing date part: day"));
  });
});
