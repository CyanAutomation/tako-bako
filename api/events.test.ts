import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./events.js";

function responseRecorder() {
  const result = { statusCode: 0, body: undefined as unknown };
  const response = { status: vi.fn((statusCode: number) => ({ json: vi.fn((body: unknown) => { result.statusCode = statusCode; result.body = body; }) })) };
  return { response, result };
}

describe("outcome proxy", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("forwards only anonymous, bounded puzzle outcomes", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 202, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();
    await handler({ method: "POST", body: { event: "puzzle_completed", templateId: "tournament-order-v2", assessedDifficultyLevel: 2, elapsedMs: 1000, seed: "must-not-forward" } } as never, response as never);
    expect(upstream).toHaveBeenCalledWith("https://yokaiba.scheimann.workers.dev/v1/events", expect.objectContaining({ body: JSON.stringify({ event: "puzzle_completed", templateId: "tournament-order-v2", assessedDifficultyLevel: 2, elapsedMs: 1000 }) }));
    expect(result).toMatchObject({ statusCode: 202, body: { accepted: true } });
  });
});
