import type { VercelRequest, VercelResponse } from "@vercel/node";

const URL = "https://yokaiba.scheimann.workers.dev/v1/puzzles/hint";
const MAX_TOKEN_LENGTH = 16_384;

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "POST") { response.setHeader("allow", "POST"); response.status(405).json({ error: "Method not allowed" }); return; }
  const body = request.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) { response.status(400).json({ error: "A signed hint request is required" }); return; }
  const value = body as Record<string, unknown>;
  if (typeof value.puzzleToken !== "string" || value.puzzleToken.length === 0 || value.puzzleToken.length > MAX_TOKEN_LENGTH || (value.kind !== undefined && value.kind !== "clue" && value.kind !== "elimination" && value.kind !== "placement")) { response.status(400).json({ error: "A valid signed hint request is required" }); return; }
  try {
    const upstream = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ puzzleToken: value.puzzleToken, ...(value.kind === undefined ? {} : { kind: value.kind }) }), signal: AbortSignal.timeout(8_000) });
    const requestId = upstream.headers.get("x-request-id"); if (requestId) response.setHeader("x-yokaiba-request-id", requestId);
    response.setHeader("cache-control", "no-store");
    const payload: unknown = upstream.headers.get("content-type")?.includes("application/json") ? await upstream.json() : { error: "Yokaiba assistance is unavailable. Please try again." };
    response.status(upstream.status).json(payload);
  } catch {
    response.status(502).json({ error: "Yokaiba assistance is unavailable. Please try again." });
  }
}
