import type { ButtonOptions, IconName } from "./ui-types";
import { escapeHtml } from "./ui-escape";

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

function stringAttribute(name: string, value: string | undefined): string {
  return value ? ` ${name}="${escapeHtml(value)}"` : "";
}

function booleanAttribute(name: string, value: boolean | undefined): string {
  return value === undefined ? "" : ` ${name}="${value}"`;
}

function buttonAccessibleName(options: ButtonOptions): string {
  const label = options.icon ? options.ariaLabel ?? options.label : options.ariaLabel;
  if (!label) return "";
  const title = options.icon ? ` title="${escapeHtml(options.label)}"` : "";
  return ` aria-label="${escapeHtml(label)}"${title}`;
}

function buttonAttributes(options: ButtonOptions): string {
  const disabled = options.disabled ? " disabled" : "";
  const className = escapeHtml(options.className ?? buttonClasses(options.icon, Boolean(options.iconOnly), options.variant ?? "secondary"));
  const tabIndex = options.tabIndex === undefined ? "" : ` tabindex="${options.tabIndex}"`;
  return `${stringAttribute("id", options.id)} class="${className}"${stringAttribute("role", options.role)}`
    + `${stringAttribute("aria-controls", options.ariaControls)}${booleanAttribute("aria-selected", options.selected)}`
    + `${tabIndex}${buttonAccessibleName(options)}${booleanAttribute("aria-pressed", options.pressed)}`
    + `${booleanAttribute("aria-expanded", options.expanded)}${disabled}${buttonDataAttributes(options.data)}`;
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
