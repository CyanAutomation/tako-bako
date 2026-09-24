import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { assertPartialMatch, resolvedMock, restoreStubbedGlobals, stubGlobal } from "../test-utils.js";

import handler from "./events.js";

afterEach(restoreStubbedGlobals);

function responseRecorder() {
  const result = { statusCode: 0, body: undefined as unknown };
  const response = { status: mock.fn((statusCode: number) => ({ json: mock.fn((body: unknown) => { result.statusCode = statusCode; result.body = body; }) })) };
  return { response, result };
}

describe("outcome proxy", () => {
  afterEach(() => { restoreStubbedGlobals(); });

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
