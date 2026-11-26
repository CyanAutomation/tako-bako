import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courses } from "./curriculum";
import type { ClueStrategy } from "./clue-strategy-catalog";
import { DifficultyUnavailableError } from "./puzzle-loader";
import type { Puzzle } from "./puzzle";
import { createAppPuzzleSessionController } from "./app-puzzle-session";
import type { PuzzleSessionRequest } from "./app-puzzle-session";

function puzzle(id: string): Puzzle {
  return {
    id,
    seed: id,
    requestedSeed: id,
    templateId: "tournament-order-v2",
    puzzleToken: `${id}-token`,
    clues: [],
    difficulty: { level: 1, label: "Beginner", modelVersion: "test" },
    spec: {
      id: "tournament-order-v2",
      title: "Tournament Order",
      baseCategory: "people",
      categories: [
        { id: "people", label: "People", values: ["Aki", "Ben"] },
        { id: "clubs", label: "Clubs", values: ["Lions", "Wolves"] },
      ],
    },
  };
}

function request(seed: string): PuzzleSessionRequest {
  return {
    seed,
    templateId: "tournament-order-v2",
    difficultyLevel: 1,
    difficultyModel: "v5",
    playMode: "challenge",
    course: courses[0]!,
    urlMode: "push",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function createHarness(
  load: (seed: string, signal: AbortSignal) => Promise<Puzzle>,
  fetchClueStrategies: (puzzle: Puzzle, signal: AbortSignal) => Promise<Record<string, ClueStrategy> | undefined> = async () => undefined,
) {
  const state = {
    puzzle: null as Puzzle | null,
    loading: false,
    difficultyUnavailable: false,
    puzzleLoadFailed: false,
  };
  const messages: { text: string; tone?: string }[] = [];
  const activations: { puzzle: Puzzle; request: PuzzleSessionRequest }[] = [];
  let appliedStrategyCount = 0;
  let renders = 0;
  let beforeLoads = 0;
  const controller = createAppPuzzleSessionController({
    state,
    storage: { length: 0, getItem: () => null, key: () => null, setItem: () => undefined, removeItem: () => undefined },
    loadPuzzle: (input, dependencies) => load(input.seed, dependencies.signal),
    fetchClueStrategies,
    beforeLoad: () => { beforeLoads += 1; },
    onActivate: (loaded, options) => {
      activations.push({ puzzle: loaded, request: options });
      state.puzzle = loaded;
    },
    onClueStrategies: () => { appliedStrategyCount += 1; },
    setMessage: (text, tone) => { messages.push({ text, tone }); },
    render: () => { renders += 1; },
  });
  return {
    controller,
    state,
    messages,
    activations,
    get renders() { return renders; },
    get beforeLoads() { return beforeLoads; },
    get appliedStrategyCount() { return appliedStrategyCount; },
  };
}

describe("app puzzle session controller", () => {
  it("loads from a request snapshot and clears loading state after activation", async () => {
    const loaded = puzzle("first");
    let seenSignal: AbortSignal | undefined;
    const harness = createHarness(async (_seed, signal) => {
      seenSignal = signal;
      return loaded;
    });

    await harness.controller.load(request("first"));

    assert.equal(harness.beforeLoads, 1);
    assert.equal(harness.state.puzzle?.id, "first");
    assert.equal(harness.state.loading, false);
    assert.equal(harness.state.difficultyUnavailable, false);
    assert.equal(harness.state.puzzleLoadFailed, false);
    assert.equal(harness.activations[0]?.request.seed, "first");
    assert.equal(seenSignal?.aborted, false);
    assert.equal(harness.renders, 2);
  });

  it("reports difficulty-unavailable failures through the state and message callbacks", async () => {
    const harness = createHarness(async () => { throw new DifficultyUnavailableError([2, 3]); });

    await harness.controller.load(request("unsupported"));

    assert.equal(harness.state.puzzle, null);
    assert.equal(harness.state.loading, false);
    assert.equal(harness.state.puzzleLoadFailed, true);
    assert.equal(harness.state.difficultyUnavailable, true);
    assert.match(harness.messages.at(-1)?.text ?? "", /Levels 2, 3/);
    assert.equal(harness.messages.at(-1)?.tone, "error");
  });

  it("ignores a late response after a newer puzzle request starts", async () => {
    const first = deferred<Puzzle>();
    const second = deferred<Puzzle>();
    const signals: AbortSignal[] = [];
    const harness = createHarness((seed, signal) => {
      signals.push(signal);
      return seed === "first" ? first.promise : second.promise;
    });
    const firstRequest = harness.controller.load(request("first"));
    const secondRequest = harness.controller.load(request("second"));

    assert.equal(signals[0]?.aborted, true);
    second.resolve(puzzle("second"));
    await secondRequest;
    first.resolve(puzzle("first"));
    await firstRequest;

    assert.deepEqual(harness.activations.map(item => item.puzzle.id), ["second"]);
    assert.equal(harness.state.puzzle?.id, "second");
    assert.equal(harness.state.loading, false);
  });

  it("cancels pending puzzle and clue-strategy requests", async () => {
    const pending = deferred<Puzzle>();
    const signals: AbortSignal[] = [];
    const harness = createHarness((_seed, signal) => {
      signals.push(signal);
      return pending.promise;
    });
    const requestPromise = harness.controller.load(request("first"));
    harness.controller.cancel();
    pending.resolve(puzzle("first"));
    await requestPromise;

    assert.equal(signals[0]?.aborted, true);
    assert.equal(harness.state.puzzle, null);
    assert.equal(harness.activations.length, 0);
  });

  it("discards a late clue-strategy response after session cancellation", async () => {
    const strategies = deferred<Record<string, ClueStrategy>>();
    let strategySignal: AbortSignal | undefined;
    const harness = createHarness(
      async () => puzzle("active"),
      async (_requestedPuzzle, signal) => {
        strategySignal = signal;
        return strategies.promise;
      },
    );
    await harness.controller.load(request("active"));
    const requestedPuzzle = { ...puzzle("active"), clues: [{ id: "c1", text: "A clue" }] };
    const strategyRequest = harness.controller.loadClueStrategies(requestedPuzzle);
    harness.controller.cancel();
    strategies.resolve({ c1: "adjacency" });
    await strategyRequest;

    assert.equal(strategySignal?.aborted, true);
    assert.equal(harness.appliedStrategyCount, 0);
  });
});
