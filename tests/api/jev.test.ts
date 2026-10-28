import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { configureJevForTests, restoreStubbedGlobals, stubGlobal } from "../../test-utils.js";

import { requestJevDecision } from "../../server/jev.js";

afterEach(() => {
  restoreStubbedGlobals();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.JEV_MODEL;
});

describe("OpenRouter Jev client", () => {
  it("[TB-JEV-01] uses the Decisions API with only an OpenRouter key configured", async () => {
    configureJevForTests();
    process.env.JEV_MODEL = "typesafe/jev-1.13";
    const fetchMock = mock.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(JSON.stringify({ answers: { route: { type: "choice", choice: "billing" } } }), { status: 200 });
    });
    stubGlobal("fetch", fetchMock);

    const result = await requestJevDecision(
      { state: { message: "A ticket" }, questions: { route: { type: "choice", instructions: "Choose a team", criteria: { billing: "Billing" } } } },
    );

    const providerCall = fetchMock.mock.calls.find(call => String(call.arguments[0]) === "https://openrouter.ai/api/alpha/decisions");
    assert.ok(providerCall);
    const init = providerCall.arguments[1] as RequestInit;
    assert.strictEqual(new Headers(init.headers).get("authorization"), "Bearer test-key");
    assert.strictEqual(JSON.parse(String(init.body)).model, "typesafe/jev-1.13");
    assert.strictEqual(fetchMock.mock.callCount(), 1);
    assert.deepStrictEqual(result, { answers: { route: { type: "choice", choice: "billing" } } });
  });

  it("does not make a paid request when the server key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = mock.fn();
    stubGlobal("fetch", fetchMock);

    assert.strictEqual(await requestJevDecision({ state: "text", questions: {} }), undefined);
    assert.strictEqual(fetchMock.mock.callCount(), 0);
  });

  it("returns undefined for provider failures so callers can use deterministic fallbacks", async () => {
    configureJevForTests();
    stubGlobal("fetch", mock.fn(async () => new Response("unavailable", { status: 503 })));

    assert.strictEqual(await requestJevDecision({ state: "text", questions: {} }), undefined);
  });

  it("treats an expired OpenRouter API key as unavailable", async () => {
    configureJevForTests();
    const fetchMock = mock.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 });
    });
    stubGlobal("fetch", fetchMock);

    assert.strictEqual(await requestJevDecision({ state: "text", questions: {} }), undefined);
    assert.strictEqual(fetchMock.mock.callCount(), 1);
    assert.strictEqual(String(fetchMock.mock.calls[0]?.arguments[0]), "https://openrouter.ai/api/alpha/decisions");
  });

  it("returns undefined when the provider request times out or rejects", async () => {
    configureJevForTests();
    stubGlobal("fetch", mock.fn(async () => {
      throw new Error("request timed out");
    }));

    assert.strictEqual(await requestJevDecision({ state: "compact state", questions: {} }), undefined);
  });
});
