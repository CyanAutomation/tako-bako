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

/** Strips unknown fields and validates the small browser-to-Yokaiba contract. */
export function parseFeedbackPayload(value: unknown): PuzzleFeedbackRequest | undefined {
  if (!isRecord(value)) return undefined;
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_FEEDBACK_BODY_BYTES) return undefined;
  } catch {
    return undefined;
  }
  if (Object.keys(value).some(key => !ALLOWED_FIELDS.has(key))) return undefined;
  if (typeof value.puzzleToken !== "string" || value.puzzleToken.trim().length === 0 || value.puzzleToken.length > MAX_PUZZLE_TOKEN_LENGTH) return undefined;
  if (typeof value.rating !== "string" || !PUZZLE_FEEDBACK_RATINGS.includes(value.rating as PuzzleFeedbackRequest["rating"])) return undefined;
  if (value.reason !== undefined && (typeof value.reason !== "string" || !PUZZLE_FEEDBACK_REASONS.includes(value.reason as NonNullable<PuzzleFeedbackRequest["reason"]>))) return undefined;
  if (value.rating !== "too_hard" && value.reason !== undefined) return undefined;
  if (value.outcome !== "completed" && value.outcome !== "in_progress") return undefined;
  if (!boundedInteger(value.hintsUsed, 0, 100) || !boundedInteger(value.mistakes, 0, 100)) return undefined;
  if (value.elapsedMs !== undefined && !boundedInteger(value.elapsedMs, 0, 86_400_000)) return undefined;
  if (typeof value.smartMarkingEnabled !== "boolean") return undefined;
  if (typeof value.idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey)) return undefined;
  return {
    puzzleToken: value.puzzleToken,
    rating: value.rating as PuzzleFeedbackRequest["rating"],
    ...(typeof value.reason === "string" ? { reason: value.reason as PuzzleFeedbackRequest["reason"] } : {}),
    outcome: value.outcome,
    hintsUsed: value.hintsUsed,
    mistakes: value.mistakes,
    ...(typeof value.elapsedMs === "number" ? { elapsedMs: value.elapsedMs } : {}),
    smartMarkingEnabled: value.smartMarkingEnabled,
    idempotencyKey: value.idempotencyKey,
  };
}
