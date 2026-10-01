import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { restoreStubbedGlobals, stubGlobal } from "../../test-utils.js";

import { allowJevDecision, clientAddressFromForwardedFor } from "../../server/jev-rate-limit.js";

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

describe("Jev shared rate limit", () => {
  it("atomically reserves a per-client and global quota without sending the raw address", async () => {
    configureRedis();
    const fetchMock = mock.fn(async () => redisCountResponse(1, 1));
    stubGlobal("fetch", fetchMock);

    assert.strictEqual(await allowJevDecision("203.0.113.4"), true);

    assert.strictEqual(fetchMock.mock.callCount(), 1);
    assert.strictEqual(fetchMock.mock.calls[0].arguments[0], TEST_REST_URL);
    const init = fetchMock.mock.calls[0].arguments[1] as RequestInit;
    assert.strictEqual(new Headers(init.headers).get("authorization"), "Bearer test-redis-token");
    const command = JSON.parse(String(init.body)) as unknown[];
    assert.strictEqual(command[0], "EVAL");
    assert.strictEqual(command[2], 2);
    assert.strictEqual(command[7], 10_000);
    assert.strictEqual(command[8], 60);
    assert.ok(String(command[1]).includes("INCR"));
    assert.ok(String(command[1]).includes("global_count >= tonumber(ARGV[3]) then return {0, global_count, 0}"));
    assert.ok(String(command[1]).includes("client_count >= tonumber(ARGV[4]) then return {client_count, global_count, 0}"));
    assert.ok(String(command[1]).includes("return {client_count, global_count, 1}"));
    assert.ok(String(command[3]).startsWith("tako-bako:jev:client:"));
    assert.ok(String(command[4]).startsWith("tako-bako:jev:global:"));
    assert.strictEqual(JSON.stringify(command).includes("203.0.113.4"), false);
  });

  it("denies a client after its minute quota is exceeded", async () => {
    configureRedis();
    stubGlobal("fetch", mock.fn(async () => redisCountResponse(60, 1000, 0)));

    assert.strictEqual(await allowJevDecision("203.0.113.4"), false);
  });

  it("denies provider calls after the shared daily quota is exceeded", async () => {
    configureRedis();
    stubGlobal("fetch", mock.fn(async () => redisCountResponse(1, 10_000, 0)));

    assert.strictEqual(await allowJevDecision("203.0.113.4"), false);
  });

  it("fails closed when the shared limiter is not configured or is unavailable", async () => {
    const fetchMock = mock.fn();
    stubGlobal("fetch", fetchMock);
    assert.strictEqual(await allowJevDecision("203.0.113.4"), false);
    assert.strictEqual(fetchMock.mock.callCount(), 0);

    configureRedis();
    stubGlobal("fetch", mock.fn(async () => new Response("unavailable", { status: 503 })));
    assert.strictEqual(await allowJevDecision("203.0.113.4"), false);
  });

  it("rejects an Upstash REST URL with a non-default port", async () => {
    configureRedis();
    process.env.UPSTASH_REDIS_REST_URL = "https://test-db.upstash.io:8443";
    const fetchMock = mock.fn();
    stubGlobal("fetch", fetchMock);

    assert.strictEqual(await allowJevDecision("203.0.113.4"), false);
    assert.strictEqual(fetchMock.mock.callCount(), 0);
  });

  it("uses the rightmost Vercel forwarded address and rejects malformed values", () => {
    assert.strictEqual(clientAddressFromForwardedFor("198.51.100.9, 203.0.113.7"), "203.0.113.7");
    assert.strictEqual(clientAddressFromForwardedFor(["198.51.100.9", "203.0.113.7"]), "203.0.113.7");
    assert.strictEqual(clientAddressFromForwardedFor("not-an-ip"), undefined);
  });
});
