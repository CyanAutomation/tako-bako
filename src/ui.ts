export interface TabItem {
  id: string;
  label: string;
}

export interface ButtonOptions {
  id?: string;
  label: string;
  icon?: string;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  /** State exposed by toggle-like controls. */
  pressed?: boolean;
  /** Application data hooks, emitted as escaped kebab-case data attributes. */
  data?: Record<string, string>;
}

export interface DialogOptions {
  id: string;
  eyebrow?: string;
  title: string;
  description: string;
  actions: string;
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

const escapeHtml = (value: string) => value.replace(/[&<>'"`]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;", "`": "&#96;" })[character]!);

/** A consistent semantic button used by page, toolbar, and settings actions. */
export function renderButton({ id, label, icon, variant = "secondary", disabled = false, pressed, data }: ButtonOptions): string {
  const classes = icon ? "button button--icon" : `button button--${variant}`;
  const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";
  const accessibleName = icon ? ` aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"` : "";
  const pressedAttribute = pressed === undefined ? "" : ` aria-pressed="${pressed}"`;
  const dataAttributes = Object.entries(data ?? {}).map(([name, value]) => ` data-${name.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`)}="${escapeHtml(value)}"`).join("");
  return `<button${idAttribute} class="${classes}"${accessibleName}${pressedAttribute}${disabled ? " disabled" : ""}${dataAttributes}>${icon ? `<span aria-hidden="true">${escapeHtml(icon)}</span>` : escapeHtml(label)}</button>`;
}

/** A reusable, labelled native dialog. The caller owns its open state and actions. */
export function renderDialog({ id, eyebrow, title, description, actions }: DialogOptions): string {
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  return `<dialog id="${escapeHtml(id)}" class="confirm-modal" open aria-modal="true" aria-labelledby="${escapeHtml(titleId)}" aria-describedby="${escapeHtml(descriptionId)}">${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ""}<h2 id="${escapeHtml(titleId)}">${escapeHtml(title)}</h2><p id="${escapeHtml(descriptionId)}">${escapeHtml(description)}</p><div class="modal-actions">${actions}</div></dialog>`;
}

/** A reusable native select with a visible label for compact configuration controls. */
export function renderSelect({ id, label, ariaLabel, options, selectedId, className = "select-control" }: SelectOptions): string {
  const entries = options.map(option => `<option value="${escapeHtml(option.id)}" ${option.id === selectedId ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  return `<label class="${escapeHtml(className)}">${escapeHtml(label)} <select id="${escapeHtml(id)}"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}>${entries}</select></label>`;
}

/** A reusable labelled working-grid container for desktop stacks and mobile panels. */
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
