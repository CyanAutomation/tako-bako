import { escapeHtml, renderSelect } from "./ui-controls";
import type { GridCardOptions, GridCellOptions, TabItem } from "./ui-types";

/** A standard three-state puzzle-grid control with a descriptive accessible name. */
export function renderGridCell({ key, row, column, mark, disabled = false, tabIndex }: GridCellOptions): string {
  const symbols = { unknown: "", yes: "✓", no: "×" };
  const tabIndexAttribute = disabled ? "" : ` tabindex="${tabIndex ?? -1}"`;
  return `<td><button class="mark mark-${mark}" data-square="${escapeHtml(key)}" aria-label="${escapeHtml(gridCellLabel(row, column, mark, disabled))}"${tabIndexAttribute}${disabled ? " disabled" : ""}><span aria-hidden="true">${symbols[mark]}</span></button></td>`;
}

/** Returns the accessible description shared by rendered and incrementally updated grid cells. */
export function gridCellLabel(row: string, column: string, mark: GridCellOptions["mark"], disabled = false): string {
  const names = { unknown: "unknown", yes: "yes", no: "no" };
  return `${row}, ${column}: ${names[mark]}.${disabled ? " Grid locked." : " Select to change."}`;
}

/** Finds the next cell for bounded arrow-key movement inside one puzzle grid. */
export function nextGridCellKey({ categoryId, rows, columns, key, keyName }: { categoryId: string; rows: readonly string[]; columns: readonly string[]; key: string; keyName: string }): string | undefined {
  if (!/^Arrow(Up|Down|Left|Right)$/.test(keyName)) return undefined;
  if (rows.length === 0 || columns.length === 0) return undefined;
  const [id, encodedRow, encodedColumn] = key.split("|");
  if (id !== categoryId || !encodedRow || !encodedColumn) return undefined;
  const rowIndex = rows.indexOf(decodeURIComponent(encodedRow));
  const columnIndex = columns.indexOf(decodeURIComponent(encodedColumn));
  if (rowIndex < 0 || columnIndex < 0) return undefined;
  const nextRow = keyName === "ArrowUp" ? Math.max(0, rowIndex - 1) : keyName === "ArrowDown" ? Math.min(rows.length - 1, rowIndex + 1) : rowIndex;
  const nextColumn = keyName === "ArrowLeft" ? Math.max(0, columnIndex - 1) : keyName === "ArrowRight" ? Math.min(columns.length - 1, columnIndex + 1) : columnIndex;
  const nextRowValue = rows[nextRow];
  const nextColumnValue = columns[nextColumn];
  if (!nextRowValue || !nextColumnValue) return undefined;
  return [categoryId, nextRowValue, nextColumnValue].map(encodeURIComponent).join("|");
}

/** A reusable labelled working-grid container shown by the selected workspace tab. */
export function renderGridCard({ id, label, active, locked, controls, content }: GridCardOptions): string {
  return `<section id="grid-${escapeHtml(id)}" role="tabpanel" aria-label="${escapeHtml(label)}" class="grid-card ${active ? "is-active" : ""} ${locked ? "is-locked" : "is-unlocked"}" data-grid-card="${escapeHtml(id)}"><div class="grid-card-header"><h3>${escapeHtml(label).replace(" × ", ' <span>×</span> ')}</h3><div class="grid-card-controls">${controls}</div></div>${content}</section>`;
}

/** Renders a complete ARIA tablist with roving tab focus. */
export function renderTabs(tabs: TabItem[], activeId: string): string {
  const buttons = tabs.map(tab => `<button role="tab" id="grid-tab-${escapeHtml(tab.id)}" aria-selected="${tab.id === activeId}" aria-controls="grid-${escapeHtml(tab.id)}" tabindex="${tab.id === activeId ? "0" : "-1"}" data-grid-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`).join("");
  return `${renderSelect({ id: "grid-select", label: "Working grid", ariaLabel: "Choose working grid", options: tabs, selectedId: activeId, className: "grid-picker" })}<div class="grid-navigation"><div class="grid-tabs" role="tablist" aria-label="Choose working grid">${buttons}</div></div>`;
}

/** Returns the next tab for the ARIA tab keyboard commands, wrapping at either end. */
export function nextTabId(tabs: TabItem[], activeId: string, key: string): string | undefined {
  const index = tabs.findIndex(tab => tab.id === activeId);
  if (index < 0 || tabs.length === 0) return undefined;
  if (key === "Home") return tabs[0]?.id;
  if (key === "End") return tabs.at(-1)?.id;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return undefined;
  const offset = key === "ArrowRight" ? 1 : -1;
  return tabs[(index + offset + tabs.length) % tabs.length]?.id;
}
