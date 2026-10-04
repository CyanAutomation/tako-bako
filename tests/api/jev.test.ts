import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { configureJevForTests, isJevRateLimitRequest, jevRateLimitResponse, restoreStubbedGlobals, stubGlobal } from "../../test-utils.js";

import { requestJevDecision } from "../../server/jev.js";

afterEach(() => {
  restoreStubbedGlobals();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.JEV_MODEL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("OpenRouter Jev client", () => {
  it("uses the Decisions API only after reserving shared quota", async () => {
    configureJevForTests();
    process.env.JEV_MODEL = "typesafe/jev-1.13";
    const fetchMock = mock.fn(async (input: string | URL | Request) => {
      if (isJevRateLimitRequest(input)) return jevRateLimitResponse();
      return new Response(JSON.stringify({ answers: { route: { type: "choice", choice: "billing" } } }), { status: 200 });
    });
    stubGlobal("fetch", fetchMock);

    const result = await requestJevDecision(
      { state: { message: "A ticket" }, questions: { route: { type: "choice", instructions: "Choose a team", criteria: { billing: "Billing" } } } },
      "203.0.113.12",
    );

    const providerCall = fetchMock.mock.calls.find(call => String(call.arguments[0]) === "https://openrouter.ai/api/alpha/decisions");
    assert.ok(providerCall);
    const init = providerCall.arguments[1] as RequestInit;
    assert.strictEqual(new Headers(init.headers).get("authorization"), "Bearer test-key");
    assert.strictEqual(JSON.parse(String(init.body)).model, "typesafe/jev-1.13");
    assert.strictEqual(JSON.stringify(init.body).includes("203.0.113.12"), false);
    assert.deepStrictEqual(result, { answers: { route: { type: "choice", choice: "billing" } } });
  });

  it("does not make a paid request when the server key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = mock.fn();
    stubGlobal("fetch", fetchMock);

    assert.strictEqual(await requestJevDecision({ state: "text", questions: {} }), undefined);
    assert.strictEqual(fetchMock.mock.callCount(), 0);
  });

  it("fails closed without shared rate-limit configuration", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = mock.fn();
    stubGlobal("fetch", fetchMock);

    assert.strictEqual(await requestJevDecision({ state: "text", questions: {} }), undefined);
    assert.strictEqual(fetchMock.mock.callCount(), 0);
  });

  it("does not contact OpenRouter when the shared quota is exhausted", async () => {
    configureJevForTests();
    let providerCalled = false;
    const fetchMock = mock.fn(async (input: string | URL | Request) => {
      if (isJevRateLimitRequest(input)) return jevRateLimitResponse(60, 10_000, 0);
      providerCalled = true;
      return new Response(JSON.stringify({ answers: {} }), { status: 200 });
    });
    stubGlobal("fetch", fetchMock);

    assert.strictEqual(await requestJevDecision({ state: "text", questions: {} }, "203.0.113.12"), undefined);
    assert.strictEqual(providerCalled, false);
    assert.strictEqual(fetchMock.mock.callCount(), 1);
  });

  it("returns undefined for provider failures so callers can use deterministic fallbacks", async () => {
    configureJevForTests();
    stubGlobal("fetch", mock.fn(async (input: string | URL | Request) => isJevRateLimitRequest(input)
      ? jevRateLimitResponse()
      : new Response("unavailable", { status: 503 })));

    assert.strictEqual(await requestJevDecision({ state: "text", questions: {} }), undefined);
  });

  it("treats an expired OpenRouter API key as unavailable", async () => {
    configureJevForTests();
    const fetchMock = mock.fn(async (input: string | URL | Request) => isJevRateLimitRequest(input)
      ? jevRateLimitResponse()
      : new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 }));
    stubGlobal("fetch", fetchMock);

    assert.strictEqual(await requestJevDecision({ state: "text", questions: {} }), undefined);
    assert.strictEqual(fetchMock.mock.callCount(), 2);
    assert.strictEqual(String(fetchMock.mock.calls[1]?.arguments[0]), "https://openrouter.ai/api/alpha/decisions");
  });

  it("skips Jev when the shared rate-limit API key has expired", async () => {
    configureJevForTests();
    const fetchMock = mock.fn(async () => new Response("Unauthorized", { status: 401 }));
    stubGlobal("fetch", fetchMock);

    assert.strictEqual(await requestJevDecision({ state: "text", questions: {} }), undefined);
    assert.strictEqual(fetchMock.mock.callCount(), 1);
  });

  it("returns undefined when the provider request times out or rejects", async () => {
    configureJevForTests();
    stubGlobal("fetch", mock.fn(async (input: string | URL | Request) => {
      if (isJevRateLimitRequest(input)) return jevRateLimitResponse();
      throw new Error("request timed out");
    }));

    assert.strictEqual(await requestJevDecision({ state: "compact state", questions: {} }), undefined);
  });
});
