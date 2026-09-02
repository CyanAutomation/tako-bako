export interface TabItem {
  id: string;
  label: string;
}

export interface ButtonOptions {
  id?: string;
  label: string;
  ariaLabel?: string;
  icon?: IconName;
  variant?: "primary" | "secondary" | "danger" | "assist";
  disabled?: boolean;
  /** State exposed by toggle-like controls. */
  pressed?: boolean;
  /** Application data hooks, emitted as escaped kebab-case data attributes. */
  data?: Record<string, string>;
}

/** Icons belong to one small rounded-stroke family so browser emoji never leak into the UI. */
export type IconName = "share" | "undo" | "reset" | "lock" | "unlock" | "check" | "sparkle";

const iconPaths: Record<IconName, string> = {
  share: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  undo: '<path d="M9 7 5 11l4 4"/><path d="M5 11h8a6 6 0 0 1 6 6"/>',
  reset: '<path d="M19 11a7 7 0 1 1-2-5"/><path d="M19 4v5h-5"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M16 10V7a4 4 0 0 0-7-2.7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sparkle: '<path d="m12 3 .8 5.2L18 9l-5.2.8L12 15l-.8-5.2L6 9l5.2-.8L12 3Z"/><path d="m19 15 .4 2.6L22 18l-2.6.4L19 21l-.4-2.6L16 18l2.6-.4L19 15Z"/>',
};

export function renderIcon(icon: IconName): string {
  return `<svg class="icon icon--${icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[icon]}</svg>`;
}

export interface DialogOptions {
  id: string;
  eyebrow?: string;
  title: string;
  description: string;
  actions: string;
}

export interface DisclosureOptions {
  className: string;
  summary: string;
  content: string;
  open?: boolean;
}

export interface SelectOptions {
  id: string;
  label: string;
  ariaLabel?: string;
  options: TabItem[];
  selectedId: string;
  className?: string;
}

export interface GridCardOptions {
  id: string;
  label: string;
  active: boolean;
  locked: boolean;
  controls: string;
  content: string;
}

export interface StatusOptions {
  message: string;
  tone?: "neutral" | "success" | "warning" | "error";
}

export interface PanelOptions {
  tag?: "aside" | "section";
  className: string;
  labelledBy?: string;
  content: string;
}

export interface GridCellOptions {
  key: string;
  row: string;
  column: string;
  mark: "unknown" | "yes" | "no";
  disabled?: boolean;
  tabIndex?: number;
}

export const escapeHtml = (value: string) => value.replace(/[&<>'"`]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;", "`": "&#96;" })[character]!);

/** A consistent semantic button used by page, toolbar, and settings actions. */
export function renderButton({ id, label, ariaLabel, icon, variant = "secondary", disabled = false, pressed, data }: ButtonOptions): string {
  const classes = icon ? `button button--icon button--${variant}` : `button button--${variant}`;
  const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";
  const accessibleName = icon ? ` aria-label="${escapeHtml(ariaLabel ?? label)}" title="${escapeHtml(label)}"` : ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : "";
  const pressedAttribute = pressed === undefined ? "" : ` aria-pressed="${pressed}"`;
  const dataAttributes = Object.entries(data ?? {}).map(([name, value]) => ` data-${name.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`)}="${escapeHtml(value)}"`).join("");
  return `<button${idAttribute} class="${classes}"${accessibleName}${pressedAttribute}${disabled ? " disabled" : ""}${dataAttributes}>${icon ? renderIcon(icon) : escapeHtml(label)}</button>`;
}

/** A consistent live message banner for loading, progress, and error feedback. */
export function renderStatus({ message, tone = "neutral" }: StatusOptions): string {
  return `<p class="status status--${tone}" role="status">${escapeHtml(message)}</p>`;
}

/** A semantic panel shell shared by supporting content such as clues. */
export function renderPanel({ tag = "section", className, labelledBy, content }: PanelOptions): string {
  const aria = labelledBy ? ` aria-labelledby="${escapeHtml(labelledBy)}"` : "";
  return `<${tag} class="${escapeHtml(className)}"${aria}>${content}</${tag}>`;
}

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

/** A compact visual label for counts and puzzle metadata. */
export function renderBadge(label: string, className = "badge"): string {
  return `<span class="${escapeHtml(className)}">${escapeHtml(label)}</span>`;
}

/** Groups related controls under one accessible label. */
export function renderControlGroup(label: string, controls: string, className = "control-group"): string {
  return `<div class="${escapeHtml(className)}" aria-label="${escapeHtml(label)}">${controls}</div>`;
}

/** A reusable, labelled native dialog. The caller owns its open state and actions. */
export function renderDialog({ id, eyebrow, title, description, actions }: DialogOptions): string {
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  return `<dialog id="${escapeHtml(id)}" class="confirm-modal" open aria-modal="true" aria-labelledby="${escapeHtml(titleId)}" aria-describedby="${escapeHtml(descriptionId)}">${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ""}<h2 id="${escapeHtml(titleId)}">${escapeHtml(title)}</h2><p id="${escapeHtml(descriptionId)}">${escapeHtml(description)}</p><div class="modal-actions">${actions}</div></dialog>`;
}

/** A consistent expandable shell for secondary controls and supporting panels. */
export function renderDisclosure({ className, summary, content, open = false }: DisclosureOptions): string {
  return `<details class="disclosure ${escapeHtml(className)}"${open ? " open" : ""}><summary>${summary}</summary><div class="disclosure-content">${content}</div></details>`;
}

/** A reusable native select with a visible label for compact configuration controls. */
export function renderSelect({ id, label, ariaLabel, options, selectedId, className = "select-control" }: SelectOptions): string {
  const entries = options.map(option => `<option value="${escapeHtml(option.id)}" ${option.id === selectedId ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  return `<label class="${escapeHtml(className)}">${escapeHtml(label)} <select id="${escapeHtml(id)}"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}>${entries}</select></label>`;
}

/** A reusable labelled working-grid container shown by the selected workspace tab. */
export function renderGridCard({ id, label, active, locked, controls, content }: GridCardOptions): string {
  return `<section id="grid-${escapeHtml(id)}" role="tabpanel" aria-label="${escapeHtml(label)}" class="grid-card ${active ? "is-active" : ""} ${locked ? "is-locked" : "is-unlocked"}" data-grid-card="${escapeHtml(id)}"><div class="grid-card-header"><h3>${escapeHtml(label).replace(" × ", ' <span>×</span> ')}</h3><div class="grid-card-controls">${controls}</div></div>${content}</section>`;
}

/** Renders a complete ARIA tablist with roving tab focus. */
export function renderTabs(tabs: TabItem[], activeId: string): string {
  const buttons = tabs.map(tab => `<button role="tab" id="grid-tab-${escapeHtml(tab.id)}" aria-selected="${tab.id === activeId}" aria-controls="grid-${escapeHtml(tab.id)}" tabindex="${tab.id === activeId ? "0" : "-1"}" data-grid-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`).join("");
  return `${renderSelect({ id: "grid-select", label: "Working grid", ariaLabel: "Choose working grid", options: tabs, selectedId: activeId, className: "grid-picker" })}<div class="grid-tabs" role="tablist" aria-label="Choose working grid">${buttons}</div>`;
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
