import assert from "node:assert/strict";
import test from "node:test";
import {
  hasSubmittedPuzzleFeedback,
  markPuzzleFeedbackSubmitted,
  postPuzzleFeedback,
  puzzleFeedbackStorageKey,
  type FeedbackStorage,
  type PuzzleFeedbackRequest,
} from "./feedback";

class MemoryStorage implements FeedbackStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const feedback: PuzzleFeedbackRequest = {
  puzzleToken: "signed-token",
  rating: "too_hard",
  reason: "confusing_clues",
  outcome: "in_progress",
  hintsUsed: 1,
  mistakes: 0,
  elapsedMs: 5_000,
  smartMarkingEnabled: false,
  idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
};

test("feedback markers are scoped to a stable puzzle fingerprint", () => {
  const storage = new MemoryStorage();
  markPuzzleFeedbackSubmitted(storage, "a".repeat(64));

  assert.equal(storage.getItem(puzzleFeedbackStorageKey("a".repeat(64))), "submitted");
  assert.equal(hasSubmittedPuzzleFeedback(storage, "a".repeat(64)), true);
  assert.equal(hasSubmittedPuzzleFeedback(storage, "b".repeat(64)), false);
});

test("feedback submission accepts success and returns a retryable generic error on failure", async () => {
  let requestedUrl = "";
  let requestedBody: unknown;
  const success = await postPuzzleFeedback(feedback, undefined, (async (input, init) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ accepted: true, duplicate: false }), { status: 202 });
  }) as typeof fetch);

  assert.deepEqual(success, { accepted: true, duplicate: false });
  assert.equal(requestedUrl, "/api/feedback");
  assert.deepEqual(requestedBody, feedback);
  await assert.rejects(
    postPuzzleFeedback(feedback, undefined, (async () => new Response(JSON.stringify({ error: "private upstream details" }), { status: 503 })) as typeof fetch),
    /Feedback could not be sent/,
  );
});
