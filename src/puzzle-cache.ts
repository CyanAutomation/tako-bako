const CACHE_PREFIX = "tako-bako.puzzle.v1";
const CACHE_TTL_MS = 5 * 60 * 1_000;

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CachedPuzzle<T> {
  expiresAt: number;
  value: T;
}

/** Returns the stable session-cache key for one shareable puzzle variant. */
export function puzzleCacheKey(seed: string, difficulty: number | undefined): string {
  return `${CACHE_PREFIX}:${seed}:${difficulty ?? "any"}`;
}

/** Reads a short-lived parsed puzzle, removing entries that cannot be trusted. */
export function loadPuzzleFromCache<T>(storage: SessionStorageLike, seed: string, difficulty: number | undefined, now = Date.now()): T | undefined {
  const key = puzzleCacheKey(seed, difficulty);
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Malformed cache entry");
    const entry = value as Partial<CachedPuzzle<T>>;
    if (typeof entry.expiresAt !== "number" || entry.expiresAt <= now || !("value" in entry)) throw new TypeError("Expired cache entry");
    return entry.value as T;
  } catch {
    storage.removeItem(key);
    return undefined;
  }
}

/** Stores only deterministic puzzle data for the lifetime of the edge response. */
export function savePuzzleToCache<T>(storage: SessionStorageLike, seed: string, difficulty: number | undefined, value: T, now = Date.now()): void {
  try {
    storage.setItem(puzzleCacheKey(seed, difficulty), JSON.stringify({ expiresAt: now + CACHE_TTL_MS, value } satisfies CachedPuzzle<T>));
  } catch {
    // Private browsing or quota failures should never block play.
  }
}
