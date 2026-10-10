import { renderButton } from "./ui-buttons";
import { escapeHtml } from "./ui-escape";
import type { GridCardOptions, GridCellOptions } from "./ui-types";

/** A standard three-state puzzle-grid control with a descriptive accessible name. */
export function renderGridCell({ key, row, column, mark, disabled = false, tabIndex }: GridCellOptions): string {
  const symbols = { unknown: "", yes: "✓", no: "×" };
  const button = renderButton({
    label: symbols[mark],
    ariaLabel: gridCellLabel(row, column, mark, disabled),
    className: `mark mark-${mark}`,
    data: { square: key },
    disabled,
    ...(disabled ? {} : { tabIndex: tabIndex ?? -1 }),
  });
  return `<td>${button}</td>`;
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
