import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseFeedbackPayload } from "../server/feedback-payload.js";
import { yokaibaApiOrigin } from "../server/yokaiba-origin.js";

const FEEDBACK_PATH = "/v1/feedback";
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

type ForwardedHeader = [name: string, value: string];

interface FeedbackProxyResult {
  status: number;
  body: Record<string, unknown>;
  metricOutcome: string;
  metricStatus: number;
  headers: ForwardedHeader[];
}

function feedbackProxyResult(
  status: number,
  body: Record<string, unknown>,
  metricOutcome: string,
  metricStatus = status,
  headers: ForwardedHeader[] = [],
): FeedbackProxyResult {
  return { status, body, metricOutcome, metricStatus, headers };
}

function forwardedHeaders(upstream: Response): ForwardedHeader[] {
  const headers: ForwardedHeader[] = [];
  const requestId = upstream.headers.get("x-request-id");
  if (requestId) headers.push(["x-yokaiba-request-id", requestId]);
  for (const name of ["ratelimit-limit", "ratelimit-policy", "ratelimit-remaining", "ratelimit-reset", "retry-after"]) {
    const value = upstream.headers.get(name);
    if (value) headers.push([name, value]);
  }
  return headers;
}

function applyForwardedHeaders(response: VercelResponse, headers: ForwardedHeader[]): void {
  for (const [name, value] of headers) response.setHeader(name, value);
}

function isTimeout(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: unknown }).name === "TimeoutError";
}

function isAcceptedResponse(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && "accepted" in body && body.accepted === true;
}

async function readUpstreamResponse(upstream: Response): Promise<FeedbackProxyResult> {
  const headers = forwardedHeaders(upstream);
  if (!upstream.ok) {
    const status = [400, 409, 429, 503].includes(upstream.status) ? upstream.status : 502;
    return feedbackProxyResult(status, sanitizedError(status), status === 429 ? "rate_limited" : "upstream_error", status, headers);
  }

  const body: unknown = await upstream.json().catch(() => undefined);
  if (!isAcceptedResponse(body)) return feedbackProxyResult(502, sanitizedError(502), "invalid_upstream_response", 502, headers);

  const duplicate = "duplicate" in body && body.duplicate === true;
  const status = upstream.status === 200 && duplicate ? 200 : 202;
  return feedbackProxyResult(status, { accepted: true, duplicate }, "accepted", upstream.status, headers);
}

async function submitFeedback(
  feedback: NonNullable<ReturnType<typeof parseFeedbackPayload>>,
  fetcher: typeof fetch,
  resolveYokaibaApiOrigin: typeof yokaibaApiOrigin,
): Promise<FeedbackProxyResult> {
  let upstreamUrl: string;
  try {
    upstreamUrl = `${resolveYokaibaApiOrigin()}${FEEDBACK_PATH}`;
  } catch {
    return feedbackProxyResult(500, { error: "Feedback is temporarily unavailable. Please try again." }, "configuration_error");
  }

  let upstream: Response;
  try {
    upstream = await fetcher(upstreamUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(feedback),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = isTimeout(error);
    const status = timedOut ? 504 : 502;
    const body = {
      error: timedOut ? "Yokaiba took too long to respond. Please try again." : "Yokaiba is unavailable. Please try again.",
    };
    return feedbackProxyResult(status, body, timedOut ? "timeout" : "upstream_error");
  }

  return readUpstreamResponse(upstream);
}

export async function handleFeedbackRequest(
  request: VercelRequest,
  response: VercelResponse,
  fetcher: typeof fetch = fetch,
  resolveYokaibaApiOrigin: typeof yokaibaApiOrigin = yokaibaApiOrigin,
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
  const result = await submitFeedback(feedback, fetcher, resolveYokaibaApiOrigin);
  applyForwardedHeaders(response, result.headers);
  response.status(result.status).json(result.body);
  logMetric(result.metricOutcome, result.metricStatus, startedAt);
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  await handleFeedbackRequest(request, response);
}

export const config = {
  api: { bodyParser: { sizeLimit: "4kb" } },
};
