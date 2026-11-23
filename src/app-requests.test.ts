import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestLearningRecommendation } from "./app-requests";

describe("learning recommendation request", () => {
  it("sends only the signed token and bounded aggregate summary, then parses a strategy ID", async () => {
    const originalFetch = globalThis.fetch;
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ strategy: "adjacency", title: "untrusted title" }), { status: 200 });
    }) as typeof fetch;
    try {
      const recommendation = await requestLearningRecommendation({
        puzzleToken: "signed-token",
        hintsUsed: 2,
        mistakes: 1,
        elapsedMs: 45_000,
        strategyUsageCounts: { direct_match: 2 },
      }, new AbortController().signal, () => true);

      assert.deepEqual(recommendation, {
        strategy: "adjacency",
        title: "A strategy to carry forward",
        focus: "Neighbours",
        body: "Uses next-to or adjacent positions. Look for this kind of reasoning in your next puzzle.",
      });
      assert.equal(calls[0]?.url, "/api/learning-recommendation");
      assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
        puzzleToken: "signed-token",
        hintsUsed: 2,
        mistakes: 1,
        elapsedMs: 45_000,
        strategyUsageCounts: { direct_match: 2 },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("drops a response when the active puzzle changes while the request is in flight", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ strategy: "adjacency" }), { status: 200 })) as typeof fetch;
    try {
      const recommendation = await requestLearningRecommendation({
        puzzleToken: "signed-token",
        hintsUsed: 0,
        mistakes: 0,
        elapsedMs: 0,
        strategyUsageCounts: {},
      }, new AbortController().signal, () => false);
      assert.equal(recommendation, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
