import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { assertPartialMatch, rejectedMock, resolvedMock, resolvedSequenceMock, restoreStubbedGlobals, stubGlobal } from "../../test-utils.js";
import { CACHE_FRESH_LIFETIME_SECONDS, CACHE_STALE_WHILE_REVALIDATE_LIFETIME_SECONDS } from "../../src/cache-policy.js";

import handler from "../../api/puzzle.js";

afterEach(restoreStubbedGlobals);

function responseRecorder() {
  const result = { statusCode: 0, body: undefined as unknown, headers: new Map<string, string>() };
  const response = {
    setHeader: mock.fn((name: string, value: string) => { result.headers.set(name.toLowerCase(), value); }),
    status: mock.fn((statusCode: number) => {
      result.statusCode = statusCode;
      return { json: mock.fn((body: unknown) => { result.body = body; }) };
    }),
  };
  return { response, result };
}

describe("puzzle proxy", () => {
  const metricCalls: unknown[][] = [];

  beforeEach(() => {
    metricCalls.length = 0;
    mock.method(console, "info", (...args: Parameters<typeof console.info>) => { metricCalls.push(args); });
  });

  afterEach(() => {
    restoreStubbedGlobals();
    mock.restoreAll();
  });

  it("prevents caching method errors", async () => {
    const { response, result } = responseRecorder();

    await handler({ method: "PUT" } as never, response as never);

    assertPartialMatch(result, { statusCode: 405, body: { error: "Method not allowed" } });
    assert.strictEqual(result.headers.get("allow"), "GET, POST");
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
  });

  it("forwards a signed completion check to Yokaiba", async () => {
    const upstream = resolvedMock(new Response(JSON.stringify({ correct: true }), {
      status: 200, headers: { "content-type": "application/json", "x-request-id": "yokaiba-verify-123" },
    }));
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token", answer: { assignments: { club: ["Lions", "Wolves"] } } } } as never, response as never);

    assert.strictEqual(upstream.mock.callCount(), 1);
    assert.strictEqual(upstream.mock.calls[0].arguments[0], "https://yokaiba.scheimann.workers.dev/v1/puzzles/verify");
    assertPartialMatch(upstream.mock.calls[0].arguments[1], {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ puzzleToken: "signed-token", answer: { assignments: { club: ["Lions", "Wolves"] } } }),
    });
    assertPartialMatch(result, { statusCode: 200, body: { correct: true } });
    assert.strictEqual(result.headers.get("x-yokaiba-request-id"), "yokaiba-verify-123");
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
  });

  it("rejects an incomplete completion check before contacting Yokaiba", async () => {
    const upstream = mock.fn();
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token" } } as never, response as never);

    assert.strictEqual(upstream.mock.callCount() > 0, false);
    assertPartialMatch(result, { statusCode: 400, body: { error: "A complete signed answer is required" } });
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
  });

  const malformedBodies = [
    { puzzleToken: "signed-token", answer: null },
    { puzzleToken: "signed-token", answer: { assignments: [] } },
    { puzzleToken: "signed-token", answer: { assignments: { club: "Lions" } } },
    { puzzleToken: "signed-token", answer: { assignments: { club: ["Lions", 42] } } },
    { puzzleToken: "signed-token", answer: { assignments: { club: [] } } },
  ];
  for (const [caseIndex, body] of malformedBodies.entries()) {
    it(`rejects malformed completion payload ${caseIndex + 1} before contacting Yokaiba`, async () => {
      const upstream = mock.fn();
      stubGlobal("fetch", upstream);
      const { response, result } = responseRecorder();

      await handler({ method: "POST", body } as never, response as never);

      assert.strictEqual(upstream.mock.callCount() > 0, false);
      assert.strictEqual(result.statusCode, 400);
    });
  }

  const oversizedBodies = [
    { puzzleToken: "x".repeat(16_385), answer: { assignments: { club: ["Lions"] } } },
    { puzzleToken: "signed-token", answer: { assignments: Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`category-${index}`, ["value"]])) } },
    { puzzleToken: "signed-token", answer: { assignments: { club: Array.from({ length: 33 }, (_, index) => `value-${index}`) } } },
    { puzzleToken: "signed-token", answer: { assignments: { ["c".repeat(257)]: ["Lions"] } } },
    { puzzleToken: "signed-token", answer: { assignments: { club: ["v".repeat(257)] } } },
  ];
  for (const [caseIndex, body] of oversizedBodies.entries()) {
    it(`rejects completion payload beyond a size limit (${caseIndex + 1}) before contacting Yokaiba`, async () => {
      const upstream = mock.fn();
      stubGlobal("fetch", upstream);
      const { response, result } = responseRecorder();

      await handler({ method: "POST", body } as never, response as never);

      assert.strictEqual(result.statusCode, 400);
      assert.strictEqual(upstream.mock.callCount(), 0);
    });
  }

  it("forwards only validated completion fields", async () => {
    const upstream = resolvedMock(new Response(JSON.stringify({ correct: true }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    stubGlobal("fetch", upstream);
    const { response } = responseRecorder();

    await handler({
      method: "POST",
      body: {
        puzzleToken: "signed-token",
        answer: { assignments: { club: ["Lions"] }, ignored: "value" },
        ignored: "value",
      },
    } as never, response as never);

    assert.strictEqual(upstream.mock.callCount(), 1);
    const [url, init] = upstream.mock.calls[0].arguments;
    assert.strictEqual(typeof url, "string");
    assertPartialMatch(init, { body: JSON.stringify({ puzzleToken: "signed-token", answer: { assignments: { club: ["Lions"] } } }) });
  });

  it("prevents caching verification failures returned by Yokaiba", async () => {
    stubGlobal("fetch", resolvedMock(new Response("service unavailable", {
      status: 503, headers: { "content-type": "text/plain" },
    })));
    const { response, result } = responseRecorder();

    await handler({
      method: "POST",
      body: { puzzleToken: "signed-token", answer: { assignments: { club: ["Lions"] } } },
    } as never, response as never);

    assertPartialMatch(result, {
      statusCode: 502,
      body: { error: "Yokaiba could not verify this puzzle. Please try again." },
    });
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
  });

  it("caches deterministic generated puzzles at the CDN", async () => {
    stubGlobal("fetch", resolvedMock(new Response(JSON.stringify({ id: "dojo-day" }), {
      status: 200, headers: { "content-type": "application/json", "x-request-id": "yokaiba-generate-123", etag: '"yokaiba-v1-cached"' },
    })));
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "dojo-day" } } as never, response as never);

    assertPartialMatch(result, { statusCode: 200 });
    const cacheControl = result.headers.get("cache-control");
    assert.ok(cacheControl);
    assert.ok(cacheControl.includes(`s-maxage=${CACHE_FRESH_LIFETIME_SECONDS}`));
    assert.ok(cacheControl.includes(`stale-while-revalidate=${CACHE_STALE_WHILE_REVALIDATE_LIFETIME_SECONDS}`));
    assert.notStrictEqual(cacheControl, "no-store");
    const vercelCacheControl = result.headers.get("vercel-cdn-cache-control");
    assert.ok(vercelCacheControl);
    assert.ok(vercelCacheControl.includes(`s-maxage=${CACHE_FRESH_LIFETIME_SECONDS}`));
    assert.strictEqual(
      result.headers.get("x-tako-bako-cache-policy"),
      `edge-${CACHE_FRESH_LIFETIME_SECONDS / 60}m-swr-${CACHE_STALE_WHILE_REVALIDATE_LIFETIME_SECONDS / (60 * 60)}h`,
    );
    const generatedAt = Number(result.headers.get("x-tako-bako-generated-at"));
    assert.ok(Number.isSafeInteger(generatedAt));
    assert.ok(Math.abs(Date.now() - generatedAt) < 1_000);
    const serverTiming = result.headers.get("server-timing");
    assert.ok(serverTiming);
    assert.match(serverTiming, /^yokaiba;dur=\d+$/);
    assert.strictEqual(result.headers.get("x-yokaiba-request-id"), "yokaiba-generate-123");
    assert.strictEqual(result.headers.get("etag"), '"yokaiba-v1-cached"');
  });

  it("retries one transient upstream generation failure before surfacing an error", async () => {
    const upstream = resolvedSequenceMock(
      new Response("error code: 1102", { status: 503, headers: { "content-type": "text/plain" } }),
      new Response(JSON.stringify({ id: "recovered" }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "recovery-day" } } as never, response as never);

    assertPartialMatch(result, { statusCode: 200, body: { id: "recovered" } });
    assert.strictEqual(upstream.mock.callCount(), 2);
    assert.strictEqual(metricCalls[0]?.[0], "tako_bako_api_metric");
    assertPartialMatch(metricCalls[0]?.[1], { operation: "generate", outcome: "success", retryCount: 1 });
  });

  it("forwards an allowlisted expanded template to Yokaiba", async () => {
    const upstream = resolvedMock(new Response(JSON.stringify({ id: "champion" }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "champion-day", templateId: "championship-bridge-v1", difficultyLevel: "8" } } as never, response as never);

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(upstream.mock.callCount(), 1);
    assert.strictEqual(upstream.mock.calls[0].arguments[0], "https://yokaiba.scheimann.workers.dev/v1/puzzles/generate?templateId=championship-bridge-v1&seed=champion-day&difficultyLevel=8&allowSeedFallback=true");
    assert.ok(upstream.mock.calls[0].arguments[1] !== undefined && upstream.mock.calls[0].arguments[1] !== null);
  });

  it("rejects a template that is not in the public scenario allowlist", async () => {
    const upstream = mock.fn();
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "dojo-day", templateId: "unknown-v1" } } as never, response as never);

    assertPartialMatch(result, { statusCode: 400, body: { error: "An available puzzle scenario is required" } });
    assert.strictEqual(upstream.mock.callCount() > 0, false);
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
  });

  it("emits a structured success metric", async () => {
    stubGlobal("fetch", resolvedMock(new Response(JSON.stringify({ id: "dojo-day" }), { status: 200, headers: { "content-type": "application/json" } })));
    const { response } = responseRecorder();

    await handler({ method: "GET", query: { seed: "dojo-day" } } as never, response as never);

    assert.strictEqual(metricCalls[0]?.[0], "tako_bako_api_metric");
    const metricFields = metricCalls[0]?.[1] as Record<string, unknown>;
    assertPartialMatch(metricFields, { operation: "generate", outcome: "success", status: 200 });
    assert.strictEqual(typeof metricFields.durationMs, "number");
  });

  it("reports an upstream timeout distinctly and emits structured telemetry", async () => {
    stubGlobal("fetch", rejectedMock(Object.assign(new Error("timed out"), { name: "TimeoutError" })));
    const error = mock.method(console, "error", () => undefined);
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "dojo-day" } } as never, response as never);

    assertPartialMatch(result, { statusCode: 504, body: { error: "Yokaiba took too long to respond. Please try again." } });
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
    assert.strictEqual(error.mock.calls[0].arguments[0], "yokaiba_request_failed");
    assertPartialMatch(error.mock.calls[0].arguments[1], { operation: "generate", timedOut: true });
    error.mock.restore();
  });

  it("forwards rate limits enforced by Yokaiba", async () => {
    stubGlobal("fetch", resolvedMock(new Response(JSON.stringify({ error: "Slow down" }), {
      status: 429, headers: { "content-type": "application/json", "retry-after": "30", "ratelimit-limit": "60", "ratelimit-remaining": "0", "ratelimit-reset": "999" },
    })));
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "dojo-day" } } as never, response as never);

    assertPartialMatch(result, { statusCode: 429, body: { error: "Slow down" } });
    assert.strictEqual(result.headers.get("retry-after"), "30");
    assert.strictEqual(result.headers.get("ratelimit-limit"), "60");
    assert.strictEqual(result.headers.get("ratelimit-remaining"), "0");
    assert.strictEqual(result.headers.get("ratelimit-reset"), "999");
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
  });

  it("preserves Yokaiba's deterministic difficulty-unavailable response", async () => {
    stubGlobal("fetch", resolvedMock(new Response(JSON.stringify({
      error: { code: "difficulty_unavailable", message: "no matching strategy" }, availableDifficultyLevels: [1, 2, 4],
    }), {
      status: 422, headers: { "content-type": "application/json", "x-request-id": "yokaiba-difficulty-422" },
    })));
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "dojo-day", difficultyLevel: "3" } } as never, response as never);

    assertPartialMatch(result, {
      statusCode: 422,
      body: { code: "difficulty_unavailable", error: "This seed cannot produce the selected difficulty. Try another puzzle.", availableDifficultyLevels: [1, 2, 4] },
    });
    assert.strictEqual(result.headers.get("x-yokaiba-request-id"), "yokaiba-difficulty-422");
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
    assert.strictEqual(metricCalls[0]?.[0], "tako_bako_api_metric");
    assertPartialMatch(metricCalls[0]?.[1], { operation: "generate", outcome: "difficulty_unavailable", status: 422 });
  });

  it("sorts and deduplicates valid available difficulty levels", async () => {
    stubGlobal("fetch", resolvedMock(new Response(JSON.stringify({
      error: { code: "difficulty_unavailable" }, availableDifficultyLevels: [4, 2, 4],
    }), { status: 422, headers: { "content-type": "application/json" } })));
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "dojo-day", difficultyLevel: "3" } } as never, response as never);

    assert.strictEqual(result.statusCode, 422);
    assert.deepStrictEqual((result.body as { availableDifficultyLevels: number[] }).availableDifficultyLevels, [2, 4]);
  });

  it("omits the difficulty list when Yokaiba includes any invalid level", async () => {
    stubGlobal("fetch", resolvedMock(new Response(JSON.stringify({
      error: { code: "difficulty_unavailable" }, availableDifficultyLevels: [1, 2.5, 13],
    }), { status: 422, headers: { "content-type": "application/json" } })));
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "dojo-day", difficultyLevel: "3" } } as never, response as never);

    assert.strictEqual(result.statusCode, 422);
    assert.deepStrictEqual(result.body, {
      code: "difficulty_unavailable",
      error: "This seed cannot produce the selected difficulty. Try another puzzle.",
    });
  });

  it("does not consume an unrecognized Yokaiba 422 response while inspecting it", async () => {
    const upstreamResponse = new Response(JSON.stringify({
      error: { code: "invalid_template", message: "unknown template" },
    }), {
      status: 422, headers: { "content-type": "application/json" },
    });
    stubGlobal("fetch", resolvedMock(upstreamResponse));
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "dojo-day", difficultyLevel: "3" } } as never, response as never);

    assertPartialMatch(result, {
      statusCode: 502,
      body: { error: "Yokaiba is unavailable. Please try again." },
    });
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
    assert.strictEqual(upstreamResponse.bodyUsed, false);
  });

  it("uses a fallback error when a Yokaiba rate limit contains malformed JSON", async () => {
    stubGlobal("fetch", resolvedMock(new Response("not valid JSON", {
      status: 429, headers: { "content-type": "application/json", "retry-after": "30" },
    })));
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "dojo-day" } } as never, response as never);

    assertPartialMatch(result, {
      statusCode: 429,
      body: { error: "Too many dojo requests. Please wait a moment, then try again." },
    });
    assert.strictEqual(result.headers.get("retry-after"), "30");
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
  });
});
