import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseEventPayload } from "../server/event-payload.js";
import { clientAddressFromForwardedFor } from "../server/client-address.js";
import { reserveEventRequest, type EventRateLimitResult } from "../server/events-rate-limit.js";
import { yokaibaApiOrigin } from "../server/yokaiba-origin.js";

const URL = `${yokaibaApiOrigin()}/v1/events`;

export async function handleEventsRequest(
  request: VercelRequest,
  response: VercelResponse,
  fetcher: typeof fetch = fetch,
  reserve: (clientAddress: string | undefined) => Promise<EventRateLimitResult> = reserveEventRequest,
): Promise<void> {
  response.setHeader("cache-control", "no-store");
  if (request.method !== "POST") { response.setHeader("allow", "POST"); response.status(405).json({ error: "Method not allowed" }); return; }
  const event = parseEventPayload(request.body);
  if (!event) { response.status(400).json({ error: "A valid anonymous puzzle outcome is required" }); return; }
  const rateLimit = await reserve(clientAddressFromForwardedFor(request.headers?.["x-forwarded-for"]));
  if (rateLimit !== "allowed") {
    response.status(rateLimit === "limited" ? 429 : 503).json({ accepted: false });
    return;
  }
  try {
    const upstream = await fetcher(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(8_000) });
    response.status(upstream.status).json(upstream.headers.get("content-type")?.includes("application/json") ? await upstream.json() : { accepted: false });
  } catch { response.status(202).json({ accepted: false }); }
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  await handleEventsRequest(request, response);
}

export const config = {
  api: { bodyParser: { sizeLimit: "4kb" } },
};
