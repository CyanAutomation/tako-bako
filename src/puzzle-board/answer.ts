import type { Answer, Board, Puzzle } from "../puzzle";
import { squareKey } from "./marks";

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
    const values = mapped.map(matches => matches[0]!);
    if (new Set(values).size !== category.values.length) return undefined;
    assignments[category.id] = values;
  }
  return { assignments };
}
