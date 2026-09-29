import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { rejectedMock, restoreStubbedGlobals, stubGlobal } from "../test-utils.js";

import handler from "./clue-strategies.js";

afterEach(() => {
  restoreStubbedGlobals();
  delete process.env.OPENROUTER_API_KEY;
});

function responseRecorder() {
  const result = { statusCode: 0, body: undefined as unknown, headers: new Map<string, string>() };
  const response = { setHeader: mock.fn((name: string, value: string) => { result.headers.set(name.toLowerCase(), value); }), status: mock.fn((statusCode: number) => ({ json: mock.fn((body: unknown) => { result.statusCode = statusCode; result.body = body; }) })) };
  return { response, result };
}

describe("clue strategy endpoint", () => {
  it("uses known constraint metadata and batches semantic classifications through Jev", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const upstream = mock.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (String(_url).includes("yokaiba")) return new Response(JSON.stringify({ kind: "clue" }), { status: 200 });
      const request = JSON.parse(String(init?.body));
      assert.strictEqual(JSON.stringify(request).includes("signed-token"), false);
      assert.strictEqual(request.state.clues.length, 1);
      assert.strictEqual(request.state.clues[0].id, "mystery");
      assert.ok(request.questions.clue_0);
      return new Response(JSON.stringify({ answers: { clue_0: { type: "choice", choice: "adjacency", confidence: 0.92 } } }), { status: 200 });
    });
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token", clues: [
      { id: "match", text: "Aki was associated with Lions.", constraintKind: "matches" },
      { id: "mystery", text: "Hana lives next to the fish keeper." },
    ] } } as never, response as never);

    assert.strictEqual(upstream.mock.callCount(), 2);
    assert.strictEqual(upstream.mock.calls[0].arguments[0], "https://yokaiba.scheimann.workers.dev/v1/puzzles/hint");
    assert.deepStrictEqual(result.body, { strategies: [
      { clueId: "match", strategy: "direct_match", confidence: 1 },
      { clueId: "mystery", strategy: "adjacency", confidence: 0.92 },
    ] });
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
  });

  it("returns deterministic labels without calling Jev when no key is configured", async () => {
    const upstream = mock.fn();
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { clues: [{ id: "distance", text: "Two places apart", constraintKind: "distance" }] } } as never, response as never);

    assert.strictEqual(upstream.mock.callCount(), 0);
    assert.deepStrictEqual(result.body, { strategies: [{ clueId: "distance", strategy: "distance", confidence: 1 }] });
  });

  it("rejects unbounded or malformed clue lists", async () => {
    const upstream = mock.fn();
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { clues: [{ id: "x", text: "" }] } } as never, response as never);

    assert.strictEqual(result.statusCode, 400);
    assert.strictEqual(upstream.mock.callCount(), 0);
  });

  it("keeps known labels when Yokaiba rejects the model-assisted token check", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    stubGlobal("fetch", async () => new Response("unavailable", { status: 503 }));
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token", clues: [
      { id: "known", text: "Aki matches Lions.", constraintKind: "matches" },
      { id: "unknown", text: "Hana is next to the fish keeper." },
    ] } } as never, response as never);

    assert.strictEqual(result.statusCode, 200);
    assert.deepStrictEqual(result.body, { strategies: [{ clueId: "known", strategy: "direct_match", confidence: 1 }] });
  });

  it("keeps known labels when the model-assisted token check throws", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    stubGlobal("fetch", rejectedMock(new Error("network unavailable")));
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token", clues: [
      { id: "known", text: "Aki matches Lions.", constraintKind: "matches" },
      { id: "unknown", text: "Hana is next to the fish keeper." },
    ] } } as never, response as never);

    assert.strictEqual(result.statusCode, 200);
    assert.deepStrictEqual(result.body, { strategies: [{ clueId: "known", strategy: "direct_match", confidence: 1 }] });
  });
});
