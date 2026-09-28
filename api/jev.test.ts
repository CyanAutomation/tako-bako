import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { restoreStubbedGlobals, stubGlobal } from "../test-utils.js";

import { requestJevDecision } from "./jev.js";

afterEach(() => {
  restoreStubbedGlobals();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.JEV_MODEL;
});

describe("OpenRouter Jev client", () => {
  it("uses the Decisions API and keeps the key in the authorization header", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.JEV_MODEL = "typesafe/jev-1.13";
    const fetchMock = mock.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ answers: { route: { type: "choice", choice: "billing" } } }), { status: 200 });
    });
    stubGlobal("fetch", fetchMock);

    const result = await requestJevDecision({ state: { message: "A ticket" }, questions: { route: { type: "choice", instructions: "Choose a team", criteria: { billing: "Billing" } } } });

    assert.strictEqual(fetchMock.mock.calls[0].arguments[0], "https://openrouter.ai/api/alpha/decisions");
    const init = fetchMock.mock.calls[0].arguments[1] as RequestInit;
    assert.strictEqual(new Headers(init.headers).get("authorization"), "Bearer test-key");
    assert.strictEqual(JSON.parse(String(init.body)).model, "typesafe/jev-1.13");
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
    process.env.OPENROUTER_API_KEY = "test-key";
    stubGlobal("fetch", mock.fn(async () => new Response("unavailable", { status: 503 })));

    assert.strictEqual(await requestJevDecision({ state: "text", questions: {} }), undefined);
  });
});
