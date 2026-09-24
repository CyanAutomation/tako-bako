import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { scenarioIdFromUrl, scenarios } from "./scenarios";

describe("public puzzle scenarios", () => {
  it("uses the template identifiers served by the current Yokaiba catalog", () => {
    assert.deepStrictEqual(scenarios.map(scenario => scenario.id), [
      "tournament-order-v2",
      "tournament-order-v1",
      "open-division-v2",
      "championship-bridge-v1",
      "championship-circuit-v2",
    ]);
  });

  it("keeps existing shared links for expanded scenarios playable after the catalog upgrade", () => {
    assert.strictEqual(scenarioIdFromUrl("open-division-v1"), "open-division-v2");
    assert.strictEqual(scenarioIdFromUrl("championship-circuit-v1"), "championship-circuit-v2");
    assert.strictEqual(scenarioIdFromUrl("not-a-scenario"), undefined);
  });
});
