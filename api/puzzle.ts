import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CACHE_FRESH_LIFETIME_SECONDS, CACHE_STALE_WHILE_REVALIDATE_LIFETIME_SECONDS } from "../src/cache-policy.js";
import { DEFAULT_SCENARIO_ID, isScenarioId } from "../src/scenarios.js";
import { DIFFICULTY_LEVEL_PATTERN, isValidSeed } from "../src/puzzle-input.js";
import { yokaibaGenerateParams, YOKAIBA_GENERATE_URL, YOKAIBA_ORIGIN } from "../src/yokaiba.js";

const YOKAIBA_VERIFY_URL = `${YOKAIBA_ORIGIN}/v1/puzzles/verify`;

const MAX_TOKEN_LENGTH = 16_384;
const MAX_ASSIGNMENTS = 32;
const MAX_VALUES_PER_ASSIGNMENT = 32;
const MAX_ANSWER_STRING_LENGTH = 256;
const UPSTREAM_TIMEOUT_MS = 8_000;
const PUZZLE_CACHE_CONTROL = `public, max-age=0, s-maxage=${CACHE_FRESH_LIFETIME_SECONDS}, stale-while-revalidate=${CACHE_STALE_WHILE_REVALIDATE_LIFETIME_SECONDS}`;
const PUZZLE_CACHE_POLICY = `edge-${CACHE_FRESH_LIFETIME_SECONDS / 60}m-swr-${CACHE_STALE_WHILE_REVALIDATE_LIFETIME_SECONDS / (60 * 60)}h`;
const PUZZLE_GENERATED_AT_HEADER = "x-tako-bako-generated-at";

type Operation = "generate" | "verify";

function preventCaching(response: VercelResponse): void {
  response.setHeader("cache-control", "no-store");
}

function logMetric(operation: Operation, outcome: string, status: number, startedAt: number, details: Record<string, unknown> = {}): void {
  console.info("tako_bako_api_metric", {
    operation,
    outcome,
    status,
    durationMs: Date.now() - startedAt,
    ...details,
  });
}

interface Completion {
  puzzleToken: string;
  answer: { assignments: Record<string, string[]> };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAssignmentValues(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_VALUES_PER_ASSIGNMENT) return undefined;
  if (!value.every(item => typeof item === "string" && item.length > 0 && item.length <= MAX_ANSWER_STRING_LENGTH)) return undefined;
  return [...value];
}

function parseAssignments(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > MAX_ASSIGNMENTS) return undefined;
  const assignments: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const [category, assignedValues] of entries) {
    if (category.length === 0 || category.length > MAX_ANSWER_STRING_LENGTH) return undefined;
    const values = parseAssignmentValues(assignedValues);
    if (!values) return undefined;
    assignments[category] = values;
  }
  return assignments;
}

function parseCompletion(value: unknown): Completion | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.puzzleToken !== "string" || value.puzzleToken.length === 0 || value.puzzleToken.length > MAX_TOKEN_LENGTH) return undefined;
  if (!isRecord(value.answer)) return undefined;
  const assignments = parseAssignments(value.answer.assignments);
  if (!assignments) return undefined;
  return { puzzleToken: value.puzzleToken, answer: { assignments } };
}

function isJson(response: Response): boolean {
  return response.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

function isTimeoutError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: unknown }).name === "TimeoutError";
}

async function fetchYokaiba(url: string, init?: RequestInit): Promise<{ response: Response; retryCount: number }> {
  const request = () => fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  let response = await request();
  let retryCount = 0;
  // A Cloudflare Worker can occasionally return a transient 5xx while an
  // otherwise healthy deployment is generating a dense targeted puzzle.
  // Retry once only; client-visible rate limits and deterministic 4xx errors
  // must remain single-attempt responses.
  if (response.status >= 500 && response.status <= 599) {
    retryCount = 1;
    response = await request();
  }
  return { response, retryCount };
}

