import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseEventPayload } from "./event-payload.js";

const URL = "https://yokaiba.scheimann.workers.dev/v1/events";

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "POST") { response.setHeader("allow", "POST"); response.status(405).json({ error: "Method not allowed" }); return; }
  const event = parseEventPayload(request.body);
  if (!event) { response.status(400).json({ error: "A valid anonymous puzzle outcome is required" }); return; }
  try {
    const upstream = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(8_000) });
    response.status(upstream.status).json(upstream.headers.get("content-type")?.includes("application/json") ? await upstream.json() : { accepted: false });
  } catch { response.status(202).json({ accepted: false }); }
}
