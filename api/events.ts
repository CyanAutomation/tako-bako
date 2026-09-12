import type { VercelRequest, VercelResponse } from "@vercel/node";

const URL = "https://yokaiba.scheimann.workers.dev/v1/events";
const EVENTS = new Set(["puzzle_started", "puzzle_completed", "hint_used", "mistake", "puzzle_abandoned"]);
const TEMPLATE_IDS = new Set(["tournament-order-v1", "tournament-order-v2", "open-division-v2", "championship-bridge-v1", "championship-circuit-v2"]);
const NUMBER_FIELDS = ["requestedDifficultyLevel", "assessedDifficultyLevel", "clueCount", "elapsedMs", "hintsUsed", "mistakes"] as const;

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "POST") { response.setHeader("allow", "POST"); response.status(405).json({ error: "Method not allowed" }); return; }
  const body = request.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) { response.status(400).json({ error: "A valid anonymous puzzle outcome is required" }); return; }
  const value = body as Record<string, unknown>;
  if (typeof value.event !== "string" || !EVENTS.has(value.event) || typeof value.templateId !== "string" || !TEMPLATE_IDS.has(value.templateId)) { response.status(400).json({ error: "A valid anonymous puzzle outcome is required" }); return; }
  const event: Record<string, unknown> = { event: value.event, templateId: value.templateId };
  for (const field of NUMBER_FIELDS) {
    const candidate = value[field];
    if (candidate === undefined) continue;
    const difficulty = field === "requestedDifficultyLevel" || field === "assessedDifficultyLevel";
    const maximum = difficulty ? 12 : field === "elapsedMs" ? 86_400_000 : 100;
    if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate < (difficulty ? 1 : 0) || candidate > maximum) { response.status(400).json({ error: "A valid anonymous puzzle outcome is required" }); return; }
    event[field] = candidate;
  }
  try {
    const upstream = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(8_000) });
    response.status(upstream.status).json(upstream.headers.get("content-type")?.includes("application/json") ? await upstream.json() : { accepted: false });
  } catch { response.status(202).json({ accepted: false }); }
}
