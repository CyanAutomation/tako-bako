import { loadPuzzleFromCache, puzzleCacheKey, type SessionStorageLike } from "./puzzle-cache/core";
import { puzzleResponseExpiry, savePuzzleResponseToCache, type PuzzleCacheRequest } from "./puzzle-cache/response";
import { parsePuzzle } from "./puzzle-parser";
import type { Puzzle } from "./puzzle";

export type PuzzleLoadRequest = PuzzleCacheRequest;

export interface PuzzleLoaderDependencies {
  storage: SessionStorageLike;
  signal: AbortSignal;
  isCurrent(): boolean;
  fetcher?: typeof fetch;
  now?: () => number;
}

const PUZZLE_SERVICE_UNAVAILABLE_MESSAGE = "The puzzle service couldn’t be reached. Please check your connection and try again.";
const GENERIC_PUZZLE_LOAD_ERROR = "The puzzle could not be collected. Please try again.";
const MAX_API_ERROR_MESSAGE_LENGTH = 240;

export class DifficultyUnavailableError extends Error {
  constructor(availableLevels: number[] = []) {
    super(availableLevels.length
      ? `This seed cannot produce the selected difficulty. It can make Level${availableLevels.length === 1 ? "" : "s"} ${availableLevels.join(", ")}. Try another puzzle.`
      : "This seed cannot produce the selected difficulty. Try another puzzle.");
  }
}

export function retryAfterMessage(value: string | null, now = Date.now()): string {
  if (!value) return "The dojo is busy. Please wait a moment, then try again.";
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return `The dojo is busy. Try again in ${Math.ceil(seconds)} second${Math.ceil(seconds) === 1 ? "" : "s"}.`;
  const retryAt = Date.parse(value);
  if (Number.isFinite(retryAt)) {
    const remaining = Math.max(1, Math.ceil((retryAt - now) / 1_000));
    return `The dojo is busy. Try again in ${remaining} second${remaining === 1 ? "" : "s"}.`;
  }
  return "The dojo is busy. Please wait a moment, then try again.";
}

function loadCachedPuzzle(request: PuzzleLoadRequest, dependencies: PuzzleLoaderDependencies, now: number): Puzzle | undefined {
  const cached = loadPuzzleFromCache<unknown>(dependencies.storage, request.seed, request.difficultyLevel, now, request.templateId);
  if (!cached) return undefined;
  try {
    return parsePuzzle(cached);
  } catch {
    dependencies.storage.removeItem(puzzleCacheKey(request.seed, request.difficultyLevel, request.templateId));
    return undefined;
  }
}

function availableDifficultyLevels(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every(level => typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 12)) return [];
  return [...new Set(value)].sort((left, right) => left - right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function failureForUnavailableDifficulty(response: Response): Promise<Error> {
  const body = await responseBody(response);
  const levels = isRecord(body) ? availableDifficultyLevels(body.availableDifficultyLevels) : [];
  return new DifficultyUnavailableError(levels);
}

function boundedApiError(body: unknown): Error | undefined {
  if (!isRecord(body)) return undefined;
  const message = body.error;
  if (typeof message !== "string" || message.trim().length === 0 || message.length > MAX_API_ERROR_MESSAGE_LENGTH) return undefined;
  return new Error(message.trim());
}

async function failureForServerError(response: Response): Promise<Error> {
  return boundedApiError(await responseBody(response)) ?? new Error(GENERIC_PUZZLE_LOAD_ERROR);
}

async function failureForResponse(response: Response): Promise<Error> {
  if (response.status === 422) return failureForUnavailableDifficulty(response);
  if (response.status === 429) return new Error(retryAfterMessage(response.headers.get("retry-after")));
  if (response.status >= 500) return failureForServerError(response);
  return new Error(GENERIC_PUZZLE_LOAD_ERROR);
}

function puzzleRequestUrl(request: PuzzleLoadRequest): string {
  const query = new URLSearchParams({
    seed: request.seed,
    templateId: request.templateId,
    ...(request.difficultyLevel ? { difficultyLevel: String(request.difficultyLevel) } : {}),
  });
  return `/api/puzzle?${query}`;
}

async function fetchPuzzleResponse(request: PuzzleLoadRequest, dependencies: PuzzleLoaderDependencies): Promise<Response> {
  const url = puzzleRequestUrl(request);
  try {
    return await (dependencies.fetcher ?? fetch)(url, { signal: dependencies.signal });
  } catch (error) {
    if (dependencies.signal.aborted) throw error;
    throw new Error(PUZZLE_SERVICE_UNAVAILABLE_MESSAGE);
  }
}

async function parseAndCachePuzzle(response: Response, request: PuzzleLoadRequest, dependencies: PuzzleLoaderDependencies): Promise<Puzzle> {
  try {
    const puzzle = await parsePuzzleFromResponse(response);
    const now = dependencies.now?.() ?? Date.now();
    const expiresAt = puzzleResponseExpiry(response.headers, now);
    savePuzzleResponseToCache(dependencies.storage, request, puzzle, expiresAt, dependencies.isCurrent(), now);
    return puzzle;
  } catch (error) {
    console.error("tako_bako_client_metric", { event: "puzzle_parse_failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function parsePuzzleFromResponse(response: Response): Promise<Puzzle> {
  return parsePuzzle(await response.json());
}

async function requestPuzzle(request: PuzzleLoadRequest, dependencies: PuzzleLoaderDependencies): Promise<Puzzle> {
  const response = await fetchPuzzleResponse(request, dependencies);
  if (!response.ok) throw await failureForResponse(response);
  return parseAndCachePuzzle(response, request, dependencies);
}

/** Loads and validates a puzzle, preferring the current session cache entry. */
export async function loadPuzzle(request: PuzzleLoadRequest, dependencies: PuzzleLoaderDependencies): Promise<Puzzle> {
  const now = dependencies.now?.() ?? Date.now();
  const cached = loadCachedPuzzle(request, dependencies, now);
  if (cached) return cached;
  return requestPuzzle(request, dependencies);
}
