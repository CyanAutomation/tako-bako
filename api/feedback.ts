import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseFeedbackPayload } from "../server/feedback-payload.js";
import { yokaibaApiOrigin } from "../server/yokaiba-origin.js";

const URL = `${yokaibaApiOrigin()}/v1/feedback`;
const UPSTREAM_TIMEOUT_MS = 8_000;

function noStore(response: VercelResponse): void {
  response.setHeader("cache-control", "no-store");
}

function logMetric(outcome: string, status: number, startedAt: number): void {
  console.info("tako_bako_api_metric", { operation: "feedback", outcome, status, durationMs: Math.max(0, Date.now() - startedAt) });
}

function sanitizedError(status: number): { error: string } {
  if (status === 429) return { error: "Too many feedback submissions. Please wait a moment, then try again." };
  if (status === 409) return { error: "This feedback was already submitted with different details." };
  if (status === 503) return { error: "Feedback storage is temporarily unavailable. Please try again." };
  if (status === 400) return { error: "The feedback submission was not accepted. Please refresh the puzzle and try again." };
  return { error: "Feedback could not be sent. Please try again." };
}

export async function handleFeedbackRequest(
  request: VercelRequest,
  response: VercelResponse,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const startedAt = Date.now();
  noStore(response);
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }
  const feedback = parseFeedbackPayload(request.body);
  if (!feedback) {
    response.status(400).json({ error: "A valid anonymous puzzle difficulty rating is required" });
    logMetric("invalid_request", 400, startedAt);
    return;
  }
  try {
    const upstream = await fetcher(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(feedback),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const requestId = upstream.headers.get("x-request-id");
    if (requestId) response.setHeader("x-yokaiba-request-id", requestId);
    for (const header of ["ratelimit-limit", "ratelimit-policy", "ratelimit-remaining", "ratelimit-reset", "retry-after"]) {
      const value = upstream.headers.get(header);
      if (value) response.setHeader(header, value);
    }
    if (!upstream.ok) {
      const status = [400, 409, 429, 503].includes(upstream.status) ? upstream.status : 502;
      response.status(status).json(sanitizedError(status));
      logMetric(status === 429 ? "rate_limited" : "upstream_error", status, startedAt);
      return;
    }
    const body: unknown = await upstream.json().catch(() => undefined);
    if (typeof body !== "object" || body === null || !("accepted" in body) || body.accepted !== true) {
      response.status(502).json(sanitizedError(502));
      logMetric("invalid_upstream_response", 502, startedAt);
      return;
    }
    const duplicate = "duplicate" in body && body.duplicate === true;
    response.status(upstream.status === 200 && duplicate ? 200 : 202).json({ accepted: true, duplicate });
    logMetric("accepted", upstream.status, startedAt);
  } catch (error) {
    const timedOut = typeof error === "object" && error !== null && "name" in error && (error as { name?: unknown }).name === "TimeoutError";
    const status = timedOut ? 504 : 502;
    response.status(status).json({ error: timedOut ? "Yokaiba took too long to respond. Please try again." : "Yokaiba is unavailable. Please try again." });
    logMetric(timedOut ? "timeout" : "upstream_error", status, startedAt);
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  await handleFeedbackRequest(request, response);
}

export const config = {
  api: { bodyParser: { sizeLimit: "4kb" } },
};
