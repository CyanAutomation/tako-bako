import type { HintStrength } from "../src/player-state.js";
import { isBoundedInteger, isBoundedText, MAX_PUZZLE_TOKEN_LENGTH } from "./hint-validation.js";

const MAX_HINT_COUNT = 100;
const HINT_STRENGTHS: readonly HintStrength[] = ["clue", "elimination", "placement"];

export interface ParsedHintRequest {
  body: Record<string, unknown>;
  puzzleToken: string;
  kind?: HintStrength;
  hintIndex?: number;
}

function isOptionalHintStrength(value: unknown): value is HintStrength | undefined {
  return value === undefined || HINT_STRENGTHS.includes(value as HintStrength);
}

function isOptionalHintCount(value: unknown): value is number | undefined {
  return value === undefined || isBoundedInteger(value, 0, MAX_HINT_COUNT);
}

export function parseHintRequest(value: Record<string, unknown>): ParsedHintRequest | undefined {
  const { puzzleToken, kind, hintsUsed } = value;
  if (!isBoundedText(puzzleToken, MAX_PUZZLE_TOKEN_LENGTH)) return undefined;
  if (!isOptionalHintStrength(kind) || !isOptionalHintCount(hintsUsed)) return undefined;
  return {
    body: value,
    puzzleToken,
    kind,
    ...(hintsUsed !== undefined && hintsUsed > 0 ? { hintIndex: hintsUsed } : {}),
  };
}