function upstreamFailure(response: VercelResponse, operation: Operation, error: unknown, startedAt: number): void {
  const timedOut = isTimeoutError(error);
  console.error("yokaiba_request_failed", { operation, timedOut, error: error instanceof Error ? error.message : String(error) });
  const status = timedOut ? 504 : 502;
  logMetric(operation, timedOut ? "timeout" : "upstream_error", status, startedAt);
  preventCaching(response);
  response.status(status).json({ error: timedOut ? "Yokaiba took too long to respond. Please try again." : "Yokaiba is unavailable. Please try again." });
}

async function forwardRateLimit(upstream: Response, response: VercelResponse, operation: Operation, startedAt: number): Promise<boolean> {
  if (upstream.status !== 429) return false;
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) response.setHeader("retry-after", retryAfter);
  preventCaching(response);
  let body: unknown = { error: "Too many dojo requests. Please wait a moment, then try again." };
  if (isJson(upstream)) {
    try {
      body = await upstream.json();
    } catch {
      // Preserve a useful 429 response when the upstream JSON is malformed.
    }
  }
  response.status(429).json(body);
  logMetric(operation, "rate_limited", 429, startedAt);
  return true;
}

function forwardUpstreamRequestId(upstream: Response, response: VercelResponse): void {
  const requestId = upstream.headers.get("x-request-id");
  if (requestId) response.setHeader("x-yokaiba-request-id", requestId);
}

function forwardEtag(upstream: Response, response: VercelResponse): void {
  const etag = upstream.headers.get("etag");
  if (etag) response.setHeader("etag", etag);
}

/** Preserve standard quota signals when Yokaiba can provide them. */
function forwardRateLimitHeaders(upstream: Response, response: VercelResponse): void {
  for (const header of ["ratelimit-limit", "ratelimit-policy", "ratelimit-remaining", "ratelimit-reset"]) {
    const value = upstream.headers.get(header);
    if (value) response.setHeader(header, value);
  }
}

function availableDifficultyLevels(body: unknown): number[] | undefined {
  if (!isRecord(body)) return undefined;
  const levels = body.availableDifficultyLevels;
  if (!Array.isArray(levels) || !levels.every(level => typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 12)) return undefined;
  return [...new Set(levels)].sort((left, right) => left - right);
}

function isDifficultyUnavailable(body: unknown): body is Record<string, unknown> {
  return isRecord(body) && isRecord(body.error) && body.error.code === "difficulty_unavailable";
}

async function forwardDifficultyUnavailable(upstream: Response, response: VercelResponse, startedAt: number): Promise<boolean> {
  if (upstream.status !== 422 || !isJson(upstream)) return false;
  let body: unknown;
  try {
    // Inspect a clone so callers can still handle an unrecognized 422 response.
    body = await upstream.clone().json();
  } catch {
    return false;
  }
  if (!isDifficultyUnavailable(body)) return false;
  const levels = availableDifficultyLevels(body);
  preventCaching(response);
  response.status(422).json({
    code: "difficulty_unavailable",
    error: "This seed cannot produce the selected difficulty. Try another puzzle.",
    ...(levels ? { availableDifficultyLevels: levels } : {}),
  });
  logMetric("generate", "difficulty_unavailable", 422, startedAt);
  return true;
}

async function handleVerification(body: unknown, response: VercelResponse): Promise<void> {
  const startedAt = Date.now();
  // Verification results depend on submitted answers and must never be cached.
  preventCaching(response);
  const completion = parseCompletion(body);
  if (!completion) {
    response.status(400).json({ error: "A complete signed answer is required" });
    logMetric("verify", "invalid_request", 400, startedAt);
    return;
  }
  try {
    const { response: upstream } = await fetchYokaiba(YOKAIBA_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(completion),
    });
    forwardUpstreamRequestId(upstream, response);
    forwardRateLimitHeaders(upstream, response);
    if (await forwardRateLimit(upstream, response, "verify", startedAt)) return;
    if (!upstream.ok || !isJson(upstream)) {
      response.status(502).json({ error: "Yokaiba could not verify this puzzle. Please try again." });
      logMetric("verify", "invalid_upstream_response", 502, startedAt, { upstreamStatus: upstream.status });
      return;
    }
    response.status(200).json(await upstream.json());
    logMetric("verify", "success", 200, startedAt);
  } catch (error) {
    upstreamFailure(response, "verify", error, startedAt);
  }
}

