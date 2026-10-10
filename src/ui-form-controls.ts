import type { SegmentedControlOptions, SelectOptions } from "./ui-types";
import { renderButton } from "./ui-buttons";
import { escapeHtml } from "./ui-escape";

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
