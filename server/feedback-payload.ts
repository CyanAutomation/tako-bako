import {
  PUZZLE_FEEDBACK_RATINGS,
  PUZZLE_FEEDBACK_REASONS,
  type PuzzleFeedbackRequest,
} from "../src/feedback.js";

const MAX_FEEDBACK_BODY_BYTES = 4 * 1024;
const MAX_PUZZLE_TOKEN_LENGTH = 3_000;
const IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set([
  "puzzleToken", "rating", "reason", "outcome", "hintsUsed", "mistakes", "elapsedMs", "smartMarkingEnabled", "idempotencyKey",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isWithinBodyLimit(value: Record<string, unknown>): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_FEEDBACK_BODY_BYTES;
  } catch {
    return false;
  }
}

function hasOnlyAllowedFields(value: Record<string, unknown>): boolean {
  return Object.keys(value).every(key => ALLOWED_FIELDS.has(key));
}

function parsePuzzleToken(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_PUZZLE_TOKEN_LENGTH) return undefined;
  return value;
}

function parseFeedbackChoice(value: Record<string, unknown>): Pick<PuzzleFeedbackRequest, "rating" | "reason"> | undefined {
  if (typeof value.rating !== "string" || !PUZZLE_FEEDBACK_RATINGS.includes(value.rating as PuzzleFeedbackRequest["rating"])) return undefined;
  const rating = value.rating as PuzzleFeedbackRequest["rating"];
  if (value.reason === undefined) return { rating };
  if (typeof value.reason !== "string" || !PUZZLE_FEEDBACK_REASONS.includes(value.reason as NonNullable<PuzzleFeedbackRequest["reason"]>)) return undefined;
  if (rating !== "too_hard") return undefined;
  return { rating, reason: value.reason as NonNullable<PuzzleFeedbackRequest["reason"]> };
}

function parseFeedbackProgress(value: Record<string, unknown>): Pick<PuzzleFeedbackRequest, "outcome" | "hintsUsed" | "mistakes" | "elapsedMs"> | undefined {
  if (value.outcome !== "completed" && value.outcome !== "in_progress") return undefined;
  if (!boundedInteger(value.hintsUsed, 0, 100) || !boundedInteger(value.mistakes, 0, 100)) return undefined;
  if (value.elapsedMs !== undefined && !boundedInteger(value.elapsedMs, 0, 86_400_000)) return undefined;
  return {
    outcome: value.outcome,
    hintsUsed: value.hintsUsed,
    mistakes: value.mistakes,
    ...(typeof value.elapsedMs === "number" ? { elapsedMs: value.elapsedMs } : {}),
  };
}

function parseFeedbackMetadata(value: Record<string, unknown>): Pick<PuzzleFeedbackRequest, "smartMarkingEnabled" | "idempotencyKey"> | undefined {
  if (typeof value.smartMarkingEnabled !== "boolean") return undefined;
  if (typeof value.idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey)) return undefined;
  return { smartMarkingEnabled: value.smartMarkingEnabled, idempotencyKey: value.idempotencyKey };
}

function parseValidatedFeedbackPayload(value: Record<string, unknown>): PuzzleFeedbackRequest | undefined {
  const puzzleToken = parsePuzzleToken(value.puzzleToken);
  if (puzzleToken === undefined) return undefined;
  const choice = parseFeedbackChoice(value);
  if (!choice) return undefined;
  const progress = parseFeedbackProgress(value);
  if (!progress) return undefined;
  const metadata = parseFeedbackMetadata(value);
  if (!metadata) return undefined;

  return {
    puzzleToken,
    ...choice,
    ...progress,
    ...metadata,
  };
}

/** Validates the small browser-to-Yokaiba feedback contract. */
export function parseFeedbackPayload(value: unknown): PuzzleFeedbackRequest | undefined {
  if (!isRecord(value)) return undefined;
  if (!isWithinBodyLimit(value) || !hasOnlyAllowedFields(value)) return undefined;
  return parseValidatedFeedbackPayload(value);
}
