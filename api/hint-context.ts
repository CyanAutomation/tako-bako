import { isClueStrategy } from "../src/clue-strategy-catalog.js";
import { derivePlayerStateFeatures, type PlayerStateFeatures } from "../src/player-state.js";
import { isBoundedInteger, isBoundedText, isRecord } from "./hint-validation.js";
import type { BoardMark, HintClue, SelectionContext } from "./hint-context-types.js";

const MAX_CLUES = 64;
const MAX_CLUE_ID_LENGTH = 128;
const MAX_CLUE_TEXT_LENGTH = 512;
const MAX_BOARD_MARKS = 256;
const MAX_BOARD_VALUE_LENGTH = 256;
const MAX_HINT_COUNT = 100;
const MAX_ELAPSED_MS = 86_400_000;

function parseHintClue(value: unknown): HintClue | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > MAX_CLUE_ID_LENGTH) return undefined;
  if (typeof value.text !== "string" || value.text.length === 0 || value.text.length > MAX_CLUE_TEXT_LENGTH) return undefined;
  return { id: value.id, text: value.text, ...(isClueStrategy(value.strategy) ? { strategy: value.strategy } : {}) };
}

function parseHintClues(value: unknown): HintClue[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_CLUES) return undefined;
  const clues: HintClue[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const clue = parseHintClue(item);
    if (!clue || seen.has(clue.id)) return undefined;
    seen.add(clue.id);
    clues.push(clue);
  }
  return clues;
}

function parseUsedClueIds(value: unknown): Set<string> | undefined {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.length > MAX_CLUES || !value.every(id => typeof id === "string" && id.length > 0 && id.length <= MAX_CLUE_ID_LENGTH)) return undefined;
  return new Set(value as string[]);
}

function parseBoardMark(value: unknown): BoardMark | undefined {
  if (!isRecord(value)) return undefined;
  if (!isBoundedText(value.category, MAX_BOARD_VALUE_LENGTH)
    || !isBoundedText(value.subject, MAX_BOARD_VALUE_LENGTH)
    || !isBoundedText(value.value, MAX_BOARD_VALUE_LENGTH)) return undefined;
  if (value.mark !== "yes" && value.mark !== "no") return undefined;
  return { category: value.category, subject: value.subject, value: value.value, mark: value.mark };
}

function parseBoardMarks(value: unknown): BoardMark[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_BOARD_MARKS) return undefined;
  const board: BoardMark[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const mark = parseBoardMark(item);
    if (!mark) return undefined;
    const key = JSON.stringify([mark.category, mark.subject, mark.value]);
    if (seen.has(key)) return undefined;
    seen.add(key);
    board.push(mark);
  }
  return board;
}

export function parseSelectionContext(value: Record<string, unknown>): SelectionContext | undefined {
  const clues = value.clues === undefined ? undefined : parseHintClues(value.clues);
  const usedClueIds = parseUsedClueIds(value.usedClueIds);
  const board = value.board === undefined ? [] : parseBoardMarks(value.board);
  if ((value.clues !== undefined && !clues) || !usedClueIds || !board) return undefined;
  return { clues, usedClueIds, board };
}

function hasValidPlayerCounts(value: Record<string, unknown>): boolean {
  return isBoundedInteger(value.totalMatches, 1, MAX_BOARD_MARKS)
    && isBoundedInteger(value.hintsUsed, 0, MAX_HINT_COUNT)
    && isBoundedInteger(value.mistakes, 0, MAX_HINT_COUNT)
    && isBoundedInteger(value.elapsedMs, 0, MAX_ELAPSED_MS);
}

export function playerStateFeatures(value: Record<string, unknown>, context: SelectionContext): PlayerStateFeatures | undefined {
  if (!context.clues || !hasValidPlayerCounts(value) || typeof value.smartMarking !== "boolean") return undefined;
  return derivePlayerStateFeatures({
    board: context.board,
    totalMatches: value.totalMatches as number,
    hintsUsed: value.hintsUsed as number,
    mistakes: value.mistakes as number,
    elapsedMs: value.elapsedMs as number,
    clues: context.clues,
    usedClueIds: context.usedClueIds,
    smartMarking: value.smartMarking,
  });
}
