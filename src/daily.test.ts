import { afterEach, describe, expect, it, vi } from "vitest";
import { DAILY_TIME_ZONE, dailySeed } from "./daily";

describe("daily puzzle seed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses one explicit UTC rollover for every player", () => {
    expect(DAILY_TIME_ZONE).toBe("UTC");
    expect(dailySeed(new Date("2026-08-31T23:59:59.000Z"))).toBe("daily-2026-08-31");
    expect(dailySeed(new Date("2026-09-01T00:00:00.000Z"))).toBe("daily-2026-09-01");
  });

  it("rejects a malformed date instead of returning an undefined seed part", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([
      { type: "year", value: "2026" },
      { type: "literal", value: "-" },
      { type: "month", value: "08" },
    ]);

    expect(() => dailySeed(new Date("2026-08-31T00:00:00.000Z"))).toThrow(
      "Missing date part: day",
    );
  });
});
