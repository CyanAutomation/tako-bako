import { CACHE_TTL_MS, savePuzzleToCache, type SessionStorageLike } from "./core";

const MAX_GENERATED_AT_CLOCK_SKEW_MS = 60 * 1_000;
const PUZZLE_GENERATED_AT_HEADER = "x-tako-bako-generated-at";

export interface PuzzleCacheRequest {
  readonly seed: string;
  readonly difficultyLevel: number | undefined;
  readonly templateId: string;
}

/**
 * Derives the browser-cache deadline from the generation time attached by our API.
 * Missing, malformed, stale, or implausibly future metadata is deliberately not
 * cacheable. A small future tolerance avoids disabling caching for clock skew.
 */
export function puzzleResponseExpiry(headers: Pick<Headers, "get"> | undefined, now = Date.now()): number | undefined {
  if (!headers) return undefined;
  const rawGeneratedAt = headers.get(PUZZLE_GENERATED_AT_HEADER);
  if (!rawGeneratedAt || !/^\d+$/.test(rawGeneratedAt)) return undefined;
  const generatedAt = Number(rawGeneratedAt);
  if (!Number.isSafeInteger(generatedAt) || generatedAt > now + MAX_GENERATED_AT_CLOCK_SKEW_MS) return undefined;
  const expiresAt = generatedAt + CACHE_TTL_MS;
  return expiresAt > now ? Math.min(expiresAt, now + CACHE_TTL_MS) : undefined;
}

/** Stores a response only while its request is current, using that request's immutable identity. */
export function savePuzzleResponseToCache<T>(storage: SessionStorageLike, request: PuzzleCacheRequest, value: T, expiresAt: number | undefined, isCurrent: boolean, now = Date.now()): void {
  if (!isCurrent || expiresAt === undefined) return;
  savePuzzleToCache(storage, request.seed, request.difficultyLevel, value, expiresAt, now, request.templateId);
}
