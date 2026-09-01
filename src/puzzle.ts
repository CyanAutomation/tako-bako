export type Mark = "unknown" | "yes" | "no";

export interface Category {
  id: string;
  label: string;
  values: string[];
}

export interface Puzzle {
  id: string;
  seed: string;
  requestedSeed: string;
  templateId: string;
  puzzleToken?: string;
  clues: { id: string; text: string }[];
  difficulty: { level: number; label: string; modelVersion: string };
  spec: { id: string; title: string; baseCategory: string; categories: Category[] };
}

export type Board = Record<string, Mark>;
export interface Answer { assignments: Record<string, string[]>; }

export function cycleMark(mark: Mark): Mark {
  return mark === "unknown" ? "yes" : mark === "yes" ? "no" : "unknown";
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const MAX_CATEGORIES = 8;
const MAX_VALUES_PER_CATEGORY = 16;
const MAX_TEXT_LENGTH = 256;

function isNonEmptyUniqueStrings(values: string[], maximum = MAX_VALUES_PER_CATEGORY): boolean {
  return values.length > 0 && values.length <= maximum && values.every(value => value.length > 0 && value.length <= MAX_TEXT_LENGTH) && new Set(values).size === values.length;
}

export function parsePuzzle(value: unknown): Puzzle {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.seed !== "string" || !Array.isArray(value.clues) || !isRecord(value.difficulty) || !isRecord(value.spec)) {
    throw new Error("invalid puzzle response");
  }
  const { difficulty, spec } = value;
  const level = difficulty.level;
  if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 5 || typeof difficulty.label !== "string" || difficulty.label.length === 0 || difficulty.label.length > MAX_TEXT_LENGTH || typeof difficulty.modelVersion !== "string" || difficulty.modelVersion.length === 0 || difficulty.modelVersion.length > MAX_TEXT_LENGTH || typeof spec.id !== "string" || spec.id.length === 0 || spec.id.length > MAX_TEXT_LENGTH || typeof spec.title !== "string" || spec.title.length === 0 || spec.title.length > MAX_TEXT_LENGTH || typeof spec.baseCategory !== "string" || spec.baseCategory.length === 0 || spec.baseCategory.length > MAX_TEXT_LENGTH || !Array.isArray(spec.categories) || spec.categories.length < 2 || spec.categories.length > MAX_CATEGORIES) {
    throw new Error("invalid puzzle response");
  }
  const clues = value.clues.map(clue => {
    if (!isRecord(clue) || typeof clue.id !== "string" || typeof clue.text !== "string") throw new Error("invalid puzzle response");
    return { id: clue.id, text: clue.text };
  });
  const categories = spec.categories.map(category => {
    if (!isRecord(category) || typeof category.id !== "string" || category.id.length === 0 || category.id.length > MAX_TEXT_LENGTH || typeof category.label !== "string" || category.label.length === 0 || category.label.length > MAX_TEXT_LENGTH || !isStringArray(category.values) || !isNonEmptyUniqueStrings(category.values)) throw new Error("invalid puzzle response");
    return { id: category.id, label: category.label, values: category.values };
  });
  const base = categories.find(category => category.id === spec.baseCategory);
  if (!base || new Set(categories.map(category => category.id)).size !== categories.length || categories.some(category => category.values.length !== base.values.length)) throw new Error("invalid puzzle response");
  if ("puzzleToken" in value && typeof value.puzzleToken !== "string") throw new Error("invalid puzzle response");
  const requestedSeed = value.requestedSeed === undefined ? value.seed : value.requestedSeed;
  if (typeof requestedSeed !== "string" || requestedSeed.length === 0 || requestedSeed.length > MAX_TEXT_LENGTH) throw new Error("invalid puzzle response");
  const templateId = value.templateId === undefined ? spec.id : value.templateId;
  if (typeof templateId !== "string" || templateId.length === 0 || templateId.length > MAX_TEXT_LENGTH) throw new Error("invalid puzzle response");
  return { id: value.id, seed: value.seed, requestedSeed, templateId, ...(typeof value.puzzleToken === "string" ? { puzzleToken: value.puzzleToken } : {}), clues, difficulty: { level, label: difficulty.label, modelVersion: difficulty.modelVersion }, spec: { id: spec.id, title: spec.title, baseCategory: spec.baseCategory, categories } };
}

