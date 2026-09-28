import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { assertPartialMatch, resolvedMock, restoreStubbedGlobals, stubGlobal } from "../test-utils.js";

import handler from "./hint.js";

afterEach(restoreStubbedGlobals);

function responseRecorder() {
  const result = { statusCode: 0, body: undefined as unknown, headers: new Map<string, string>() };
  const response = { setHeader: mock.fn((name: string, value: string) => { result.headers.set(name.toLowerCase(), value); }), status: mock.fn((statusCode: number) => ({ json: mock.fn((body: unknown) => { result.statusCode = statusCode; result.body = body; }) })) };
  return { response, result };
}

describe("hint proxy", () => {
  afterEach(() => { restoreStubbedGlobals(); delete process.env.OPENROUTER_API_KEY; delete process.env.JEV_MODEL; });

  it("forwards a bounded hint request and preserves the Yokaiba request ID", async () => {
    const upstream = resolvedMock(new Response(JSON.stringify({ kind: "clue", clue: { id: "c1", text: "Start here." } }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "hint-123" } }));
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();
    await handler({ method: "POST", body: { puzzleToken: "signed-token", kind: "clue" } } as never, response as never);
    assert.strictEqual(upstream.mock.callCount(), 1);
    assert.strictEqual(upstream.mock.calls[0].arguments[0], "https://yokaiba.scheimann.workers.dev/v1/puzzles/hint");
    assertPartialMatch(upstream.mock.calls[0].arguments[1], { method: "POST", body: JSON.stringify({ puzzleToken: "signed-token", kind: "clue" }) });
    assertPartialMatch(result, { statusCode: 200, body: { kind: "clue" } });
    assert.strictEqual(result.headers.get("x-yokaiba-request-id"), "hint-123");
  });

  it("rejects malformed or unsupported hint requests before contacting Yokaiba", async () => {
    const upstream = mock.fn(); stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();
    await handler({ method: "POST", body: { puzzleToken: "", kind: "everything" } } as never, response as never);
    assert.strictEqual(upstream.mock.callCount() > 0, false);
    assert.strictEqual(result.statusCode, 400);
  });

  it("lets Jev choose only from the supplied clues and Yokaiba's solver-verified hint", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchMock = mock.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url, body });
      if (url.includes("openrouter.ai")) {
        return new Response(JSON.stringify({ answers: { next_hint: { type: "choice", choice: "candidate_1", confidence: 0.9 } } }), { status: 200 });
      }
      return new Response(JSON.stringify({ kind: "placement", placement: { subject: "Aki", category: "club", value: "Lions" } }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "hint-123" } });
    });
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: {
      puzzleToken: "secret-signed-token",
      kind: "placement",
      clues: [{ id: "c1", text: "Aki trains at the Lions club." }, { id: "c2", text: "Hana lives next to the fish keeper." }],
      usedClueIds: ["c1"],
      board: [{ category: "club", subject: "Aki", value: "Lions", mark: "yes" }],
    } } as never, response as never);

    const decisionCall = calls.find(call => call.url.includes("openrouter.ai"));
    assert.ok(decisionCall);
    assert.deepStrictEqual((decisionCall.body.state as { candidates: { id: string }[] }).candidates.map(candidate => candidate.id), ["solver_primary", "clue:c2"]);
    assert.strictEqual(JSON.stringify(decisionCall.body).includes("secret-signed-token"), false);
    assert.deepStrictEqual(result.body, { kind: "clue", clue: { id: "c2", text: "Hana lives next to the fish keeper." } });
    assert.strictEqual(result.headers.get("x-yokaiba-request-id"), "hint-123");
  });

  it("falls back to the primary Yokaiba hint when Jev returns a choice outside the candidate set", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = mock.fn(async (input: string | URL | Request) => String(input).includes("openrouter.ai")
      ? new Response(JSON.stringify({ answers: { next_hint: { type: "choice", choice: "invented", confidence: 1 } } }), { status: 200 })
      : new Response(JSON.stringify({ kind: "placement", placement: { subject: "Aki", category: "club", value: "Lions" } }), { status: 200, headers: { "content-type": "application/json" } }));
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token", kind: "placement", clues: [{ id: "c1", text: "Aki trains at Lions." }] } } as never, response as never);

    assert.deepStrictEqual(result.body, { kind: "placement", placement: { subject: "Aki", category: "club", value: "Lions" } });
  });

  it("keeps the existing Yokaiba hint available when optional selection context is malformed", async () => {
    const upstream = resolvedMock(new Response(JSON.stringify({ kind: "clue", clue: { id: "c1", text: "Start here." } }), { status: 200, headers: { "content-type": "application/json" } }));
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token", kind: "clue", clues: [{ id: "bad", text: "x".repeat(513) }] } } as never, response as never);

    assert.strictEqual(upstream.mock.callCount(), 1);
    assert.deepStrictEqual(result.body, { kind: "clue", clue: { id: "c1", text: "Start here." } });
  });

  it("uses the sole unused clue when Yokaiba's clue has already been marked used", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const upstream = resolvedMock(new Response(JSON.stringify({ kind: "clue", clue: { id: "used", text: "Already used." } }), { status: 200, headers: { "content-type": "application/json" } }));
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: {
      puzzleToken: "signed-token",
      kind: "clue",
      clues: [{ id: "used", text: "Already used." }, { id: "fresh", text: "Try this clue instead." }],
      usedClueIds: ["used"],
    } } as never, response as never);

    assert.strictEqual(upstream.mock.callCount(), 1);
    assert.deepStrictEqual(result.body, { kind: "clue", clue: { id: "fresh", text: "Try this clue instead." } });
  });
});
