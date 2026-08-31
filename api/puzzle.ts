import type { VercelRequest, VercelResponse } from "@vercel/node";

const YOKAIBA_ORIGIN = "https://yokaiba.scheimann.workers.dev";
const YOKAIBA_GENERATE_URL = `${YOKAIBA_ORIGIN}/v1/puzzles/generate`;
const YOKAIBA_VERIFY_URL = `${YOKAIBA_ORIGIN}/v1/puzzles/verify`;
const SEED_PATTERN = /^[a-zA-Z0-9-]{1,128}$/;
const MAX_TOKEN_LENGTH = 16_384;
const MAX_ASSIGNMENTS = 32;
const MAX_VALUES_PER_ASSIGNMENT = 32;
const MAX_ANSWER_STRING_LENGTH = 256;
const UPSTREAM_TIMEOUT_MS = 8_000;
const PUZZLE_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";

interface Completion {
  puzzleToken: string;
  answer: { assignments: Record<string, string[]> };
}

function parseCompletion(value: unknown): Completion | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const completion = value as Record<string, unknown>;
  if (typeof completion.puzzleToken !== "string" || completion.puzzleToken.length === 0 || completion.puzzleToken.length > MAX_TOKEN_LENGTH) return undefined;
  if (!completion.answer || typeof completion.answer !== "object" || Array.isArray(completion.answer)) return undefined;
  const answer = completion.answer as Record<string, unknown>;
  if (!answer.assignments || typeof answer.assignments !== "object" || Array.isArray(answer.assignments)) return undefined;
  const entries = Object.entries(answer.assignments);
  if (entries.length === 0 || entries.length > MAX_ASSIGNMENTS) return undefined;
  const assignments: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const [category, assignedValues] of entries) {
    if (category.length === 0 || category.length > MAX_ANSWER_STRING_LENGTH || !Array.isArray(assignedValues) || assignedValues.length === 0 || assignedValues.length > MAX_VALUES_PER_ASSIGNMENT) return undefined;
    if (!assignedValues.every(item => typeof item === "string" && item.length > 0 && item.length <= MAX_ANSWER_STRING_LENGTH)) return undefined;
    assignments[category] = [...assignedValues];
  }
  return { puzzleToken: completion.puzzleToken, answer: { assignments } };
}

function isJson(response: Response): boolean {
  return response.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

function isTimeoutError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: unknown }).name === "TimeoutError";
}

async function fetchYokaiba(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
}

function upstreamFailure(response: VercelResponse, operation: "generate" | "verify", error: unknown): void {
  const timedOut = isTimeoutError(error);
  console.error("yokaiba_request_failed", { operation, timedOut, error: error instanceof Error ? error.message : String(error) });
  response.status(timedOut ? 504 : 502).json({ error: timedOut ? "Yokaiba took too long to respond. Please try again." : "Yokaiba is unavailable. Please try again." });
}

async function forwardRateLimit(upstream: Response, response: VercelResponse): Promise<boolean> {
  if (upstream.status !== 429) return false;
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) response.setHeader("retry-after", retryAfter);
  response.setHeader("cache-control", "no-store");
  let body: unknown = { error: "Too many dojo requests. Please wait a moment, then try again." };
  if (isJson(upstream)) {
    try {
      body = await upstream.json();
    } catch {
      // Preserve a useful 429 response when the upstream JSON is malformed.
    }
  }
  response.status(429).json(body);
  return true;
}

function forwardUpstreamRequestId(upstream: Response, response: VercelResponse): void {
  const requestId = upstream.headers.get("x-request-id");
  if (requestId) response.setHeader("x-yokaiba-request-id", requestId);
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("allow", "GET, POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (request.method === "POST") {
    const completion = parseCompletion(request.body);
    if (!completion) {
      response.status(400).json({ error: "A complete signed answer is required" });
      return;
    }
    try {
      const upstream = await fetchYokaiba(YOKAIBA_VERIFY_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(completion),
      });
      forwardUpstreamRequestId(upstream, response);
      if (await forwardRateLimit(upstream, response)) return;
      if (!upstream.ok || !isJson(upstream)) {
        response.status(502).json({ error: "Yokaiba could not verify this puzzle. Please try again." });
        return;
      }
      response.setHeader("cache-control", "no-store");
      response.status(200).json(await upstream.json());
    } catch (error) {
      upstreamFailure(response, "verify", error);
    }
    return;
  }
  const seed = typeof request.query.seed === "string" ? request.query.seed : "";
  const difficultyLevel = typeof request.query.difficultyLevel === "string" ? request.query.difficultyLevel : undefined;
  if (!SEED_PATTERN.test(seed)) {
    response.status(400).json({ error: "A valid puzzle seed is required" });
    return;
  }
  if (difficultyLevel !== undefined && !/^[1-5]$/.test(difficultyLevel)) {
    response.status(400).json({ error: "A difficulty level from 1 to 5 is required" });
    return;
  }
  try {
    const parameters = new URLSearchParams({ templateId: "tournament-order-v1", seed });
    if (difficultyLevel) parameters.set("difficultyLevel", difficultyLevel);
    const upstream = await fetchYokaiba(`${YOKAIBA_GENERATE_URL}?${parameters}`);
    forwardUpstreamRequestId(upstream, response);
    if (await forwardRateLimit(upstream, response)) return;
    if (!upstream.ok) {
      response.status(502).json({ error: "Yokaiba is unavailable. Please try again." });
      return;
    }
    if (!isJson(upstream)) {
      response.status(502).json({ error: "Invalid response from Yokaiba." });
      return;
    }
    const body: unknown = await upstream.json();
    response.setHeader("cache-control", PUZZLE_CACHE_CONTROL);
    response.setHeader("cdn-cache-control", PUZZLE_CACHE_CONTROL);
    response.setHeader("vercel-cdn-cache-control", PUZZLE_CACHE_CONTROL);
    response.setHeader("content-type", "application/json");
    response.status(200).json(body);
  } catch (error) {
    upstreamFailure(response, "generate", error);
  }
}
