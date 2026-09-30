import { isClueStrategy } from "./clue-strategy-catalog";
import { strategyForConstraintKind } from "./clue-strategy-constraints";
import type { Category, Clue, Puzzle } from "./puzzle";

const MAX_CATEGORIES = 8;
const MAX_VALUES_PER_CATEGORY = 16;
const MAX_TEXT_LENGTH = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidPuzzle(): never {
  throw new Error("invalid puzzle response");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isNonEmptyUniqueStrings(values: string[]): boolean {
  return values.length > 0
    && values.length <= MAX_VALUES_PER_CATEGORY
    && values.every(value => value.length > 0 && value.length <= MAX_TEXT_LENGTH)
    && new Set(values).size === values.length;
}

function isBoundedText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT_LENGTH;
}

function parseDifficulty(value: unknown): Puzzle["difficulty"] {
  if (!isRecord(value)) return invalidPuzzle();
  const { level, label, modelVersion } = value;
  if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 12
    || !isBoundedText(label) || !isBoundedText(modelVersion)) return invalidPuzzle();
  return { level, label, modelVersion };
}

function parseClue(value: unknown): Clue {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.text !== "string") return invalidPuzzle();
  const constraint = isRecord(value.constraint) ? value.constraint : undefined;
  const candidateKind = typeof value.constraintKind === "string" ? value.constraintKind : constraint?.kind;
  const constraintKind = typeof candidateKind === "string" && candidateKind.length <= MAX_TEXT_LENGTH ? candidateKind : undefined;
  const strategy = strategyForConstraintKind(constraintKind) ?? (isClueStrategy(value.strategy) ? value.strategy : undefined);
  return { id: value.id, text: value.text, ...(constraintKind ? { constraintKind } : {}), ...(strategy ? { strategy } : {}) };
}

function parseCategory(value: unknown): Category {
  if (!isRecord(value) || !isBoundedText(value.id) || !isBoundedText(value.label)
    || !isStringArray(value.values) || !isNonEmptyUniqueStrings(value.values)) return invalidPuzzle();
  return { id: value.id, label: value.label, values: value.values };
}

function parseSpec(value: unknown): Puzzle["spec"] {
  if (!isRecord(value) || !isBoundedText(value.id) || !isBoundedText(value.title) || !isBoundedText(value.baseCategory)
    || !Array.isArray(value.categories) || value.categories.length < 2 || value.categories.length > MAX_CATEGORIES) return invalidPuzzle();
  const categories = value.categories.map(parseCategory);
  const base = categories.find(category => category.id === value.baseCategory);
  const ids = new Set(categories.map(category => category.id));
  if (!base || ids.size !== categories.length || categories.some(category => category.values.length !== base.values.length)) return invalidPuzzle();
  return { id: value.id, title: value.title, baseCategory: value.baseCategory, categories };
}

function optionalBoundedText(value: unknown, fallback: string): string {
  const candidate = value === undefined ? fallback : value;
  return isBoundedText(candidate) ? candidate : invalidPuzzle();
}

export function parsePuzzle(value: unknown): Puzzle {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.seed !== "string" || !Array.isArray(value.clues)) return invalidPuzzle();
  if ("puzzleToken" in value && typeof value.puzzleToken !== "string") return invalidPuzzle();
  const clues = value.clues.map(parseClue);
  const difficulty = parseDifficulty(value.difficulty);
  const spec = parseSpec(value.spec);
  const requestedSeed = optionalBoundedText(value.requestedSeed, value.seed);
  const templateId = optionalBoundedText(value.templateId, spec.id);
  return {
    id: value.id,
    seed: value.seed,
    requestedSeed,
    templateId,
    ...(typeof value.puzzleToken === "string" ? { puzzleToken: value.puzzleToken } : {}),
    clues,
    difficulty,
    spec,
  };
}
