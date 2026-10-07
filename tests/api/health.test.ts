import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { assertPartialMatch, rejectedMock, resolvedMock, restoreStubbedGlobals, stubGlobal } from "../../test-utils.js";

import handler from "../../api/health.js";

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

  it("[TB-OBS-01] reports readiness and logs a valid success metric", async () => {
    stubGlobal("fetch", resolvedMock(new Response(JSON.stringify({ status: "ok" }), { status: 200 })));
    const metric = mock.method(console, "info", () => undefined);
    const { response, result } = responseRecorder();

    await handler({ method: "GET" } as never, response as never);

    assertPartialMatch(result, { statusCode: 200, body: { status: "ok", dependencies: { yokaiba: "ok" } } });
    assert.strictEqual(result.headers.get("cache-control"), "no-store");
    assert.strictEqual(metric.mock.callCount(), 1);
    assert.strictEqual(metric.mock.calls[0].arguments[0], "tako_bako_api_metric");
    const fields = metric.mock.calls[0].arguments[1] as Record<string, unknown>;
    assertPartialMatch(fields, { operation: "health", outcome: "success", status: 200 });
    assert.ok(typeof fields.durationMs === "number" && Number.isFinite(fields.durationMs) && fields.durationMs >= 0);
  });

  it("[TB-OBS-01] reports degraded readiness and logs a valid failure metric", async () => {
    stubGlobal("fetch", rejectedMock(new Error("offline")));
    const timestamps = [1_000, 900];
    mock.method(Date, "now", () => timestamps.shift() ?? 900);
    const metric = mock.method(console, "error", () => undefined);
    const { response, result } = responseRecorder();

    await handler({ method: "GET" } as never, response as never);

    assertPartialMatch(result, { statusCode: 503, body: { status: "degraded", dependencies: { yokaiba: "unavailable" } } });
    assert.strictEqual(metric.mock.calls[0]?.arguments[0], "tako_bako_api_metric");
    const fields = metric.mock.calls[0]?.arguments[1] as Record<string, unknown>;
    assertPartialMatch(fields, { operation: "health", outcome: "dependency_error", status: 503 });
    assert.strictEqual(fields.durationMs, 0);
  });
});
