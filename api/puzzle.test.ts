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
});
