export type Mark = "unknown" | "yes" | "no";

export interface Category {
  id: string;
  label: string;
  values: string[];
}

export interface Puzzle {
  id: string;
  seed: string;
  clues: { id: string; text: string }[];
  difficulty: { level: number; label: string; modelVersion: string };
  spec: { id: string; title: string; baseCategory: string; categories: Category[] };
}

export type Board = Record<string, Mark>;

export function cycleMark(mark: Mark): Mark {
  return mark === "unknown" ? "yes" : mark === "yes" ? "no" : "unknown";
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");

export function parsePuzzle(value: unknown): Puzzle {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.seed !== "string" || !Array.isArray(value.clues) || !isRecord(value.difficulty) || !isRecord(value.spec)) {
    throw new Error("invalid puzzle response");
  }
  const { difficulty, spec } = value;
  if (typeof difficulty.level !== "number" || typeof difficulty.label !== "string" || typeof difficulty.modelVersion !== "string" || typeof spec.id !== "string" || typeof spec.title !== "string" || typeof spec.baseCategory !== "string" || !Array.isArray(spec.categories)) {
    throw new Error("invalid puzzle response");
  }
  const clues = value.clues.map(clue => {
    if (!isRecord(clue) || typeof clue.id !== "string" || typeof clue.text !== "string") throw new Error("invalid puzzle response");
    return { id: clue.id, text: clue.text };
  });
  const categories = spec.categories.map(category => {
    if (!isRecord(category) || typeof category.id !== "string" || typeof category.label !== "string" || !isStringArray(category.values)) throw new Error("invalid puzzle response");
    return { id: category.id, label: category.label, values: category.values };
  });
  if (categories.length < 2 || !categories.some(category => category.id === spec.baseCategory)) throw new Error("invalid puzzle response");
  return { id: value.id, seed: value.seed, clues, difficulty: { level: difficulty.level, label: difficulty.label, modelVersion: difficulty.modelVersion }, spec: { id: spec.id, title: spec.title, baseCategory: spec.baseCategory, categories } };
}

export function squareKey(categoryId: string, row: string, column: string): string {
  return [categoryId, row, column].map(encodeURIComponent).join("|");
}

export function loadBoard(puzzleId: string): Board {
  try {
    const saved = localStorage.getItem(`tako-bako.board.${puzzleId}`);
    if (!saved) return {};
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, mark]) => mark === "yes" || mark === "no")) as Board;
  } catch {
    return {};
  }
}

export function saveBoard(puzzleId: string, board: Board): void {
  localStorage.setItem(`tako-bako.board.${puzzleId}`, JSON.stringify(board));
}
