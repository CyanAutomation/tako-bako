import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./hint.js";

function responseRecorder() {
  const result = { statusCode: 0, body: undefined as unknown, headers: new Map<string, string>() };
  const response = { setHeader: vi.fn((name: string, value: string) => { result.headers.set(name.toLowerCase(), value); }), status: vi.fn((statusCode: number) => ({ json: vi.fn((body: unknown) => { result.statusCode = statusCode; result.body = body; }) })) };
  return { response, result };
}

describe("hint proxy", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("forwards a bounded hint request and preserves the Yokaiba request ID", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ kind: "clue", clue: { id: "c1", text: "Start here." } }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "hint-123" } }));
    vi.stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();
    await handler({ method: "POST", body: { puzzleToken: "signed-token", kind: "clue" } } as never, response as never);
    expect(upstream).toHaveBeenCalledWith("https://yokaiba.scheimann.workers.dev/v1/puzzles/hint", expect.objectContaining({ method: "POST", body: JSON.stringify({ puzzleToken: "signed-token", kind: "clue" }) }));
    expect(result).toMatchObject({ statusCode: 200, body: { kind: "clue" } });
    expect(result.headers.get("x-yokaiba-request-id")).toBe("hint-123");
  });

  it("rejects malformed or unsupported hint requests before contacting Yokaiba", async () => {
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();
    await handler({ method: "POST", body: { puzzleToken: "", kind: "everything" } } as never, response as never);
    expect(upstream).not.toHaveBeenCalled();
    expect(result.statusCode).toBe(400);
  });
});
