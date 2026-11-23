import assert from "node:assert/strict";
import test from "node:test";
import type { PuzzleFeedbackRequest } from "../src/feedback.js";
import { parseFeedbackPayload } from "../server/feedback-payload.js";

const validFeedback: PuzzleFeedbackRequest = {
  puzzleToken: "signed-token",
  rating: "just_right",
  outcome: "in_progress",
  hintsUsed: 1,
  mistakes: 0,
  smartMarkingEnabled: false,
  idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
};

function changedFeedback(change: (value: Record<string, unknown>) => void): Record<string, unknown> {
  const value: Record<string, unknown> = { ...validFeedback };
  change(value);
  return value;
}

test("feedback payload parser preserves valid optional fields", () => {
  const payload = {
    ...validFeedback,
    rating: "too_hard",
    reason: "confusing_clues",
    elapsedMs: 86_400_000,
  };
  assert.deepEqual(parseFeedbackPayload(payload), payload);
});

test("feedback payload parser rejects malformed contracts", () => {
  const invalidPayloads: Array<[string, unknown]> = [
    ["non-record values", null],
    ["unknown fields", changedFeedback(value => { value.extra = "forged"; })],
    ["blank puzzle tokens", changedFeedback(value => { value.puzzleToken = "  "; })],
    ["oversized puzzle tokens", changedFeedback(value => { value.puzzleToken = "x".repeat(3_001); })],
    ["unknown ratings", changedFeedback(value => { value.rating = "maybe"; })],
    ["unknown reasons", changedFeedback(value => { value.rating = "too_hard"; value.reason = "surprise"; })],
    ["reasons on other ratings", changedFeedback(value => { value.reason = "confusing_clues"; })],
    ["unknown outcomes", changedFeedback(value => { value.outcome = "quit"; })],
    ["out-of-range hint counts", changedFeedback(value => { value.hintsUsed = 101; })],
    ["fractional mistake counts", changedFeedback(value => { value.mistakes = 1.5; })],
    ["out-of-range elapsed time", changedFeedback(value => { value.elapsedMs = 86_400_001; })],
    ["non-boolean marking preference", changedFeedback(value => { value.smartMarkingEnabled = "false"; })],
    ["non-v4 idempotency keys", changedFeedback(value => { value.idempotencyKey = "123e4567-e89b-12d3-a456-426614174000"; })],
    ["values JSON cannot serialize", changedFeedback(value => { value.hintsUsed = 1n; })],
  ];

  for (const [label, payload] of invalidPayloads) {
    assert.equal(parseFeedbackPayload(payload), undefined, label);
  }
});
