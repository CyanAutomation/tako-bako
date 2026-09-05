import { describe, expect, it } from "vitest";
import { DAILY_TIME_ZONE, dailySeed, dailySeedFromParts } from "./daily";

describe("daily puzzle seed", () => {
  it("uses one explicit UTC rollover for every player", () => {
    expect(DAILY_TIME_ZONE).toBe("UTC");
    expect(dailySeed(new Date("2026-08-31T23:59:59.000Z"))).toBe("daily-2026-08-31");
    expect(dailySeed(new Date("2026-09-01T00:00:00.000Z"))).toBe("daily-2026-09-01");
  });

  it("rejects an invalid Date at the module boundary", () => {
    expect(() => dailySeed(new Date(Number.NaN))).toThrow(
      new RangeError("dailySeed requires a valid Date"),
    );
  });

  it("rejects an incomplete date parts collection", () => {
    expect(() =>
      dailySeedFromParts([
        { type: "year", value: "2026" },
        { type: "literal", value: "-" },
        { type: "month", value: "08" },
      ]),
    ).toThrow("Missing date part: day");
  });
});
