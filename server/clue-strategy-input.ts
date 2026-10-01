export interface InputClue {
  id: string;
  text: string;
  constraintKind?: string;
}

const MAX_CLUES = 64;
const MAX_CLUE_ID_LENGTH = 128;
const MAX_CLUE_TEXT_LENGTH = 512;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength;
}

function parseClue(value: unknown): InputClue | undefined {
  if (!isRecord(value)) return undefined;
  const { id, text } = value;
  if (!isBoundedText(id, MAX_CLUE_ID_LENGTH) || !isBoundedText(text, MAX_CLUE_TEXT_LENGTH)) return undefined;
  const constraintKind = value.constraintKind;
  const boundedConstraint = typeof constraintKind === "string" && constraintKind.length <= MAX_CLUE_ID_LENGTH ? constraintKind : undefined;
  return { id, text, ...(boundedConstraint ? { constraintKind: boundedConstraint } : {}) };
}

/** Accepts a non-empty, bounded list with unique IDs. */
export function parseClues(input: unknown): InputClue[] | undefined {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_CLUES) return undefined;
  const clues: InputClue[] = [];
  const ids = new Set<string>();
  for (const item of input) {
    const clue = parseClue(item);
    if (!clue || ids.has(clue.id)) return undefined;
    ids.add(clue.id);
    clues.push(clue);
  }
  return clues;
}
