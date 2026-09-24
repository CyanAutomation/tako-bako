import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { assertPartialMatch, rejectedMock, resolvedMock, restoreStubbedGlobals, stubGlobal } from "../test-utils.js";

import handler from "./health.js";

afterEach(restoreStubbedGlobals);

function responseRecorder() {
  const result = { statusCode: 0, body: undefined as unknown, headers: new Map<string, string>() };
  const response = {
    setHeader: mock.fn((name: string, value: string) => { result.headers.set(name.toLowerCase(), value); }),
    status: mock.fn((statusCode: number) => ({ json: mock.fn((body: unknown) => { result.statusCode = statusCode; result.body = body; }) })),
  };
  return { response, result };
}

describe("health readiness", () => {
  afterEach(() => { restoreStubbedGlobals(); mock.restoreAll(); });

  it("reports ready when Yokaiba is healthy", async () => {
    stubGlobal("fetch", resolvedMock(new Response(JSON.stringify({ status: "ok" }), { status: 200 })));
    const metric = mock.method(console, "info", () => undefined);
    const { response, result } = responseRecorder();

    await handler({ method: "GET" } as never, response as never);

    assertPartialMatch(result, { statusCode: 200, body: { status: "ok", dependencies: { yokaiba: "ok" } } });
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
    assert.strictEqual(metric.mock.callCount(), 1);
    assert.strictEqual(metric.mock.calls[0].arguments[0], "tako_bako_api_metric");
    assertPartialMatch(metric.mock.calls[0].arguments[1], { operation: "health", outcome: "success" });
  });

  it("reports degraded when Yokaiba cannot be reached", async () => {
    stubGlobal("fetch", rejectedMock(new Error("offline")));
    mock.method(console, "error", () => undefined);
    const { response, result } = responseRecorder();

    await handler({ method: "GET" } as never, response as never);

    assertPartialMatch(result, { statusCode: 503, body: { status: "degraded", dependencies: { yokaiba: "unavailable" } } });
  });
});
