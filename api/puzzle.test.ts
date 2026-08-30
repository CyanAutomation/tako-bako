import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./puzzle.js";

function responseRecorder() {
  const result = { statusCode: 0, body: undefined as unknown, headers: new Map<string, string>() };
  const response = {
    setHeader: vi.fn((name: string, value: string) => { result.headers.set(name.toLowerCase(), value); }),
    status: vi.fn((statusCode: number) => {
      result.statusCode = statusCode;
      return { json: vi.fn((body: unknown) => { result.body = body; }) };
    }),
  };
  return { response, result };
}

describe("puzzle proxy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards a signed completion check to Yokaiba", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ correct: true }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token", answer: { assignments: { club: ["Lions", "Wolves"] } } } } as never, response as never);

    expect(upstream).toHaveBeenCalledWith("https://yokaiba.scheimann.workers.dev/v1/puzzles/verify", expect.objectContaining({
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ puzzleToken: "signed-token", answer: { assignments: { club: ["Lions", "Wolves"] } } }),
    }));
    expect(result).toMatchObject({ statusCode: 200, body: { correct: true } });
  });

  it("rejects an incomplete completion check before contacting Yokaiba", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token" } } as never, response as never);

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({ statusCode: 400, body: { error: "A complete signed answer is required" } });
  });

  it.each([
    { puzzleToken: "signed-token", answer: null },
    { puzzleToken: "signed-token", answer: { assignments: [] } },
    { puzzleToken: "signed-token", answer: { assignments: { club: "Lions" } } },
    { puzzleToken: "signed-token", answer: { assignments: { club: ["Lions", 42] } } },
    { puzzleToken: "signed-token", answer: { assignments: { club: [] } } },
  ])("rejects malformed completion payloads before contacting Yokaiba", async body => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body } as never, response as never);

    expect(upstream).not.toHaveBeenCalled();
    expect(result.statusCode).toBe(400);
  });

  it("forwards only validated completion fields", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ correct: true }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", upstream);
    const { response } = responseRecorder();

    await handler({
      method: "POST",
      body: {
        puzzleToken: "signed-token",
        answer: { assignments: { club: ["Lions"] }, ignored: "value" },
        ignored: "value",
      },
    } as never, response as never);

    expect(upstream).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: JSON.stringify({ puzzleToken: "signed-token", answer: { assignments: { club: ["Lions"] } } }),
    }));
  });

  it("caches deterministic generated puzzles at the CDN", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "dojo-day" }), {
      status: 200, headers: { "content-type": "application/json" },
    })));
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "dojo-day" } } as never, response as never);

    expect(result).toMatchObject({ statusCode: 200 });
    expect(result.headers.get("cache-control")).toContain("s-maxage=300");
    expect(result.headers.get("vercel-cdn-cache-control")).toContain("s-maxage=300");
  });

  it("reports an upstream timeout distinctly and emits structured telemetry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" })));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { response, result } = responseRecorder();

    await handler({ method: "GET", query: { seed: "dojo-day" } } as never, response as never);

    expect(result).toMatchObject({ statusCode: 504, body: { error: "Yokaiba took too long to respond. Please try again." } });
    expect(error).toHaveBeenCalledWith("yokaiba_request_failed", expect.objectContaining({ operation: "generate", timedOut: true }));
    error.mockRestore();
  });

  it("rate limits repeated requests from the same client", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "dojo-day" }), {
      status: 200, headers: { "content-type": "application/json" },
    })));
    const request = { method: "GET", query: { seed: "dojo-day" }, headers: { "x-forwarded-for": "rate-limit-test" } } as never;
    for (let index = 0; index < 60; index += 1) {
      const { response } = responseRecorder();
      await handler(request, response as never);
    }
    const { response, result } = responseRecorder();

    await handler(request, response as never);

    expect(result).toMatchObject({ statusCode: 429, body: { error: expect.stringContaining("Too many dojo requests") } });
    expect(result.headers.get("retry-after")).toMatch(/^\d+$/);
  });
});
