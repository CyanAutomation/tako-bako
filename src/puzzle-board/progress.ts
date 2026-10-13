import type { Board, Puzzle } from "../puzzle";
import { squareKey } from "./marks";

function playableGridKeys(spec: Puzzle["spec"]): { validKeys: Set<string>; totalMatches: number } | undefined {
  const base = spec.categories.find(category => category.id === spec.baseCategory);
  if (!base) return undefined;
  const categories = spec.categories.filter(category => category.id !== base.id);
  const validKeys = new Set(categories.flatMap(category => base.values.flatMap(row => category.values.map(column => squareKey(category.id, row, column)))));
  return { validKeys, totalMatches: categories.length * base.values.length };
}

/** Counts only marks that belong to the current puzzle's playable grids. */
export function boardProgress(board: Board, spec: Puzzle["spec"]): { marked: number; total: number } {
  const playable = playableGridKeys(spec);
  if (!playable) return { marked: 0, total: 0 };
  return {
    marked: Object.entries(board).filter(([key, mark]) => playable.validKeys.has(key) && mark !== "unknown").length,
    total: playable.validKeys.size,
  };
}

/** Counts affirmative matches separately from tentative notes and rule-outs. */
export function boardSolveProgress(board: Board, spec: Puzzle["spec"]): { matches: number; total: number } {
  const playable = playableGridKeys(spec);
  if (!playable) return { matches: 0, total: 0 };
  return {
    matches: Object.entries(board).filter(([key, mark]) => playable.validKeys.has(key) && mark === "yes").length,
    total: playable.totalMatches,
  };
}
