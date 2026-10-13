import type { HintStrength } from "../src/player-state.js";
import { isBoundedInteger, isBoundedText } from "./hint-validation.js";

const MAX_TOKEN_LENGTH = 16_384;
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
  if (!isBoundedText(puzzleToken, MAX_TOKEN_LENGTH)) return undefined;
  if (!isOptionalHintStrength(kind) || !isOptionalHintCount(hintsUsed)) return undefined;
  return {
    body: value,
    puzzleToken,
    kind,
    ...(hintsUsed !== undefined && hintsUsed > 0 ? { hintIndex: hintsUsed } : {}),
  };
}
