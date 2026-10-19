import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { loadConfigFromFile } from "vite";

import { yokaibaGenerateParams, YOKAIBA_ORIGIN } from "./yokaiba";

describe("Yokaiba generation parameters", () => {
  it("[TB-URL-01] sends the selected template and seed without requesting fallback", () => {
    const parameters = yokaibaGenerateParams("tournament-order-v2", "champion-day");

    assert.strictEqual(parameters.get("templateId"), "tournament-order-v2");
    assert.strictEqual(parameters.get("seed"), "champion-day");
    assert.strictEqual(parameters.has("difficultyLevel"), false);
    assert.strictEqual(parameters.has("allowSeedFallback"), false);
  });

  it("[TB-URL-01] requests deterministic fallback with a selected difficulty", () => {
    const parameters = yokaibaGenerateParams("tournament-order-v2", "champion-day", "8");

    assert.strictEqual(parameters.get("templateId"), "tournament-order-v2");
    assert.strictEqual(parameters.get("seed"), "champion-day");
    assert.strictEqual(parameters.get("difficultyLevel"), "8");
    assert.strictEqual(parameters.get("allowSeedFallback"), "true");
  });

  it("forwards the model selected by the app while leaving server defaults out of generic requests", () => {
    const defaultParameters = yokaibaGenerateParams("tournament-order-v2", "shared-seed");
    const v5Parameters = yokaibaGenerateParams("tournament-order-v2", "shared-seed", "3", "v5");
    const compareParameters = yokaibaGenerateParams("tournament-order-v2", "shared-seed", undefined, "compare");
    const v4Parameters = yokaibaGenerateParams("tournament-order-v2", "shared-seed", undefined, "v4");

    assert.equal(defaultParameters.has("difficultyModel"), false);
    assert.equal(v5Parameters.get("difficultyModel"), "v5");
    assert.equal(v5Parameters.get("allowSeedFallback"), "true");
    assert.equal(compareParameters.get("difficultyModel"), "compare");
    assert.equal(v4Parameters.get("difficultyModel"), "v4");
  });

  it("[TB-URL-02] rewrites development puzzle requests with their selected settings", async () => {
    const loadedConfig = await loadConfigFromFile({ command: "serve", mode: "test" }, resolve("vite.config.ts"));
    assert.ok(loadedConfig);
    const proxy = loadedConfig.config.server?.proxy?.["/api/puzzle"];
    assert.ok(proxy && typeof proxy !== "string");
    assert.strictEqual(proxy.target, YOKAIBA_ORIGIN);
    assert.ok(proxy.rewrite);

    const rewritten = proxy.rewrite("/api/puzzle?seed=shared-seed&templateId=championship-bridge-v1&difficultyLevel=8");
    const url = new URL(rewritten, YOKAIBA_ORIGIN);
    assert.strictEqual(url.pathname, "/v1/puzzles/generate");
    assert.strictEqual(url.searchParams.get("seed"), "shared-seed");
    assert.strictEqual(url.searchParams.get("templateId"), "championship-bridge-v1");
    assert.strictEqual(url.searchParams.get("difficultyLevel"), "8");
    assert.strictEqual(url.searchParams.get("allowSeedFallback"), "true");
  });
});
