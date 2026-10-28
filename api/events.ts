import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseEventPayload } from "../server/event-payload.js";
import { yokaibaApiOrigin } from "../server/yokaiba-origin.js";

const URL = `${yokaibaApiOrigin()}/v1/events`;
const RATE_LIMIT_HEADERS = [
  "ratelimit-limit",
  "ratelimit-policy",
  "ratelimit-remaining",
  "ratelimit-reset",
  "retry-after",
] as const;

export async function handleEventsRequest(
  request: VercelRequest,
  response: VercelResponse,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  response.setHeader("cache-control", "no-store");
  if (request.method !== "POST") { response.setHeader("allow", "POST"); response.status(405).json({ error: "Method not allowed" }); return; }
  const event = parseEventPayload(request.body);
  if (!event) { response.status(400).json({ error: "A valid anonymous puzzle outcome is required" }); return; }
  try {
    const upstream = await fetcher(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(8_000) });
    for (const header of RATE_LIMIT_HEADERS) {
      const value = upstream.headers.get(header);
      if (value) response.setHeader(header, value);
    }
    const requestId = upstream.headers.get("x-request-id");
    if (requestId) response.setHeader("x-yokaiba-request-id", requestId);
    response.status(upstream.status).json(upstream.headers.get("content-type")?.includes("application/json") ? await upstream.json() : { accepted: false });
  } catch { response.status(202).json({ accepted: false }); }
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  await handleEventsRequest(request, response);
}

export const config = {
  api: { bodyParser: { sizeLimit: "4kb" } },
};
