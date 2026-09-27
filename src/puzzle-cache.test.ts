import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadPuzzleFromCache, puzzleCacheKey, puzzleResponseExpiry, savePuzzleResponseToCache, savePuzzleToCache, type PuzzleCacheRequest } from "./puzzle-cache";

class MemoryStorage {
  protected readonly values = new Map<string, string>();

  get length(): number { return this.values.size; }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

class OneTimeQuotaFailureStorage extends MemoryStorage {
  failed = false;

  override setItem(key: string, value: string): void {
    if (!this.failed && key === puzzleCacheKey("new", undefined)) {
      this.failed = true;
      throw new Error("quota exceeded");
    }
    super.setItem(key, value);
  }
}

class ThrowingReadStorage extends MemoryStorage {
  override getItem(key: string): string | null {
    void key;
    throw new Error("read failed");
  }
}

class ThrowingRemovalStorage extends MemoryStorage {
  override removeItem(key: string): void {
    void key;
    throw new Error("cleanup failed");
  }
}

describe("puzzle session cache", () => {
  const headers = (generatedAt?: string) => ({
    get(name: string): string | null {
      return name === "x-tako-bako-generated-at" ? generatedAt ?? null : null;
    },
  });

  it("preserves only the remaining lifetime of a fresh edge response", () => {
    assert.strictEqual(puzzleResponseExpiry(headers("10000"), 70_000), 310_000);
  });

  it("does not cache a response served after its edge freshness lifetime", () => {
    assert.strictEqual(puzzleResponseExpiry(headers("10000"), 310_001), undefined);
  });

  it("does not cache a response whose freshness metadata is missing", () => {
    assert.strictEqual(puzzleResponseExpiry(headers(), 10_000), undefined);
  });

  it("bounds modest clock skew and rejects implausibly future or malformed timestamps", () => {
    assert.strictEqual(puzzleResponseExpiry(headers("20000"), 10_000), 310_000);
    assert.strictEqual(puzzleResponseExpiry(headers("70001"), 10_000), undefined);
    assert.strictEqual(puzzleResponseExpiry(headers("not-a-timestamp"), 10_000), undefined);
    assert.strictEqual(puzzleResponseExpiry(headers("1.5"), 10_000), undefined);
  });

  it("refuses expired deadlines and caps an excessive supplied deadline", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "expired", undefined, { id: "old" }, 10_000, 10_000);
    assert.strictEqual(storage.getItem(puzzleCacheKey("expired", undefined)), null);

    savePuzzleToCache(storage, "bounded", undefined, { id: "new" }, 1_000_000, 10_000);
    assert.deepStrictEqual(loadPuzzleFromCache(storage, "bounded", undefined, 310_000), { id: "new" });
    assert.strictEqual(loadPuzzleFromCache(storage, "bounded", undefined, 310_001), undefined);
  });

  it("separates puzzle variants by seed and difficulty", () => {
    assert.notStrictEqual(puzzleCacheKey("dojo-day", undefined), puzzleCacheKey("dojo-day", 3));
    assert.notStrictEqual(puzzleCacheKey("dojo-day", 3), puzzleCacheKey("dojo-night", 3));
  });

  it("returns a cached value within its five-minute lifetime", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "dojo-day", 3, { id: "puzzle-1" }, 310_000, 10_000);

    assert.deepStrictEqual(loadPuzzleFromCache<{ id: string }>(storage, "dojo-day", 3, 10_000 + 299_999), { id: "puzzle-1" });
  });

  it("keeps a cached value through its expiration timestamp", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "dojo-day", undefined, { id: "puzzle-1" }, 310_000, 10_000);

    assert.deepStrictEqual(loadPuzzleFromCache(storage, "dojo-day", undefined, 10_000 + 300_000), { id: "puzzle-1" });
  });

  it("expires and removes stale or malformed cache entries", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "dojo-day", undefined, { id: "puzzle-1" }, 310_000, 10_000);
    assert.strictEqual(loadPuzzleFromCache(storage, "dojo-day", undefined, 10_000 + 300_001), undefined);
    assert.strictEqual(storage.getItem(puzzleCacheKey("dojo-day", undefined)), null);

    storage.setItem(puzzleCacheKey("bad", undefined), "not json");
    assert.strictEqual(loadPuzzleFromCache(storage, "bad", undefined, 10_000), undefined);
    assert.strictEqual(storage.getItem(puzzleCacheKey("bad", undefined)), null);
  });

  it("prunes expired owned entries while saving", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "expired", undefined, { id: "old" }, 310_000, 10_000);

    savePuzzleToCache(storage, "fresh", undefined, { id: "new" }, 610_001, 310_001);

    assert.strictEqual(storage.getItem(puzzleCacheKey("expired", undefined)), null);
    assert.deepStrictEqual(loadPuzzleFromCache(storage, "fresh", undefined, 310_001), { id: "new" });
  });

  it("evicts the oldest owned entry when the cache reaches its maximum size", () => {
    const storage = new MemoryStorage();
    for (let index = 0; index < 21; index += 1) {
      savePuzzleToCache(storage, `seed-${index}`, undefined, { index }, 310_000 + index, 10_000 + index);
    }

    assert.strictEqual(storage.length, 20);
    assert.strictEqual(storage.getItem(puzzleCacheKey("seed-0", undefined)), null);
    assert.notStrictEqual(storage.getItem(puzzleCacheKey("seed-20", undefined)), null);
  });

  it("preserves unrelated session storage while maintaining the cache", () => {
    const storage = new MemoryStorage();
    storage.setItem("another-feature", "keep me");
    for (let index = 0; index < 21; index += 1) {
      savePuzzleToCache(storage, `seed-${index}`, undefined, { index }, 310_000 + index, 10_000 + index);
    }

    assert.strictEqual(storage.getItem("another-feature"), "keep me");
    assert.strictEqual(storage.length, 21);
  });

  it("prunes the oldest owned entry and retries once after a quota failure", () => {
    const storage = new OneTimeQuotaFailureStorage();
    savePuzzleToCache(storage, "old", undefined, { id: "old" }, 310_000, 10_000);

    savePuzzleToCache(storage, "new", undefined, { id: "new" }, 310_001, 10_001);

    assert.strictEqual(storage.failed, true);
    assert.strictEqual(storage.getItem(puzzleCacheKey("old", undefined)), null);
    assert.deepStrictEqual(loadPuzzleFromCache(storage, "new", undefined, 10_002), { id: "new" });
  });

  it("returns undefined when reading from storage throws", () => {
    const storage = new ThrowingReadStorage();

    assert.strictEqual(loadPuzzleFromCache(storage, "dojo-day", undefined, 10_000), undefined);
  });

  it("returns undefined when removing an invalid entry throws", () => {
    const storage = new ThrowingRemovalStorage();
    storage.setItem(puzzleCacheKey("bad", undefined), "not json");

    assert.strictEqual(loadPuzzleFromCache(storage, "bad", undefined, 10_000), undefined);
  });

  it("keeps identically seeded scenarios in separate cache entries", () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, "shared-seed", 5, { id: "tournament" }, 310_000, 10_000, "tournament-order-v1");
    savePuzzleToCache(storage, "shared-seed", 5, { id: "championship" }, 310_000, 10_000, "championship-circuit-v1");

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
      savePuzzleResponseToCache(storage, request, data, 310_000, fetchId === currentFetchId, 10_000);
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
