import assert from "node:assert/strict";
import test from "node:test";
import { createOrReusePuzzleFeedbackRequest, createPuzzleFeedbackRequest } from "./feedback-submission";
import type { Puzzle } from "./puzzle";

const puzzle: Puzzle = {
  id: "puzzle-one",
  seed: "actual-seed",
  requestedSeed: "requested-seed",
  templateId: "template-one",
  puzzleFingerprint: "a".repeat(64),
  puzzleToken: "token-for-puzzle-one",
  difficultyModel: "v5",
  clues: [],
  difficulty: { level: 4, label: "Steady", modelVersion: "model-v5" },
  spec: { id: "template-one", title: "Puzzle", baseCategory: "base", categories: [] },
};

test("feedback request snapshots retain the completed puzzle during later async state changes", () => {
  const request = createPuzzleFeedbackRequest({
    puzzle,
    rating: "too_hard",
    reason: "difficult_to_start",
    outcome: "completed",
    hintsUsed: 2,
    mistakes: 1,
    puzzleStartedAt: 10_000,
    smartMarkingEnabled: true,
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
    now: 70_000,
  });

  assert.ok(request);
  assert.deepEqual(request, {
    puzzleToken: "token-for-puzzle-one",
    rating: "too_hard",
    reason: "difficult_to_start",
    outcome: "completed",
    hintsUsed: 2,
    mistakes: 1,
    elapsedMs: 60_000,
    smartMarkingEnabled: true,
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
  });
  assert.equal(Object.isFrozen(request), true);
});

test("missing signed tokens disable feedback without blocking gameplay", () => {
  const request = createPuzzleFeedbackRequest({
    puzzle: { ...puzzle, puzzleToken: undefined },
    rating: "just_right",
    outcome: "in_progress",
    hintsUsed: 0,
    mistakes: 0,
    puzzleStartedAt: undefined,
    smartMarkingEnabled: false,
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
  });
  assert.equal(request, undefined);
});

test("feedback retries reuse the frozen payload and changed choices get a new idempotency key", () => {
  const pending = new Map();
  let nextKey = 0;
  const createKey = () => `key-${++nextKey}`;
  const snapshot = {
    puzzle,
    rating: "too_hard" as const,
    reason: "confusing_clues" as const,
    outcome: "in_progress" as const,
    hintsUsed: 1,
    mistakes: 2,
    puzzleStartedAt: 10_000,
    smartMarkingEnabled: false,
    now: 20_000,
  };

  const first = createOrReusePuzzleFeedbackRequest(pending, snapshot, createKey);
  const retry = createOrReusePuzzleFeedbackRequest(pending, { ...snapshot, now: 35_000, hintsUsed: 3 }, createKey);
  assert.equal(retry, first);
  assert.equal(retry?.elapsedMs, 10_000);
  assert.equal(retry?.hintsUsed, 1);
  assert.equal(retry?.idempotencyKey, "key-1");

  const changed = createOrReusePuzzleFeedbackRequest(pending, { ...snapshot, rating: "just_right", now: 35_000 }, createKey);
  assert.equal(changed?.rating, "just_right");
  assert.equal(changed?.idempotencyKey, "key-2");
});