export function squareKey(categoryId: string, row: string, column: string): string {
  return [categoryId, row, column].map(encodeURIComponent).join("|");
}

/** Applies a mark without mutating the saved board. Optional assist eliminates obvious peers. */
export function markBoard(board: Board, key: string, category: Category, base: Category, assist: boolean): Board {
  const next = cycleMark(board[key] ?? "unknown");
  const updated: Board = { ...board };
  if (next === "unknown") delete updated[key]; else updated[key] = next;
  if (next !== "yes" || !assist) return updated;

  const parts = key.split("|");
  if (parts.length !== 3) return updated;
  const [, encodedRow, encodedColumn] = parts;
  const row = decodeURIComponent(encodedRow);
  const column = decodeURIComponent(encodedColumn);
  for (const candidate of category.values) {
    if (candidate !== column) updated[squareKey(category.id, row, candidate)] = "no";
  }
  for (const candidate of base.values) {
    if (candidate !== row) updated[squareKey(category.id, candidate, column)] = "no";
  }
  return updated;
}

/** Returns the assignment format Yokaiba verifies, but only for a complete valid board. */
export function answerFromBoard(board: Board, spec: Puzzle["spec"]): Answer | undefined {
  const base = spec.categories.find(category => category.id === spec.baseCategory);
  if (!base) return undefined;
  const assignments: Record<string, string[]> = {};
  for (const category of spec.categories) {
    if (category.id === base.id) continue;
    const mapped = base.values.map(row => category.values.filter(column => board[squareKey(category.id, row, column)] === "yes"));
    if (mapped.some(matches => matches.length !== 1)) return undefined;
    if (mapped.some(matches => matches.length === 0)) return undefined;
    const values = mapped.map(matches => matches[0]);
    if (new Set(values).size !== category.values.length) return undefined;
    assignments[category.id] = values;
  }
  return { assignments };
}

/** Counts only marks that belong to the current puzzle's playable grids. */
export function boardProgress(board: Board, spec: Puzzle["spec"]): { marked: number; total: number } {
  const base = spec.categories.find(category => category.id === spec.baseCategory);
  if (!base) return { marked: 0, total: 0 };
  const categories = spec.categories.filter(category => category.id !== base.id);
  const validKeys = new Set(categories.flatMap(category => base.values.flatMap(row => category.values.map(column => squareKey(category.id, row, column)))));
  return {
    marked: Object.entries(board).filter(([key, mark]) => validKeys.has(key) && mark !== "unknown").length,
    total: validKeys.size,
  };
}

export function loadBoard(puzzleId: string): Board {
  try {
    const saved = localStorage.getItem(`tako-bako.board.${puzzleId}`);
    if (!saved) return {};
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) return {};
    const safeEntries = Object.entries(parsed).filter(([key, mark]) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") return false;
      return mark === "yes" || mark === "no";
    });
    return Object.fromEntries(safeEntries) as Board;
  } catch {
    return {};
  }
}

export function saveBoard(puzzleId: string, board: Board): void {
  localStorage.setItem(`tako-bako.board.${puzzleId}`, JSON.stringify(board));
}

/** Restores only clue IDs that belong to the puzzle currently being displayed. */
export function loadUsedClues(puzzleId: string, clueIds: readonly string[]): Set<string> {
  try {
    const saved = localStorage.getItem(`tako-bako.clues.${puzzleId}`);
    if (!saved) return new Set();
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return new Set();
    const validClueIds = new Set(clueIds);
    return new Set(parsed.filter((clueId): clueId is string => typeof clueId === "string" && validClueIds.has(clueId)));
  } catch {
    return new Set();
  }
}

export function saveUsedClues(puzzleId: string, clueIds: ReadonlySet<string>): void {
  localStorage.setItem(`tako-bako.clues.${puzzleId}`, JSON.stringify([...clueIds]));
}
