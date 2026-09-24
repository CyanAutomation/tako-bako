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
  afterEach(() => { restoreStubbedGlobals(); });

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
});
