import {
  hasSubmittedPuzzleFeedback,
  markPuzzleFeedbackSubmitted,
  postPuzzleFeedback,
  type FeedbackStorage,
  type PuzzleFeedbackRating,
  type PuzzleFeedbackReason,
  type PuzzleFeedbackRequest,
} from "./feedback";
import { createOrReusePuzzleFeedbackRequest } from "./feedback-submission";
import type { Puzzle } from "./puzzle";

export interface AppFeedbackState {
  readonly puzzle: Puzzle | null;
  readonly puzzleCompleted: boolean;
  readonly puzzleStartedAt: number | undefined;
  readonly hintsUsed: number;
  readonly mistakes: number;
  readonly smartMarking: boolean;
}

export interface FeedbackUiState {
  readonly selectedRating?: PuzzleFeedbackRating;
  readonly selectedReason?: PuzzleFeedbackReason;
  readonly submitting: boolean;
  readonly status?: "success" | "error";
}

export interface AppFeedbackController {
  readonly ui: FeedbackUiState;
  selectRating(rating: PuzzleFeedbackRating): void;
  selectReason(reason: PuzzleFeedbackReason): void;
  submit(): Promise<void>;
  reset(): void;
  isSubmitted(fingerprint: string | undefined): boolean;
}

export interface AppFeedbackDependencies {
  state: AppFeedbackState;
  storage: FeedbackStorage;
  post?: (request: PuzzleFeedbackRequest) => Promise<unknown>;
  createIdempotencyKey?: () => string;
  now?: () => number;
  render(): void;
}

/** Owns feedback selection, retries, and persistence for one mounted app. */
export function createAppFeedbackController({
  state,
  storage,
  post = postPuzzleFeedback,
  createIdempotencyKey = () => crypto.randomUUID(),
  now = Date.now,
  render,
}: AppFeedbackDependencies): AppFeedbackController {
  let ui: FeedbackUiState = { submitting: false };
  const submittedFingerprints = new Set<string>();
  const pendingRequests = new Map<string, PuzzleFeedbackRequest>();

  function selectRating(rating: PuzzleFeedbackRating): void {
    ui = {
      ...ui,
      selectedRating: rating,
      selectedReason: rating === "too_hard" ? ui.selectedReason : undefined,
      status: undefined,
    };
  }

  function selectReason(reason: PuzzleFeedbackReason): void {
    ui = { ...ui, selectedReason: ui.selectedReason === reason ? undefined : reason, status: undefined };
  }

  function selectedFeedback(): { puzzle: Puzzle; fingerprint: string; rating: PuzzleFeedbackRating } | undefined {
    const puzzle = state.puzzle;
    const fingerprint = puzzle?.puzzleFingerprint;
    const rating = ui.selectedRating;
    if (!puzzle || !fingerprint || !rating || ui.submitting) return undefined;
    return { puzzle, fingerprint, rating };
  }

  function hasSubmittedFingerprint(fingerprint: string): boolean {
    return submittedFingerprints.has(fingerprint) || hasSubmittedPuzzleFeedback(storage, fingerprint);
  }

  function prepareSubmission(): { fingerprint: string; request: PuzzleFeedbackRequest } | undefined {
    const selection = selectedFeedback();
    if (!selection) return undefined;
    if (hasSubmittedFingerprint(selection.fingerprint)) return undefined;

    const request = createOrReusePuzzleFeedbackRequest(pendingRequests, {
      puzzle: selection.puzzle,
      rating: selection.rating,
      reason: ui.selectedReason,
      outcome: state.puzzleCompleted ? "completed" : "in_progress",
      hintsUsed: state.hintsUsed,
      mistakes: state.mistakes,
      puzzleStartedAt: state.puzzleStartedAt,
      smartMarkingEnabled: state.smartMarking,
      now: now(),
    }, createIdempotencyKey);
    return request ? { fingerprint: selection.fingerprint, request } : undefined;
  }

  function markSubmissionAccepted(fingerprint: string): void {
    submittedFingerprints.add(fingerprint);
    markPuzzleFeedbackSubmitted(storage, fingerprint);
    pendingRequests.delete(fingerprint);
  }

  function finishSubmission(fingerprint: string, status: "success" | "error"): boolean {
    if (state.puzzle?.puzzleFingerprint !== fingerprint) return false;
    ui = status === "success"
      ? { submitting: false, status }
      : { ...ui, submitting: false, status };
    return true;
  }

  async function submit(): Promise<void> {
    const submission = prepareSubmission();
    if (!submission) return;

    ui = { ...ui, submitting: true, status: undefined };
    render();
    try {
      await post(submission.request);
      markSubmissionAccepted(submission.fingerprint);
      finishSubmission(submission.fingerprint, "success");
    } catch {
      finishSubmission(submission.fingerprint, "error");
    }
    if (state.puzzle?.puzzleFingerprint === submission.fingerprint) render();
  }

  function reset(): void {
    ui = { submitting: false };
    pendingRequests.clear();
  }

  return {
    get ui() { return { ...ui }; },
    selectRating,
    selectReason,
    submit,
    reset,
    isSubmitted(fingerprint) {
      return fingerprint !== undefined && hasSubmittedFingerprint(fingerprint);
    },
  };
}
