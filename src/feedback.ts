export const PUZZLE_FEEDBACK_RATINGS = ["too_easy", "just_right", "too_hard"] as const;
export const PUZZLE_FEEDBACK_REASONS = ["difficult_to_start", "confusing_clues", "too_many_deductions", "took_too_long", "other"] as const;

export type PuzzleFeedbackRating = typeof PUZZLE_FEEDBACK_RATINGS[number];
export type PuzzleFeedbackReason = typeof PUZZLE_FEEDBACK_REASONS[number];
export type PuzzleFeedbackOutcome = "completed" | "in_progress";

export interface PuzzleFeedbackRequest {
  puzzleToken: string;
  rating: PuzzleFeedbackRating;
  reason?: PuzzleFeedbackReason;
  outcome: PuzzleFeedbackOutcome;
  hintsUsed: number;
  mistakes: number;
  elapsedMs?: number;
  smartMarkingEnabled: boolean;
  idempotencyKey: string;
}

export interface PuzzleFeedbackResponse {
  accepted: true;
  duplicate: boolean;
}

export const PUZZLE_FEEDBACK_STORAGE_PREFIX = "tako-bako.feedback.v1:";

export interface FeedbackStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function puzzleFeedbackStorageKey(fingerprint: string): string {
  return `${PUZZLE_FEEDBACK_STORAGE_PREFIX}${fingerprint}`;
}

export function hasSubmittedPuzzleFeedback(storage: Pick<FeedbackStorage, "getItem">, fingerprint: string): boolean {
  try {
    return storage.getItem(puzzleFeedbackStorageKey(fingerprint)) === "submitted";
  } catch {
    return false;
  }
}

export function markPuzzleFeedbackSubmitted(storage: Pick<FeedbackStorage, "setItem">, fingerprint: string): void {
  try {
    storage.setItem(puzzleFeedbackStorageKey(fingerprint), "submitted");
  } catch {
    // Browser storage is only a local prompt/duplicate safeguard.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Sends feedback independently of gameplay actions and exposes only generic errors. */
export async function postPuzzleFeedback(
  feedback: PuzzleFeedbackRequest,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<PuzzleFeedbackResponse> {
  const response = await fetcher("/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(feedback),
    signal,
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !isRecord(body) || body.accepted !== true) {
    throw new Error("Feedback could not be sent. Please try again.");
  }
  return { accepted: true, duplicate: body.duplicate === true };
}
