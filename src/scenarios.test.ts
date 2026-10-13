import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { scenarioIdFromUrl, scenarios } from "./scenarios";

describe("public puzzle scenarios", () => {
  it("[TB-SCENARIO-01] exposes the supported template identifiers", () => {
    assert.deepStrictEqual(scenarios.map(scenario => scenario.id), [
      "tournament-order-v2",
      "tournament-order-v1",
      "open-division-v2",
      "championship-bridge-v1",
      "championship-circuit-v2",
    ]);
  });

  it("[TB-SCENARIO-01] resolves older shared links to supported scenarios", () => {
    assert.strictEqual(scenarioIdFromUrl("open-division-v1"), "open-division-v2");
    assert.strictEqual(scenarioIdFromUrl("championship-circuit-v1"), "championship-circuit-v2");
    assert.strictEqual(scenarioIdFromUrl("not-a-scenario"), undefined);
  });
});
