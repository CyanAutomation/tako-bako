import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { assertPartialMatch, restoreStubbedGlobals, stubGlobal } from "../../test-utils.js";

import handler, { config } from "../../api/events.js";

afterEach(() => {
  restoreStubbedGlobals();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

function responseRecorder() {
  const result = { statusCode: 0, body: undefined as unknown, headers: new Map<string, string>() };
  const response = {
    setHeader: mock.fn((name: string, value: string) => result.headers.set(name.toLowerCase(), value)),
    status: mock.fn((statusCode: number) => ({ json: mock.fn((body: unknown) => { result.statusCode = statusCode; result.body = body; }) })),
  };
  return { response, result };
}

describe("outcome proxy", () => {
  afterEach(() => { restoreStubbedGlobals(); });

  it("rejects unsupported methods and invalid payloads before forwarding", async () => {
    const upstream = mock.fn();
    stubGlobal("fetch", upstream);
    const methodResponse = responseRecorder();
    await handler({ method: "GET", body: {} } as never, methodResponse.response as never);
    assert.strictEqual(methodResponse.result.statusCode, 405);
    assert.strictEqual(methodResponse.result.headers.get("allow"), "POST");

    const bodyResponse = responseRecorder();
    await handler({ method: "POST", body: { event: "unknown", templateId: "tournament-order-v1" } } as never, bodyResponse.response as never);
    assert.strictEqual(bodyResponse.result.statusCode, 400);
    assert.strictEqual(upstream.mock.callCount(), 0);
  });

  it("uses a small body limit for anonymous events", () => {
    assert.strictEqual(config.api.bodyParser.sizeLimit, "4kb");
  });

  it("blocks forwarding when the shared event limiter is not configured", async () => {
    const upstream = mock.fn();
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { event: "puzzle_started", templateId: "tournament-order-v1" } } as never, response as never);

    assert.strictEqual(result.statusCode, 503);
    assert.deepStrictEqual(result.body, { accepted: false });
    assert.strictEqual(upstream.mock.callCount(), 0);
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
  });

  it("returns a rate-limit response without forwarding a rejected event", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test-db.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-redis-token";
    const upstream = mock.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void init;
      assert.strictEqual(String(input), "https://test-db.upstash.io");
      return new Response(JSON.stringify({ result: [120, 1, 0] }), { status: 200 });
    });
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", headers: { "x-forwarded-for": "198.51.100.9, 203.0.113.7" }, body: { event: "puzzle_started", templateId: "tournament-order-v1" } } as never, response as never);

    assert.strictEqual(result.statusCode, 429);
    assert.deepStrictEqual(result.body, { accepted: false });
    assert.strictEqual(upstream.mock.callCount(), 1);
  });

  it("returns a non-JSON upstream response as an unaccepted event", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test-db.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-redis-token";
    const upstream = mock.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void init;
      return String(input) === "https://test-db.upstash.io"
        ? new Response(JSON.stringify({ result: [1, 1, 1] }), { status: 200 })
        : new Response("accepted", { status: 202, headers: { "content-type": "text/plain" } });
    });
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { event: "puzzle_started", templateId: "tournament-order-v1" } } as never, response as never);

    assert.strictEqual(result.statusCode, 202);
    assert.deepStrictEqual(result.body, { accepted: false });
  });

  it("keeps event recording best-effort when the upstream request fails", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test-db.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-redis-token";
    const upstream = mock.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void init;
      return String(input) === "https://test-db.upstash.io"
        ? new Response(JSON.stringify({ result: [1, 1, 1] }), { status: 200 })
        : Promise.reject(new Error("network unavailable"));
    });
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { event: "puzzle_started", templateId: "tournament-order-v1" } } as never, response as never);

    assert.strictEqual(result.statusCode, 202);
    assert.deepStrictEqual(result.body, { accepted: false });
  });

  it("forwards only anonymous, bounded puzzle outcomes", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test-db.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-redis-token";
    const upstream = mock.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void init;
      return String(input) === "https://test-db.upstash.io"
        ? new Response(JSON.stringify({ result: [1, 1, 1] }), { status: 200 })
        : new Response(JSON.stringify({ accepted: true }), { status: 202, headers: { "content-type": "application/json" } });
    });
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();
    await handler({ method: "POST", body: { event: "puzzle_completed", templateId: "tournament-order-v2", assessedDifficultyLevel: 2, elapsedMs: 1000, smartMarkingEnabled: true, seed: "must-not-forward" } } as never, response as never);
    assert.strictEqual(upstream.mock.callCount(), 2);
    assert.strictEqual(upstream.mock.calls[1].arguments[0], "https://yokaiba.scheimann.workers.dev/v1/events");
    assertPartialMatch(upstream.mock.calls[1].arguments[1], { body: JSON.stringify({ schemaVersion: 0, event: "puzzle_completed", templateId: "tournament-order-v2", assessedDifficultyLevel: 2, elapsedMs: 1000, smartMarkingEnabled: true }) });
    assertPartialMatch(result, { statusCode: 202, body: { accepted: true } });
  });
});
