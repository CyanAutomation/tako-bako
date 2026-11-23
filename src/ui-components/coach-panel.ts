import { escapeHtml } from "../ui-escape.js";
import { renderButton } from "../ui-buttons.js";

export interface CoachPanelOptions {
  kind: "hint" | "learning";
  label: string;
  eyebrow: string;
  title: string;
  body: string;
  actionLabel?: string;
  focusClueLabel?: string;
}

/** Shared accessible fallback and A2UI mount shell for coaching surfaces. */
export function renderCoachPanel({ kind, label, eyebrow, title, body, actionLabel, focusClueLabel }: CoachPanelOptions): string {
  const isHint = kind === "hint";
  const sectionClass = isHint ? "hint-coach" : "learning-recommendation";
  const fallbackClass = isHint ? "hint-coach-fallback" : "learning-recommendation-fallback";
  const targetClass = isHint ? "hint-coach-a2ui" : "learning-recommendation-a2ui";
  const targetAttribute = isHint ? "data-a2ui-hint-coach" : "data-a2ui-learning-recommendation";
  const action = isHint && actionLabel
    ? renderButton({ label: actionLabel, className: "button button--secondary", data: { dismissHint: "true" } })
    : "";
  const reviewAction = isHint && focusClueLabel
    ? renderButton({ label: focusClueLabel, className: "button button--secondary", data: { reviewHintClue: "true" } })
    : "";

  return `<section class="${sectionClass} coach-panel" aria-label="${escapeHtml(label)}"><div class="${fallbackClass}"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p>${reviewAction}${action}</div><div class="${targetClass} coach-panel__surface" ${targetAttribute} hidden></div></section>`;
}
