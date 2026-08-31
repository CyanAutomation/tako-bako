import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./health.js";

function responseRecorder() {
  const result = { statusCode: 0, body: undefined as unknown, headers: new Map<string, string>() };
  const response = {
    setHeader: vi.fn((name: string, value: string) => { result.headers.set(name.toLowerCase(), value); }),
    status: vi.fn((statusCode: number) => ({ json: vi.fn((body: unknown) => { result.statusCode = statusCode; result.body = body; }) })),
  };
  return { response, result };
}

describe("health readiness", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("reports ready when Yokaiba is healthy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 })));
    const metric = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { response, result } = responseRecorder();

    await handler({ method: "GET" } as never, response as never);

    expect(result).toMatchObject({ statusCode: 200, body: { status: "ok", dependencies: { yokaiba: "ok" } } });
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(metric).toHaveBeenCalledWith("tako_bako_api_metric", expect.objectContaining({ operation: "health", outcome: "success" }));
  });

  it("reports degraded when Yokaiba cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { response, result } = responseRecorder();

    await handler({ method: "GET" } as never, response as never);

    expect(result).toMatchObject({ statusCode: 503, body: { status: "degraded", dependencies: { yokaiba: "unavailable" } } });
  });
});
