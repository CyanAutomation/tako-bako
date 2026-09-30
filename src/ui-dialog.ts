import { escapeHtml } from "./ui-controls";
import type { DialogOptions, DisclosureOptions, InfoDisclosureOptions } from "./ui-types";

const DIALOG_FOCUSABLE_SELECTOR = "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

/** Moves focus to the next or previous available control and wraps at the dialog ends. */
export function trapDialogTab(
  event: Pick<KeyboardEvent, "preventDefault">,
  dialog: Pick<HTMLDialogElement, "querySelectorAll"> | null,
  activeElement: Element | null,
  shiftKey = false,
): boolean {
  const focusable = [...(dialog?.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR) ?? [])];
  if (focusable.length === 0) return false;
  const currentIndex = focusable.indexOf(activeElement as HTMLElement);
  const nextIndex = shiftKey
    ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
    : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
  event.preventDefault();
  focusable[nextIndex]?.focus();
  return true;
}

/** A reusable labelled native dialog. The caller owns its open state and actions. */
export function renderDialog({ id, eyebrow, title, description, content, actions, className = "" }: DialogOptions): string {
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const classes = ["confirm-modal", className].filter(Boolean).map(escapeHtml).join(" ");
  return `<dialog id="${escapeHtml(id)}" class="${classes}" open aria-modal="true" aria-labelledby="${escapeHtml(titleId)}" aria-describedby="${escapeHtml(descriptionId)}">${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ""}<h2 id="${escapeHtml(titleId)}">${escapeHtml(title)}</h2><p id="${escapeHtml(descriptionId)}">${escapeHtml(description)}</p>${content ? `<div class="dialog-content">${content}</div>` : ""}<div class="modal-actions">${actions}</div></dialog>`;
}

/** A consistent expandable shell for secondary controls and supporting panels. */
export function renderDisclosure({ className, summary, content, open = false }: DisclosureOptions): string {
  return `<details class="disclosure ${escapeHtml(className)}"${open ? " open" : ""}><summary>${summary}</summary><div class="disclosure-content">${content}</div></details>`;
}

/** A compact native disclosure for optional explanatory copy beside a heading. */
export function renderInfoDisclosure({ id, label, content }: InfoDisclosureOptions): string {
  return `<details id="${escapeHtml(id)}" class="info-disclosure"><summary aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">i</summary><div class="info-disclosure__content">${content}</div></details>`;
}
