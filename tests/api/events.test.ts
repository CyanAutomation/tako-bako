import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { assertPartialMatch, resolvedMock, restoreStubbedGlobals, stubGlobal } from "../../test-utils.js";

import handler from "../../api/events.js";

afterEach(restoreStubbedGlobals);

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

  it("returns a non-JSON upstream response as an unaccepted event", async () => {
    stubGlobal("fetch", resolvedMock(new Response("accepted", { status: 202, headers: { "content-type": "text/plain" } })));
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { event: "puzzle_started", templateId: "tournament-order-v1" } } as never, response as never);

    assert.strictEqual(result.statusCode, 202);
    assert.deepStrictEqual(result.body, { accepted: false });
  });

  it("keeps event recording best-effort when the upstream request fails", async () => {
    stubGlobal("fetch", mock.fn(async () => { throw new Error("network unavailable"); }));
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { event: "puzzle_started", templateId: "tournament-order-v1" } } as never, response as never);

    assert.strictEqual(result.statusCode, 202);
    assert.deepStrictEqual(result.body, { accepted: false });
  });

  it("forwards only anonymous, bounded puzzle outcomes", async () => {
    const upstream = resolvedMock(new Response(JSON.stringify({ accepted: true }), { status: 202, headers: { "content-type": "application/json" } }));
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();
    await handler({ method: "POST", body: { event: "puzzle_completed", templateId: "tournament-order-v2", assessedDifficultyLevel: 2, elapsedMs: 1000, smartMarkingEnabled: true, seed: "must-not-forward" } } as never, response as never);
    assert.strictEqual(upstream.mock.callCount(), 1);
    assert.strictEqual(upstream.mock.calls[0].arguments[0], "https://yokaiba.scheimann.workers.dev/v1/events");
    assertPartialMatch(upstream.mock.calls[0].arguments[1], { body: JSON.stringify({ event: "puzzle_completed", templateId: "tournament-order-v2", assessedDifficultyLevel: 2, elapsedMs: 1000, smartMarkingEnabled: true }) });
    assertPartialMatch(result, { statusCode: 202, body: { accepted: true } });
  });
});
