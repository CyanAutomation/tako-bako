import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadPuzzle, DifficultyUnavailableError, retryAfterMessage, type PuzzleLoadRequest } from "./puzzle-loader";
import { loadPuzzleFromCache, savePuzzleToCache, type SessionStorageLike } from "./puzzle-cache";

class MemoryStorage implements SessionStorageLike {
  private readonly entries = new Map<string, string>();
  get length(): number { return this.entries.size; }
  getItem(key: string): string | null { return this.entries.get(key) ?? null; }
  key(index: number): string | null { return [...this.entries.keys()][index] ?? null; }
  setItem(key: string, value: string): void { this.entries.set(key, value); }
  removeItem(key: string): void { this.entries.delete(key); }
}

const request: PuzzleLoadRequest = { seed: "dojo-day", templateId: "tournament-order-v1", difficultyLevel: 2 };
const puzzle = {
  id: "puzzle-1", seed: "dojo-day", templateId: "tournament-order-v1", clues: [],
  difficulty: { level: 2, label: "Easy", modelVersion: "v1" },
  spec: { id: "tournament-order-v1", title: "Tournament Order", baseCategory: "person", categories: [
    { id: "person", label: "Person", values: ["Aki", "Ben"] },
    { id: "club", label: "Club", values: ["Lions", "Wolves"] },
  ] },
};

describe("loadPuzzle", () => {
  it("uses a validated cached puzzle without issuing a request", async () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, request.seed, request.difficultyLevel, puzzle, 20_000, 10_000, request.templateId);
    let calls = 0;

    const result = await loadPuzzle(request, {
      storage, signal: new AbortController().signal, isCurrent: () => true, now: () => 10_000,
      fetcher: async () => { calls += 1; throw new Error("unexpected request"); },
    });

    assert.strictEqual(result.id, "puzzle-1");
    assert.strictEqual(calls, 0);
  });

  it("discards an invalid cache value and stores the validated network response", async () => {
    const storage = new MemoryStorage();
    savePuzzleToCache(storage, request.seed, request.difficultyLevel, { id: "invalid" }, 20_000, 10_000, request.templateId);

    const result = await loadPuzzle(request, {
      storage, signal: new AbortController().signal, isCurrent: () => true, now: () => 10_000,
      fetcher: async () => new Response(JSON.stringify(puzzle), { status: 200, headers: { "x-tako-bako-generated-at": "10000" } }),
    });

    assert.strictEqual(result.id, "puzzle-1");
    assert.strictEqual(loadPuzzleFromCache<{ id: string }>(storage, request.seed, request.difficultyLevel, 10_000, request.templateId)?.id, "puzzle-1");
  });

  it("reports the available difficulty levels when the server rejects a seed", async () => {
    await assert.rejects(loadPuzzle(request, {
      storage: new MemoryStorage(), signal: new AbortController().signal, isCurrent: () => true,
      fetcher: async () => new Response(JSON.stringify({ availableDifficultyLevels: [3, 1, 3] }), { status: 422 }),
    }), error => error instanceof DifficultyUnavailableError && error.message.includes("Levels 1, 3"));
  });

  it("uses the retry-after value for rate limited puzzle requests", async () => {
    await assert.rejects(loadPuzzle(request, {
      storage: new MemoryStorage(), signal: new AbortController().signal, isCurrent: () => true,
      fetcher: async () => new Response("busy", { status: 429, headers: { "retry-after": "7" } }),
    }), /Try again in 7 seconds/);
  });

  it("shows the API's bounded service message when puzzle generation fails", async () => {
    await assert.rejects(loadPuzzle(request, {
      storage: new MemoryStorage(), signal: new AbortController().signal, isCurrent: () => true,
      fetcher: async () => new Response(JSON.stringify({ error: "Yokaiba took too long to respond. Please try again." }), { status: 504 }),
    }), /Yokaiba took too long to respond/);
  });

  it("turns a disconnected puzzle API into a useful connection message", async () => {
    await assert.rejects(loadPuzzle(request, {
      storage: new MemoryStorage(), signal: new AbortController().signal, isCurrent: () => true,
      fetcher: async () => { throw new TypeError("Failed to fetch"); },
    }), /The puzzle service couldn’t be reached\. Please check your connection and try again\./);
  });

  it("keeps the newest puzzle in cache when overlapping requests resolve out of order", async () => {
    const storage = new MemoryStorage();
    let currentRequestId = 0;
    const deferred = () => {
      let resolve!: (response: Response) => void;
      const promise = new Promise<Response>(done => { resolve = done; });
      return { promise, resolve };
    };
    const olderResponse = deferred();
    const newerResponse = deferred();
    const responseFor = (id: string) => new Response(JSON.stringify({ ...puzzle, id }), {
      status: 200,
      headers: { "x-tako-bako-generated-at": "10000" },
    });

    const olderRequestId = ++currentRequestId;
    const olderLoad = loadPuzzle(request, {
      storage, signal: new AbortController().signal, isCurrent: () => olderRequestId === currentRequestId, now: () => 10_000,
      fetcher: () => olderResponse.promise,
    });
    const newerRequestId = ++currentRequestId;
    const newerLoad = loadPuzzle(request, {
      storage, signal: new AbortController().signal, isCurrent: () => newerRequestId === currentRequestId, now: () => 10_000,
      fetcher: () => newerResponse.promise,
    });

    newerResponse.resolve(responseFor("newer-puzzle"));
    assert.strictEqual((await newerLoad).id, "newer-puzzle");
    olderResponse.resolve(responseFor("older-puzzle"));
    assert.strictEqual((await olderLoad).id, "older-puzzle");

    assert.strictEqual(
      loadPuzzleFromCache<{ id: string }>(storage, request.seed, request.difficultyLevel, 10_001, request.templateId)?.id,
      "newer-puzzle",
    );
  });

  it("formats retry-after seconds, dates, and malformed values", () => {
    assert.strictEqual(retryAfterMessage("1"), "The dojo is busy. Try again in 1 second.");
    assert.strictEqual(retryAfterMessage(new Date(7_000).toUTCString(), 1_000), "The dojo is busy. Try again in 6 seconds.");
    assert.strictEqual(retryAfterMessage("invalid"), "The dojo is busy. Please wait a moment, then try again.");
    assert.strictEqual(retryAfterMessage(null), "The dojo is busy. Please wait a moment, then try again.");
  });
});
