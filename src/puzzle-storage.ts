import type { Board } from "./puzzle";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
