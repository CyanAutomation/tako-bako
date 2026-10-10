import type { Board, Category, Mark } from "../puzzle";

export function cycleMark(mark: Mark): Mark {
  return mark === "unknown" ? "yes" : mark === "yes" ? "no" : "unknown";
}

export function squareKey(categoryId: string, row: string, column: string): string {
  return [categoryId, row, column].map(encodeURIComponent).join("|");
}

/** Applies a mark without mutating the saved board. Smart marking eliminates obvious peers. */
export function markBoard(board: Board, key: string, category: Category, base: Category, smartMarking: boolean): Board {
  const next = cycleMark(board[key] ?? "unknown");
  const updated: Board = { ...board };
  if (next === "unknown") delete updated[key]; else updated[key] = next;
  if (next !== "yes" || !smartMarking) return updated;

  const parts = key.split("|");
  if (parts.length !== 3) return updated;
  const [, encodedRow, encodedColumn] = parts;
  const row = decodeURIComponent(encodedRow!);
  const column = decodeURIComponent(encodedColumn!);
  for (const candidate of category.values) {
    if (candidate !== column) updated[squareKey(category.id, row, candidate)] = "no";
  }
  for (const candidate of base.values) {
    if (candidate !== row) updated[squareKey(category.id, candidate, column)] = "no";
  }
  return updated;
}
