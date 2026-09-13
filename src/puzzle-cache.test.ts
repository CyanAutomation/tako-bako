import { describe, expect, it } from "vitest";
import { loadPuzzleFromCache, puzzleCacheKey, savePuzzleResponseToCache, savePuzzleToCache, type PuzzleCacheRequest } from "./puzzle-cache";

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

  it("keeps a cached value through its expiration timestamp", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "dojo-day", undefined, { id: "puzzle-1" }, 10_000);

    expect(loadPuzzleFromCache(storage, "dojo-day", undefined, 10_000 + 300_000)).toEqual({ id: "puzzle-1" });
  });

  it("expires and removes stale or malformed cache entries", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "dojo-day", undefined, { id: "puzzle-1" }, 10_000);
    expect(loadPuzzleFromCache(storage, "dojo-day", undefined, 10_000 + 300_001)).toBeUndefined();
    expect(storage.getItem(puzzleCacheKey("dojo-day", undefined))).toBeNull();

    storage.setItem(puzzleCacheKey("bad", undefined), "not json");
    expect(loadPuzzleFromCache(storage, "bad", undefined, 10_000)).toBeUndefined();
    expect(storage.getItem(puzzleCacheKey("bad", undefined))).toBeNull();
  });

  it("keeps identically seeded scenarios in separate cache entries", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "shared-seed", 5, { id: "tournament" }, 10_000, "tournament-order-v1");
    savePuzzleToCache(storage, "shared-seed", 5, { id: "championship" }, 10_000, "championship-circuit-v1");

    expect(loadPuzzleFromCache(storage, "shared-seed", 5, 10_001, "tournament-order-v1")).toEqual({ id: "tournament" });
    expect(loadPuzzleFromCache(storage, "shared-seed", 5, 10_001, "championship-circuit-v1")).toEqual({ id: "championship" });
  });

  it("does not let an older overlapping response use a newer request's cache key", async () => {
    const storage = new MemoryStorage();
    let currentFetchId = 0;
    const deferred = <T>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>(done => { resolve = done; });
      return { promise, resolve };
    };
    const olderResponse = deferred<{ id: string }>();
    const newerResponse = deferred<{ id: string }>();

    const load = async (request: PuzzleCacheRequest, response: Promise<{ id: string }>) => {
      const fetchId = ++currentFetchId;
      const data = await response;
      savePuzzleResponseToCache(storage, request, data, fetchId === currentFetchId, 10_000);
    };
    const olderRequest = { seed: "shared", templateId: "tournament-order-v1", difficultyLevel: 2 } as const;
    const newerRequest = { seed: "shared", templateId: "championship-circuit-v1", difficultyLevel: 7 } as const;
    const olderLoad = load(olderRequest, olderResponse.promise);
    const newerLoad = load(newerRequest, newerResponse.promise);

    newerResponse.resolve({ id: "newer-puzzle" });
    await newerLoad;
    olderResponse.resolve({ id: "older-puzzle" });
    await olderLoad;

    expect(loadPuzzleFromCache(storage, newerRequest.seed, newerRequest.difficultyLevel, 10_001, newerRequest.templateId)).toEqual({ id: "newer-puzzle" });
    expect(loadPuzzleFromCache(storage, olderRequest.seed, olderRequest.difficultyLevel, 10_001, olderRequest.templateId)).toBeUndefined();
    expect(storage.getItem(puzzleCacheKey(newerRequest.seed, newerRequest.difficultyLevel, newerRequest.templateId))).not.toContain("older-puzzle");
    expect(storage.getItem(puzzleCacheKey(olderRequest.seed, olderRequest.difficultyLevel, olderRequest.templateId))).toBeNull();
  });
});
