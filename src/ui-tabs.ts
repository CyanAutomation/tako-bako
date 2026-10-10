import { renderButton } from "./ui-buttons";
import { renderSelect } from "./ui-form-controls";
import type { TabItem } from "./ui-types";

/** Renders a complete ARIA tablist with roving tab focus. */
export function renderTabs(tabs: TabItem[], activeId: string): string {
  const buttons = tabs.map(tab => renderButton({
    label: tab.label,
    id: `grid-tab-${tab.id}`,
    role: "tab",
    ariaControls: `grid-${tab.id}`,
    selected: tab.id === activeId,
    tabIndex: tab.id === activeId ? 0 : -1,
    data: { gridTab: tab.id },
  })).join("");
  return `${renderSelect({ id: "grid-select", label: "Working grid", ariaLabel: "Choose working grid", options: tabs, selectedId: activeId, className: "grid-picker" })}<div class="grid-navigation"><div class="grid-tabs" role="tablist" aria-label="Choose working grid">${buttons}</div></div>`;
}

/** Returns the next tab for the ARIA tab keyboard commands, wrapping at either end. */
export function nextTabId(tabs: TabItem[], activeId: string, key: string): string | undefined {
  if (tabs.length === 0) return undefined;
  const index = tabs.findIndex(tab => tab.id === activeId);
  if (index < 0) return undefined;
  if (key === "Home") return tabs[0]?.id;
  if (key === "End") return tabs.at(-1)?.id;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return undefined;
  const offset = key === "ArrowRight" ? 1 : -1;
  return tabs[(index + offset + tabs.length) % tabs.length]?.id;
}
