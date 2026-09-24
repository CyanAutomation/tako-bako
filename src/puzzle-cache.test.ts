import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadPuzzleFromCache, puzzleCacheKey, savePuzzleResponseToCache, savePuzzleToCache, type PuzzleCacheRequest } from "./puzzle-cache";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe("puzzle session cache", () => {
  it("separates puzzle variants by seed and difficulty", () => {
    assert.notStrictEqual(puzzleCacheKey("dojo-day", undefined), puzzleCacheKey("dojo-day", 3));
    assert.notStrictEqual(puzzleCacheKey("dojo-day", 3), puzzleCacheKey("dojo-night", 3));
  });

  it("returns a cached value within its five-minute lifetime", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "dojo-day", 3, { id: "puzzle-1" }, 10_000);

    assert.deepStrictEqual(loadPuzzleFromCache<{ id: string }>(storage, "dojo-day", 3, 10_000 + 299_999), { id: "puzzle-1" });
  });

  it("keeps a cached value through its expiration timestamp", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "dojo-day", undefined, { id: "puzzle-1" }, 10_000);

    assert.deepStrictEqual(loadPuzzleFromCache(storage, "dojo-day", undefined, 10_000 + 300_000), { id: "puzzle-1" });
  });

  it("expires and removes stale or malformed cache entries", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "dojo-day", undefined, { id: "puzzle-1" }, 10_000);
    assert.strictEqual(loadPuzzleFromCache(storage, "dojo-day", undefined, 10_000 + 300_001), undefined);
    assert.strictEqual(storage.getItem(puzzleCacheKey("dojo-day", undefined)), null);

    storage.setItem(puzzleCacheKey("bad", undefined), "not json");
    assert.strictEqual(loadPuzzleFromCache(storage, "bad", undefined, 10_000), undefined);
    assert.strictEqual(storage.getItem(puzzleCacheKey("bad", undefined)), null);
  });

  it("keeps identically seeded scenarios in separate cache entries", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "shared-seed", 5, { id: "tournament" }, 10_000, "tournament-order-v1");
    savePuzzleToCache(storage, "shared-seed", 5, { id: "championship" }, 10_000, "championship-circuit-v1");

    assert.deepStrictEqual(loadPuzzleFromCache(storage, "shared-seed", 5, 10_001, "tournament-order-v1"), { id: "tournament" });
    assert.deepStrictEqual(loadPuzzleFromCache(storage, "shared-seed", 5, 10_001, "championship-circuit-v1"), { id: "championship" });
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

    assert.deepStrictEqual(loadPuzzleFromCache(storage, newerRequest.seed, newerRequest.difficultyLevel, 10_001, newerRequest.templateId), { id: "newer-puzzle" });
    assert.strictEqual(loadPuzzleFromCache(storage, olderRequest.seed, olderRequest.difficultyLevel, 10_001, olderRequest.templateId), undefined);
    const newerCacheEntry = storage.getItem(puzzleCacheKey(newerRequest.seed, newerRequest.difficultyLevel, newerRequest.templateId));
    assert.ok(newerCacheEntry !== null);
    assert.ok(!newerCacheEntry.includes("older-puzzle"));
    assert.strictEqual(storage.getItem(puzzleCacheKey(olderRequest.seed, olderRequest.difficultyLevel, olderRequest.templateId)), null);
  });
});
