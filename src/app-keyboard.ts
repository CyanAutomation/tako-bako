import { nextGridCellKey } from "./ui-grid";
import { nextTabId } from "./ui-tabs";
import type { Puzzle } from "./puzzle";

/** Moves focus to the adjacent playable square when an arrow key has a destination. */
export function handleGridCellKeydown(event: KeyboardEvent, puzzle: Puzzle | null, focusGridCell: (key: string) => void): boolean {
  const cell = (event.target as Element).closest<HTMLButtonElement>("button[data-square]");
  if (!cell || !puzzle || cell.disabled || !cell.dataset.square) return false;
  const category = puzzle.spec.categories.find(candidate => candidate.id === cell.dataset.square!.split("|")[0]);
  const base = puzzle.spec.categories.find(candidate => candidate.id === puzzle.spec.baseCategory);
  if (!category || !base) return false;
  const nextKey = nextGridCellKey({ categoryId: category.id, rows: base.values, columns: category.values, key: cell.dataset.square, keyName: event.key });
  if (!nextKey) return false;
  event.preventDefault();
  focusGridCell(nextKey);
  return true;
}

/** Moves focus among the grid tabs for the keyboard commands supported by ARIA tabs. */
export function handleGridTabKeydown(event: KeyboardEvent, puzzle: Puzzle | null, selectGrid: (gridId: string, focus?: boolean) => void): void {
  const tab = (event.target as Element).closest<HTMLButtonElement>("button[data-grid-tab]");
  if (!tab || !puzzle || !tab.dataset.gridTab) return;
  const categories = puzzle.spec.categories.filter(category => category.id !== puzzle.spec.baseCategory);
  const nextGridId = nextTabId(categories, tab.dataset.gridTab, event.key);
  if (!nextGridId) return;
  event.preventDefault();
  selectGrid(nextGridId, true);
}
