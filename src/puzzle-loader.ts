import { loadPuzzleFromCache, puzzleCacheKey, puzzleResponseExpiry, savePuzzleResponseToCache, type PuzzleCacheRequest, type SessionStorageLike } from "./puzzle-cache";
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

async function failureForResponse(response: Response): Promise<Error> {
  if (response.status === 422) {
    const body = await response.json().catch(() => undefined) as { availableDifficultyLevels?: unknown } | undefined;
    return new DifficultyUnavailableError(availableDifficultyLevels(body?.availableDifficultyLevels));
  }
  if (response.status === 429) return new Error(retryAfterMessage(response.headers.get("retry-after")));
  return new Error("The puzzle could not be collected. Please try again.");
}

async function requestPuzzle(request: PuzzleLoadRequest, dependencies: PuzzleLoaderDependencies): Promise<Puzzle> {
  const query = new URLSearchParams({
    seed: request.seed,
    templateId: request.templateId,
    ...(request.difficultyLevel ? { difficultyLevel: String(request.difficultyLevel) } : {}),
  });
  const response = await (dependencies.fetcher ?? fetch)(`/api/puzzle?${query}`, { signal: dependencies.signal });
  if (!response.ok) throw await failureForResponse(response);

  try {
    const puzzle = parsePuzzle(await response.json());
    const now = dependencies.now?.() ?? Date.now();
    const expiresAt = puzzleResponseExpiry(response.headers, now);
    savePuzzleResponseToCache(dependencies.storage, request, puzzle, expiresAt, dependencies.isCurrent(), now);
    return puzzle;
  } catch (error) {
    console.error("tako_bako_client_metric", { event: "puzzle_parse_failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/** Loads and validates a puzzle, preferring the current session cache entry. */
export async function loadPuzzle(request: PuzzleLoadRequest, dependencies: PuzzleLoaderDependencies): Promise<Puzzle> {
  const now = dependencies.now?.() ?? Date.now();
  const cached = loadCachedPuzzle(request, dependencies, now);
  if (cached) return cached;
  return requestPuzzle(request, dependencies);
}
