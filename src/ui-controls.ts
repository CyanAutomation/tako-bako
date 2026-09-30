import type { ButtonOptions, IconName, LevelCardOptions, PanelOptions, SegmentedControlOptions, SelectOptions, StatusOptions } from "./ui-types";

const iconPaths: Record<IconName, string> = {
  share: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  undo: '<path d="M9 7 5 11l4 4"/><path d="M5 11h8a6 6 0 0 1 6 6"/>',
  reset: '<path d="M19 11a7 7 0 1 1-2-5"/><path d="M19 4v5h-5"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M16 10V7a4 4 0 0 0-7-2.7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sparkle: '<path d="m12 3 .8 5.2L18 9l-5.2.8L12 15l-.8-5.2L6 9l5.2-.8L12 3Z"/><path d="m19 15 .4 2.6L22 18l-2.6.4L19 21l-.4-2.6L16 18l2.6-.4L19 15Z"/>',
  "fast-forward": '<path d="m5 5 7 7-7 7V5Z"/><path d="m12 5 7 7-7 7V5Z"/>',
  "arrow-left": '<path d="m14 5-7 7 7 7"/><path d="M7 12h11"/>',
  "arrow-right": '<path d="m10 5 7 7-7 7"/><path d="M17 12H6"/>',
};

export const escapeHtml = (value: string) => value.replace(/[&<>'"`]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;", "`": "&#96;" })[character]!);

function renderIcon(icon: IconName): string {
  return `<svg class="icon icon--${icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[icon]}</svg>`;
}

function buttonClasses(icon: IconName | undefined, iconOnly: boolean, variant: NonNullable<ButtonOptions["variant"]>): string {
  if (icon && iconOnly) return `button button--icon button--${variant}`;
  if (icon) return `button button--with-icon button--${variant}`;
  return `button button--${variant}`;
}

function buttonDataAttributes(data: ButtonOptions["data"]): string {
  return Object.entries(data ?? {}).map(([name, value]) => {
    const attribute = name.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`);
    return ` data-${attribute}="${escapeHtml(value)}"`;
  }).join("");
}

function buttonAttributes(options: ButtonOptions): string {
  const id = options.id ? ` id="${escapeHtml(options.id)}"` : "";
  const accessibleName = options.icon
    ? ` aria-label="${escapeHtml(options.ariaLabel ?? options.label)}" title="${escapeHtml(options.label)}"`
    : options.ariaLabel ? ` aria-label="${escapeHtml(options.ariaLabel)}"` : "";
  const pressed = options.pressed === undefined ? "" : ` aria-pressed="${options.pressed}"`;
  const expanded = options.expanded === undefined ? "" : ` aria-expanded="${options.expanded}"`;
  const disabled = options.disabled ? " disabled" : "";
  return `${id} class="${buttonClasses(options.icon, Boolean(options.iconOnly), options.variant ?? "secondary")}"${accessibleName}${pressed}${expanded}${disabled}${buttonDataAttributes(options.data)}`;
}

function buttonContent(options: ButtonOptions): string {
  if (!options.icon) return escapeHtml(options.label);
  const icon = renderIcon(options.icon);
  return options.iconOnly ? icon : `${icon}<span>${escapeHtml(options.label)}</span>`;
}

/** A consistent semantic button used by page, toolbar, and settings actions. */
export function renderButton(options: ButtonOptions): string {
  return `<button${buttonAttributes(options)}>${buttonContent(options)}</button>`;
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

/** A compact visual label for counts and puzzle metadata. */
export function renderBadge(label: string, className = "badge"): string {
  return `<span class="${escapeHtml(className)}">${escapeHtml(label)}</span>`;
}

/** A consistent progression tile with an explicit visual and accessible state. */
export function renderLevelCard({ courseId, label, level, state }: LevelCardOptions): string {
  const stateLabel = state === "complete" ? "Complete" : state === "current" ? "Current" : state === "available" ? "Ready" : "Locked";
  return `<li class="course course--${state}">${renderButton({ label: String(level), ariaLabel: `${label}, ${state}`, variant: state === "current" ? "primary" : "secondary", disabled: state === "locked" || state === "current", data: { course: courseId } })}<span class="course-state" aria-hidden="true">${stateLabel}</span></li>`;
}

/** Groups related controls under one accessible label. */
export function renderControlGroup(label: string, controls: string, className = "control-group"): string {
  return `<div class="${escapeHtml(className)}" aria-label="${escapeHtml(label)}">${controls}</div>`;
}

/** A shared, mutually exclusive control for filters and compact mode choices. */
export function renderSegmentedControl({ label, items, className = "segmented-control" }: SegmentedControlOptions): string {
  return `<div class="${escapeHtml(className)}" role="group" aria-label="${escapeHtml(label)}">${items.map(item => renderButton({ label: item.label, pressed: item.selected, data: item.data })).join("")}</div>`;
}

/** A reusable native select with a visible label for compact configuration controls. */
export function renderSelect({ id, label, ariaLabel, options, selectedId, className = "select-control" }: SelectOptions): string {
  const entries = options.map(option => `<option value="${escapeHtml(option.id)}" ${option.id === selectedId ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  return `<label class="${escapeHtml(className)}">${escapeHtml(label)} <select id="${escapeHtml(id)}"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}>${entries}</select></label>`;
}
