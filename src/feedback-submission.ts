import { clampElapsedMs } from "./events";
import type { Puzzle } from "./puzzle";
import type { PuzzleFeedbackOutcome, PuzzleFeedbackRating, PuzzleFeedbackReason, PuzzleFeedbackRequest } from "./feedback";

export interface FeedbackGameplaySnapshot {
  puzzle: Puzzle;
  rating: PuzzleFeedbackRating;
  reason?: PuzzleFeedbackReason;
  outcome: PuzzleFeedbackOutcome;
  hintsUsed: number;
  mistakes: number;
  puzzleStartedAt: number | undefined;
  smartMarkingEnabled: boolean;
  idempotencyKey: string;
  now?: number;
}

/** Captures all puzzle-specific values before an asynchronous request begins. */
export function createPuzzleFeedbackRequest(snapshot: FeedbackGameplaySnapshot): PuzzleFeedbackRequest | undefined {
  if (!snapshot.puzzle.puzzleToken) return undefined;
  return Object.freeze({
    puzzleToken: snapshot.puzzle.puzzleToken,
    rating: snapshot.rating,
    ...(snapshot.rating === "too_hard" && snapshot.reason ? { reason: snapshot.reason } : {}),
    outcome: snapshot.outcome,
    hintsUsed: Math.max(0, Math.min(100, Math.floor(snapshot.hintsUsed))),
    mistakes: Math.max(0, Math.min(100, Math.floor(snapshot.mistakes))),
    ...(snapshot.puzzleStartedAt === undefined ? {} : { elapsedMs: clampElapsedMs(snapshot.puzzleStartedAt, snapshot.now) }),
    smartMarkingEnabled: snapshot.smartMarkingEnabled,
    idempotencyKey: snapshot.idempotencyKey,
  });
}

/** Reuses the exact frozen payload for a retry; changed choices get a fresh key and snapshot. */
export function createOrReusePuzzleFeedbackRequest(
  pendingRequests: Map<string, PuzzleFeedbackRequest>,
  snapshot: Omit<FeedbackGameplaySnapshot, "idempotencyKey">,
  createIdempotencyKey: () => string,
): PuzzleFeedbackRequest | undefined {
  const fingerprint = snapshot.puzzle.puzzleFingerprint;
  if (!fingerprint) return undefined;
  const existing = pendingRequests.get(fingerprint);
  const reason = snapshot.rating === "too_hard" ? snapshot.reason : undefined;
  if (existing && existing.rating === snapshot.rating && existing.reason === reason && existing.outcome === snapshot.outcome) {
    return existing;
  }
  const request = createPuzzleFeedbackRequest({ ...snapshot, idempotencyKey: createIdempotencyKey() });
  if (request) pendingRequests.set(fingerprint, request);
  return request;
}
