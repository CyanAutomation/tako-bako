import type { LevelCardOptions, PanelOptions, StatusOptions } from "./ui-types";
import { renderButton } from "./ui-buttons";
import { escapeHtml } from "./ui-escape";
import type { SnackbarMessage } from "./snackbar";

/** A consistent live message banner for loading, progress, and error feedback. */
export function renderStatus({ message, tone = "neutral" }: StatusOptions): string {
  if (!message) return "";
  return `<p class="status status--${tone}" role="status">${escapeHtml(message)}</p>`;
}

/** A transient, non-modal confirmation with a polite live announcement. */
export function renderSnackbar(snackbar: SnackbarMessage | undefined): string {
  if (!snackbar) return "";
  return `<div class="snackbar snackbar--${snackbar.tone}" role="status" aria-live="polite" aria-atomic="true" tabindex="0" data-snackbar-id="${snackbar.id}">${escapeHtml(snackbar.message)}</div>`;
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
