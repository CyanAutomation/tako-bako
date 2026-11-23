import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { configureJevForTests, restoreStubbedGlobals, stubGlobal } from "../../test-utils.js";

import handler from "../../api/learning-recommendation.js";

const jevMetrics: unknown[][] = [];

afterEach(() => {
  restoreStubbedGlobals();
  mock.restoreAll();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.JEV_MODEL;
});

function responseRecorder() {
  const result = { statusCode: 0, body: undefined as unknown, headers: new Map<string, string>() };
  const response = {
    setHeader: mock.fn((name: string, value: string) => { result.headers.set(name.toLowerCase(), value); }),
    status: mock.fn((statusCode: number) => ({ json: mock.fn((body: unknown) => { result.statusCode = statusCode; result.body = body; }) })),
  };
  return { response, result };
}

const body = {
  puzzleToken: "signed-token",
  hintsUsed: 2,
  mistakes: 1,
  elapsedMs: 45_000,
  strategyUsageCounts: { direct_match: 2, adjacency: 1 },
};

describe("learning recommendation endpoint", () => {
  beforeEach(() => {
    jevMetrics.length = 0;
    mock.method(console, "info", (...args: Parameters<typeof console.info>) => { jevMetrics.push(args); });
  });

  it("uses one bounded Jev choice after Yokaiba accepts the signed token", async () => {
    configureJevForTests();
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = mock.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (String(input).includes("yokaiba")) return new Response(JSON.stringify({ kind: "clue" }), { status: 200 });
      const decision = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(JSON.stringify(decision).includes("signed-token"), false);
      assert.deepEqual(decision.state, {
        hints_used: 2,
        mistakes: 1,
        elapsed_ms: 45_000,
        strategy_usage_counts: { direct_match: 2, adjacency: 1 },
      });
      assert.equal(Object.keys((decision.questions as Record<string, unknown>).practice_strategy as Record<string, unknown>).length > 0, true);
      return new Response(JSON.stringify({ answers: { practice_strategy: { type: "choice", choice: "adjacency", confidence: 0.92 } } }), { status: 200 });
    });
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body } as never, response as never);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, { strategy: "adjacency" });
    assert.deepEqual(calls.map(call => call.url), [
      "https://yokaiba.scheimann.workers.dev/v1/puzzles/hint",
      "https://openrouter.ai/api/alpha/decisions",
    ]);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(jevMetrics.some(args => JSON.stringify(args).includes("learning_recommendation")), true);
  });

  it("returns a deterministic least-used strategy without a Jev key", async () => {
    const fetchMock = mock.fn();
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body } as never, response as never);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, { strategy: "elimination" });
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it("falls back when Jev returns an invalid or low-confidence choice", async () => {
    configureJevForTests();
    const fetchMock = mock.fn(async (input: string | URL | Request) => String(input).includes("yokaiba")
      ? new Response(JSON.stringify({ kind: "clue" }), { status: 200 })
      : new Response(JSON.stringify({ answers: { practice_strategy: { type: "choice", choice: "invented", confidence: 1 } } }), { status: 200 }));
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body } as never, response as never);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, { strategy: "elimination" });
    assert.equal(fetchMock.mock.callCount(), 2);
  });

  it("rejects malformed summaries before contacting either service", async () => {
    configureJevForTests();
    const fetchMock = mock.fn();
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { ...body, mistakes: 101 } } as never, response as never);

    assert.equal(result.statusCode, 400);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it("does not ask Jev to make a decision for a token rejected by Yokaiba", async () => {
    configureJevForTests();
    const calls: string[] = [];
    const fetchMock = mock.fn(async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response("invalid token", { status: 401 });
    });
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body } as never, response as never);

    assert.equal(result.statusCode, 401);
    assert.deepEqual(calls, ["https://yokaiba.scheimann.workers.dev/v1/puzzles/hint"]);
  });
});
