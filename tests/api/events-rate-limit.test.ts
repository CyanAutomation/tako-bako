import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { restoreStubbedGlobals, stubGlobal } from "../../test-utils.js";
import { reserveEventRequest } from "../../server/events-rate-limit.js";

const TEST_REST_URL = "https://test-db.upstash.io";

afterEach(() => {
  restoreStubbedGlobals();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

function configureRedis(): void {
  process.env.UPSTASH_REDIS_REST_URL = TEST_REST_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-redis-token";
}

function redisCountResponse(clientCount: number, globalCount: number, allowed = 1): Response {
  return new Response(JSON.stringify({ result: [clientCount, globalCount, allowed] }), { status: 200 });
}

describe("shared event rate limit", () => {
  it("atomically reserves per-client and global quotas without storing the raw address", async () => {
    configureRedis();
    const fetchMock = mock.fn(async (...args: Parameters<typeof fetch>) => { void args; return redisCountResponse(1, 1); });
    stubGlobal("fetch", fetchMock);

    assert.strictEqual(await reserveEventRequest("203.0.113.4"), "allowed");

    assert.strictEqual(fetchMock.mock.callCount(), 1);
    assert.strictEqual(fetchMock.mock.calls[0].arguments[0], TEST_REST_URL);
    const init = fetchMock.mock.calls[0].arguments[1] as RequestInit;
    assert.strictEqual(new Headers(init.headers).get("authorization"), "Bearer test-redis-token");
    const command = JSON.parse(String(init.body)) as unknown[];
    assert.strictEqual(command[0], "EVAL");
    assert.strictEqual(command[2], 2);
    assert.strictEqual(command[7], 100_000);
    assert.strictEqual(command[8], 120);
    assert.ok(String(command[3]).startsWith("tako-bako:events:client:"));
    assert.ok(String(command[4]).startsWith("tako-bako:events:global:"));
    assert.strictEqual(JSON.stringify(command).includes("203.0.113.4"), false);
  });

  it("distinguishes exhausted quotas from unavailable limiter configuration", async () => {
    configureRedis();
    stubGlobal("fetch", mock.fn(async () => redisCountResponse(120, 10, 0)));
    assert.strictEqual(await reserveEventRequest("203.0.113.4"), "limited");

    delete process.env.UPSTASH_REDIS_REST_URL;
    assert.strictEqual(await reserveEventRequest("203.0.113.4"), "unavailable");
  });

  it("fails closed when Redis is unavailable or the limiter response is malformed", async () => {
    configureRedis();
    stubGlobal("fetch", mock.fn(async () => new Response("unavailable", { status: 503 })));
    assert.strictEqual(await reserveEventRequest("203.0.113.4"), "unavailable");

    stubGlobal("fetch", mock.fn(async () => new Response(JSON.stringify({ result: ["bad"] }), { status: 200 })));
    assert.strictEqual(await reserveEventRequest("203.0.113.4"), "unavailable");
  });
});
