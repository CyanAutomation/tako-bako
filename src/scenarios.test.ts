import { describe, expect, it } from "vitest";
import { scenarioIdFromUrl, scenarios } from "./scenarios";

describe("public puzzle scenarios", () => {
  it("uses the template identifiers served by the current Yokaiba catalog", () => {
    expect(scenarios.map(scenario => scenario.id)).toEqual([
      "tournament-order-v1",
      "open-division-v2",
      "championship-circuit-v2",
    ]);
  });

  it("keeps existing shared links for expanded scenarios playable after the catalog upgrade", () => {
    expect(scenarioIdFromUrl("open-division-v1")).toBe("open-division-v2");
    expect(scenarioIdFromUrl("championship-circuit-v1")).toBe("championship-circuit-v2");
    expect(scenarioIdFromUrl("not-a-scenario")).toBeUndefined();
  });
});
