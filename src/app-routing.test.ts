import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { firstAvailableCourse } from "./curriculum";
import { routeFromUrl, updatedPuzzleUrl } from "./app-routing";

describe("app route parsing", () => {
  it("starts a new player on the first available challenge course", () => {
    const route = routeFromUrl(new URL("https://example.test/"), []);

    assert.deepStrictEqual(route, {
      seed: undefined,
      playMode: "challenge",
      activeCourse: firstAvailableCourse([]),
      difficultyLevel: 1,
      templateId: "tournament-order-v2",
    });
  });

  it("loads a shared puzzle with bounded route parameters and legacy scenario IDs", () => {
    const route = routeFromUrl(new URL("https://example.test/?seed=shared-1&template=open-division-v1&difficulty=12"), []);

    assert.strictEqual(route.seed, "shared-1");
    assert.strictEqual(route.playMode, "shared");
    assert.strictEqual(route.templateId, "open-division-v2");
    assert.strictEqual(route.difficultyLevel, 12);
  });

  it("ignores invalid seed and difficulty values", () => {
    const route = routeFromUrl(new URL(`https://example.test/?seed=${"x".repeat(129)}&mode=shared&difficulty=13`), []);

    assert.strictEqual(route.seed, undefined);
    assert.strictEqual(route.playMode, "shared");
    assert.strictEqual(route.difficultyLevel, undefined);
  });
});

describe("puzzle route updates", () => {
  it("clears shared puzzle parameters when starting a challenge course", () => {
    const url = updatedPuzzleUrl(
      "https://example.test/?seed=old&mode=shared&template=open-division-v2&difficulty=5",
      "replace",
      "challenge",
      "tournament-order-v2",
      1,
      firstAvailableCourse([]),
      "new-seed",
    );

    assert.strictEqual(url?.searchParams.get("seed"), "new-seed");
    assert.strictEqual(url?.searchParams.get("mode"), "challenge");
    assert.strictEqual(url?.searchParams.get("tier"), "beginner");
    assert.strictEqual(url?.searchParams.get("level"), "1");
    assert.strictEqual(url?.searchParams.has("template"), false);
    assert.strictEqual(url?.searchParams.has("difficulty"), false);
  });
});
