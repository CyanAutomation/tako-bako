import type { VercelRequest, VercelResponse } from "@vercel/node";

const YOKAIBA_URL = "https://yokaiba.scheimann.workers.dev/v1/puzzles/generate";
const SEED_PATTERN = /^[a-zA-Z0-9-]{1,128}$/;

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }
  const seed = typeof request.query.seed === "string" ? request.query.seed : "";
  if (!SEED_PATTERN.test(seed)) {
    response.status(400).json({ error: "A valid puzzle seed is required" });
    return;
  }
  try {
    const upstream = await fetch(`${YOKAIBA_URL}?${new URLSearchParams({ templateId: "tournament-order-v1", seed })}`);
    if (!upstream.ok) {
      response.status(502).json({ error: "Yokaiba is unavailable. Please try again." });
      return;
    }
    const contentType = upstream.headers.get("content-type");
    if (!contentType?.toLowerCase().includes("application/json")) {
      response.status(502).json({ error: "Invalid response from Yokaiba." });
      return;
    }
    const body: unknown = await upstream.json();
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-type", "application/json");
    response.status(200).json(body);
  } catch {
    response.status(502).json({ error: "Yokaiba is unavailable. Please try again." });
  }
}
