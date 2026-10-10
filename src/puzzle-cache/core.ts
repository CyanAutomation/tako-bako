import { CACHE_FRESH_LIFETIME_SECONDS } from "../cache-policy";

const CACHE_PREFIX = "tako-bako.puzzle.v2";
/** A puzzle must never be retained more than five minutes after it was generated. */
export const CACHE_TTL_MS = CACHE_FRESH_LIFETIME_SECONDS * 1_000;
const MAX_CACHE_ENTRIES = 20;
const OWNED_CACHE_PREFIX = `${CACHE_PREFIX}:`;

export interface SessionStorageLike {
  readonly length: number;
  getItem(key: string): string | null;
  key(index: number): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CachedPuzzle<T> {
  createdAt: number;
  expiresAt: number;
  value: T;
}

interface CacheEntryMetadata {
  key: string;
  createdAt: number;
}

function removeCacheEntry(storage: SessionStorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Storage access can fail (for example, in private browsing); cleanup is best-effort.
  }
}

function ownedCacheKeys(storage: SessionStorageLike): string[] {
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(OWNED_CACHE_PREFIX)) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

function createdAtForEntry(createdAt: unknown, expiresAt: number): number {
  // Entries written before createdAt was introduced remain eligible for bounded cleanup.
  return typeof createdAt === "number" ? createdAt : expiresAt - CACHE_TTL_MS;
}

function inspectOwnedEntry(storage: SessionStorageLike, key: string, now: number): CacheEntryMetadata | undefined {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("Malformed cache entry");
    const entry = parsed as Partial<CachedPuzzle<unknown>>;
    if (typeof entry.expiresAt !== "number" || entry.expiresAt <= now || !("value" in entry)) {
      removeCacheEntry(storage, key);
      return undefined;
    }
    return { key, createdAt: createdAtForEntry(entry.createdAt, entry.expiresAt) };
  } catch {
    removeCacheEntry(storage, key);
    return undefined;
  }
}

function inspectOwnedEntries(storage: SessionStorageLike, now: number, excludedKey?: string): CacheEntryMetadata[] {
  const entries: CacheEntryMetadata[] = [];
  for (const key of ownedCacheKeys(storage)) {
    if (key === excludedKey) continue;
    const entry = inspectOwnedEntry(storage, key, now);
    if (entry) entries.push(entry);
  }
  return entries.sort((left, right) => left.createdAt - right.createdAt || left.key.localeCompare(right.key));
}

function maintainCache(storage: SessionStorageLike, now: number, excludedKey: string): CacheEntryMetadata[] {
  const entries = inspectOwnedEntries(storage, now, excludedKey);
  const excess = Math.max(0, entries.length - (MAX_CACHE_ENTRIES - 1));
  for (const entry of entries.slice(0, excess)) removeCacheEntry(storage, entry.key);
  return entries.slice(excess);
}

/** Returns the stable session-cache key for one shareable puzzle variant. */
export function puzzleCacheKey(seed: string, difficulty: number | undefined, templateId = "tournament-order-v1"): string {
  return `${CACHE_PREFIX}:${templateId}:${seed}:${difficulty ?? "any"}`;
}

/** Reads a short-lived parsed puzzle, removing entries that cannot be trusted. */
export function loadPuzzleFromCache<T>(storage: SessionStorageLike, seed: string, difficulty: number | undefined, now = Date.now(), templateId = "tournament-order-v1"): T | undefined {
  const key = puzzleCacheKey(seed, difficulty, templateId);
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Malformed cache entry");
    const entry = value as Partial<CachedPuzzle<T>>;
    if (typeof entry.expiresAt !== "number" || entry.expiresAt <= now || !("value" in entry)) throw new TypeError("Expired cache entry");
    return entry.value as T;
  } catch {
    removeCacheEntry(storage, key);
    return undefined;
  }
}

/** Stores only deterministic puzzle data for the lifetime of the edge response. */
export function savePuzzleToCache<T>(storage: SessionStorageLike, seed: string, difficulty: number | undefined, value: T, expiresAt: number, now = Date.now(), templateId = "tournament-order-v1"): void {
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return;
  const boundedExpiresAt = Math.min(expiresAt, now + CACHE_TTL_MS);
  const key = puzzleCacheKey(seed, difficulty, templateId);
  let serialized: string;
  try {
    serialized = JSON.stringify({ createdAt: now, expiresAt: boundedExpiresAt, value } satisfies CachedPuzzle<T>);
  } catch {
    return;
  }
  const entries = maintainCache(storage, now, key);
  try {
    storage.setItem(key, serialized);
  } catch {
    // A quota can be tighter than the entry limit. Reclaim one owned entry and retry once.
    const oldest = entries[0] ?? inspectOwnedEntries(storage, now, key)[0];
    if (oldest) removeCacheEntry(storage, oldest.key);
    try {
      storage.setItem(key, serialized);
    } catch {
      // Private browsing or persistent quota failures should never block play.
    }
  }
}
