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
  attributes?: string;
}

export interface GridCardOptions {
  id: string;
  label: string;
  active: boolean;
  content: string;
}

const escapeHtml = (value: string) => value.replace(/[&<>'"`]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;", "`": "&#96;" })[character]!);

/** A consistent semantic button used by page, toolbar, and settings actions. */
export function renderButton({ id, label, icon, variant = "secondary", disabled = false, attributes = "" }: ButtonOptions): string {
  const classes = icon ? "button button--icon" : `button button--${variant}`;
  const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";
  const accessibleName = icon ? ` aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"` : "";
  return `<button${idAttribute} class="${classes}"${accessibleName}${disabled ? " disabled" : ""}${attributes ? ` ${attributes}` : ""}>${icon ? `<span aria-hidden="true">${escapeHtml(icon)}</span>` : escapeHtml(label)}</button>`;
}

/** A reusable labelled working-grid container for desktop stacks and mobile panels. */
export function renderGridCard({ id, label, active, content }: GridCardOptions): string {
  return `<section id="grid-${escapeHtml(id)}" role="tabpanel" aria-label="${escapeHtml(label)}" class="grid-card ${active ? "is-active" : ""}" data-grid-card="${escapeHtml(id)}"><h3>${escapeHtml(label).replace(" × ", ' <span>×</span> ')}</h3>${content}</section>`;
}

/** Renders a complete ARIA tablist with roving tab focus. */
export function renderTabs(tabs: TabItem[], activeId: string): string {
  const options = tabs.map(tab => `<option value="${escapeHtml(tab.id)}" ${tab.id === activeId ? "selected" : ""}>${escapeHtml(tab.label)}</option>`).join("");
  const buttons = tabs.map(tab => `<button role="tab" id="grid-tab-${escapeHtml(tab.id)}" aria-selected="${tab.id === activeId}" aria-controls="grid-${escapeHtml(tab.id)}" tabindex="${tab.id === activeId ? "0" : "-1"}" data-grid-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`).join("");
  return `<label class="grid-picker">Working grid <select id="grid-select" aria-label="Choose working grid">${options}</select></label><div class="grid-tabs" role="tablist" aria-label="Choose working grid">${buttons}</div>`;
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
