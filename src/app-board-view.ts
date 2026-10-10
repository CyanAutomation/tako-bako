import { boardSolveProgress, answerFromBoard } from "./puzzle-board/solution";
import { gridCellLabel } from "./ui-grid";
import type { Board, Puzzle } from "./puzzle";

interface BoardViewUpdate {
  root: HTMLElement;
  previous: Board;
  current: Puzzle;
  board: Board;
  loading: boolean;
  undoCount: number;
}

function changedBoardCell(root: HTMLElement, key: string, current: Puzzle, base: Puzzle["spec"]["categories"][number]): { cell: HTMLButtonElement; row: string; column: string } | undefined {
  const [categoryId, encodedRow, encodedColumn] = key.split("|");
  if (!categoryId || !encodedRow || !encodedColumn) return undefined;
  const category = current.spec.categories.find(candidate => candidate.id === categoryId);
  if (!category || category.id === base.id) return undefined;
  const cell = root.querySelector<HTMLButtonElement>(`[data-square="${CSS.escape(key)}"]`);
  if (!cell) return undefined;
  return { cell, row: decodeURIComponent(encodedRow), column: decodeURIComponent(encodedColumn) };
}

function updateChangedCells(root: HTMLElement, previous: Board, board: Board, current: Puzzle, base: Puzzle["spec"]["categories"][number]): void {
  const changedKeys = [...new Set([...Object.keys(previous), ...Object.keys(board)])]
    .filter(key => previous[key] !== board[key]);
  for (const key of changedKeys) {
    const target = changedBoardCell(root, key, current, base);
    if (!target) continue;
    const mark = board[key] ?? "unknown";
    target.cell.className = `mark mark-${mark}`;
    target.cell.setAttribute("aria-label", gridCellLabel(target.row, target.column, mark));
    const symbol = target.cell.querySelector("span") ?? target.cell;
    symbol.textContent = mark === "yes" ? "✓" : mark === "no" ? "×" : "";
  }
}

function updateProgress(root: HTMLElement, current: Puzzle, board: Board): void {
  const progress = boardSolveProgress(board, current.spec);
  const progressElement = root.querySelector<HTMLElement>(".progress");
  if (progressElement) progressElement.textContent = `${progress.matches} of ${progress.total} matches found`;
  const readinessMeter = root.querySelector<HTMLProgressElement>(".readiness-meter__bar");
  if (readinessMeter) {
    readinessMeter.max = Math.max(progress.total, 1);
    readinessMeter.value = Math.min(progress.matches, readinessMeter.max);
    readinessMeter.setAttribute("aria-label", `${progress.matches} of ${progress.total} matches found`);
  }
}

function updateBoardActions(root: HTMLElement, current: Puzzle, board: Board, loading: boolean, undoCount: number): void {
  const check = root.querySelector<HTMLButtonElement>("#check-solution");
  if (check) check.disabled = loading || !current.puzzleToken || !answerFromBoard(board, current.spec);
  const undo = root.querySelector<HTMLButtonElement>("#undo");
  if (undo) undo.disabled = loading || undoCount === 0;
  const reset = root.querySelector<HTMLButtonElement>("#reset-board");
  if (reset) reset.disabled = loading || Object.keys(board).length === 0;
}

function updateGridResetControls(root: HTMLElement, current: Puzzle, board: Board, base: Puzzle["spec"]["categories"][number]): void {
  for (const category of current.spec.categories) {
    if (category.id === base.id) continue;
    const resetGrid = root.querySelector<HTMLButtonElement>(`#grid-reset-${CSS.escape(category.id)}`);
    if (resetGrid) resetGrid.disabled = !Object.keys(board).some(key => key.split("|")[0] === category.id);
  }
}

/** Updates only changed cells and controls, preserving the live grid DOM. */
export function updateBoardView({ root, previous, current, board, loading, undoCount }: BoardViewUpdate): void {
  const base = current.spec.categories.find(category => category.id === current.spec.baseCategory);
  if (!base) return;
  updateChangedCells(root, previous, board, current, base);
  updateProgress(root, current, board);
  updateBoardActions(root, current, board, loading, undoCount);
  updateGridResetControls(root, current, board, base);
}
