import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Puzzle } from "./puzzle";
import { createAppFeedbackController } from "./app-feedback";
import type { PuzzleFeedbackRequest } from "./feedback";

function puzzle(id: string, fingerprint = `${id}-fingerprint`): Puzzle {
  return {
    id,
    seed: id,
    requestedSeed: id,
    templateId: "tournament-order-v2",
    puzzleFingerprint: fingerprint,
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

function createHarness(post: (request: PuzzleFeedbackRequest) => Promise<unknown> = async () => undefined) {
  let currentPuzzle: Puzzle | null = puzzle("first");
  let completed = false;
  const values = new Map<string, string>();
  const requests: PuzzleFeedbackRequest[] = [];
  const idempotencyKeys = ["key-1", "key-2"];
  let renders = 0;
  const controller = createAppFeedbackController({
    state: {
      get puzzle() { return currentPuzzle; },
      get puzzleCompleted() { return completed; },
      get puzzleStartedAt() { return 10_000; },
      get hintsUsed() { return 2; },
      get mistakes() { return 1; },
      get smartMarking() { return true; },
    },
    storage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
    },
    post: async request => {
      requests.push(request);
      return post(request);
    },
    createIdempotencyKey: () => idempotencyKeys.shift() ?? "fallback-key",
    now: () => 10_000,
    render: () => { renders += 1; },
  });
  return {
    controller,
    requests,
    values,
    get currentPuzzle() { return currentPuzzle; },
    set currentPuzzle(value: Puzzle | null) { currentPuzzle = value; },
    set completed(value: boolean) { completed = value; },
    get renders() { return renders; },
  };
}

describe("app feedback controller", () => {
  it("clears an optional reason when the selected rating no longer allows it", () => {
    const { controller } = createHarness();
    controller.selectRating("too_hard");
    controller.selectReason("confusing_clues");

    assert.equal(controller.ui.selectedReason, "confusing_clues");
    controller.selectRating("just_right");
    assert.equal(controller.ui.selectedRating, "just_right");
    assert.equal(controller.ui.selectedReason, undefined);
  });

  it("submits a bounded snapshot, records the fingerprint, and prevents duplicate submission", async () => {
    const harness = createHarness();
    harness.completed = true;
    harness.controller.selectRating("too_hard");
    harness.controller.selectReason("confusing_clues");

    await harness.controller.submit();
    await harness.controller.submit();

    assert.equal(harness.requests.length, 1);
    assert.deepEqual(harness.requests[0], {
      puzzleToken: "first-token",
      rating: "too_hard",
      reason: "confusing_clues",
      outcome: "completed",
      hintsUsed: 2,
      mistakes: 1,
      elapsedMs: 0,
      smartMarkingEnabled: true,
      idempotencyKey: "key-1",
    });
    assert.equal(harness.controller.ui.status, "success");
    assert.equal(harness.controller.isSubmitted("first-fingerprint"), true);
    assert.equal(harness.renders, 2);
  });

  it("reuses the frozen request key when a failed submission is retried", async () => {
    let attempts = 0;
    const harness = createHarness(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary failure");
      return undefined;
    });
    harness.controller.selectRating("just_right");

    await harness.controller.submit();
    assert.equal(harness.controller.ui.status, "error");
    await harness.controller.submit();

    assert.equal(harness.requests.length, 2);
    assert.equal(harness.requests[0]?.idempotencyKey, "key-1");
    assert.equal(harness.requests[1]?.idempotencyKey, "key-1");
    assert.equal(harness.controller.ui.status, "success");
  });

  it("keeps feedback for a previous puzzle from overwriting the current puzzle state", async () => {
    let resolveSubmission!: () => void;
    const harness = createHarness(() => new Promise<void>(resolve => { resolveSubmission = resolve; }));
    harness.controller.selectRating("just_right");
    const pending = harness.controller.submit();
    assert.equal(harness.controller.ui.submitting, true);

    harness.currentPuzzle = puzzle("second");
    harness.controller.reset();
    resolveSubmission();
    await pending;

    assert.deepEqual(harness.controller.ui, { submitting: false });
    assert.equal(harness.controller.isSubmitted("first-fingerprint"), true);
  });
});