interface GenerationParameters {
  seed: string;
  templateId: string;
  difficultyLevel?: string;
}

function invalidGenerationRequest(response: VercelResponse, startedAt: number, message: string): void {
  preventCaching(response);
  response.status(400).json({ error: message });
  logMetric("generate", "invalid_request", 400, startedAt);
}

function parseGenerationParameters(query: VercelRequest["query"], response: VercelResponse, startedAt: number): GenerationParameters | undefined {
  const seed = typeof query.seed === "string" ? query.seed : "";
  const templateId = typeof query.templateId === "string" ? query.templateId : DEFAULT_SCENARIO_ID;
  const difficultyLevel = typeof query.difficultyLevel === "string" ? query.difficultyLevel : undefined;
  if (!isValidSeed(seed)) {
    invalidGenerationRequest(response, startedAt, "A valid puzzle seed is required");
    return;
  }
  if (!isScenarioId(templateId)) {
    invalidGenerationRequest(response, startedAt, "An available puzzle scenario is required");
    return;
  }
  if (difficultyLevel !== undefined && !DIFFICULTY_LEVEL_PATTERN.test(difficultyLevel)) {
    invalidGenerationRequest(response, startedAt, "A difficulty level from 1 to 12 is required");
    return;
  }
  return { seed, templateId, difficultyLevel };
}

async function forwardGeneratedPuzzle(parameters: GenerationParameters, response: VercelResponse, startedAt: number): Promise<void> {
  try {
    const { response: upstream, retryCount } = await fetchYokaiba(`${YOKAIBA_GENERATE_URL}?${yokaibaGenerateParams(parameters.templateId, parameters.seed, parameters.difficultyLevel)}`);
    forwardUpstreamRequestId(upstream, response);
    forwardEtag(upstream, response);
    forwardRateLimitHeaders(upstream, response);
    if (await forwardRateLimit(upstream, response, "generate", startedAt)) return;
    if (await forwardDifficultyUnavailable(upstream, response, startedAt)) return;
    if (!upstream.ok) {
      preventCaching(response);
      response.status(502).json({ error: "Yokaiba is unavailable. Please try again." });
      logMetric("generate", "invalid_upstream_response", 502, startedAt, { upstreamStatus: upstream.status });
      return;
    }
    if (!isJson(upstream)) {
      preventCaching(response);
      response.status(502).json({ error: "Invalid response from Yokaiba." });
      logMetric("generate", "invalid_upstream_response", 502, startedAt, { upstreamStatus: upstream.status });
      return;
    }
    const body: unknown = await upstream.json();
    response.setHeader(PUZZLE_GENERATED_AT_HEADER, String(Date.now()));
    response.setHeader("cache-control", PUZZLE_CACHE_CONTROL);
    response.setHeader("cdn-cache-control", PUZZLE_CACHE_CONTROL);
    response.setHeader("vercel-cdn-cache-control", PUZZLE_CACHE_CONTROL);
    response.setHeader("x-tako-bako-cache-policy", PUZZLE_CACHE_POLICY);
    response.setHeader("server-timing", `yokaiba;dur=${Date.now() - startedAt}`);
    response.setHeader("content-type", "application/json");
    response.status(200).json(body);
    logMetric("generate", "success", 200, startedAt, { retryCount });
  } catch (error) {
    upstreamFailure(response, "generate", error, startedAt);
  }
}

async function handleGeneration(query: VercelRequest["query"], response: VercelResponse): Promise<void> {
  const startedAt = Date.now();
  const parameters = parseGenerationParameters(query, response, startedAt);
  if (parameters) await forwardGeneratedPuzzle(parameters, response, startedAt);
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("allow", "GET, POST");
    preventCaching(response);
    response.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (request.method === "POST") {
    await handleVerification(request.body, response);
    return;
  }
  await handleGeneration(request.query, response);
}
