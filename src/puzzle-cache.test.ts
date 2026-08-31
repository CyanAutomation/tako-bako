import { describe, expect, it } from "vitest";
import { loadPuzzleFromCache, puzzleCacheKey, savePuzzleToCache } from "./puzzle-cache";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe("puzzle session cache", () => {
  it("separates puzzle variants by seed and difficulty", () => {
    expect(puzzleCacheKey("dojo-day", undefined)).not.toBe(puzzleCacheKey("dojo-day", 3));
    expect(puzzleCacheKey("dojo-day", 3)).not.toBe(puzzleCacheKey("dojo-night", 3));
  });

  it("returns a cached value within its five-minute lifetime", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "dojo-day", 3, { id: "puzzle-1" }, 10_000);

    expect(loadPuzzleFromCache<{ id: string }>(storage, "dojo-day", 3, 10_000 + 299_999)).toEqual({ id: "puzzle-1" });
  });

  it("expires and removes stale or malformed cache entries", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "dojo-day", undefined, { id: "puzzle-1" }, 10_000);
    expect(loadPuzzleFromCache(storage, "dojo-day", undefined, 10_000 + 300_000)).toBeUndefined();
    expect(storage.getItem(puzzleCacheKey("dojo-day", undefined))).toBeNull();

    storage.setItem(puzzleCacheKey("bad", undefined), "not json");
    expect(loadPuzzleFromCache(storage, "bad", undefined, 10_000)).toBeUndefined();
    expect(storage.getItem(puzzleCacheKey("bad", undefined))).toBeNull();
  });
});
