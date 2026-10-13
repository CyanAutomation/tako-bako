import type { Category } from "../puzzle";
import { clueStrategyLabel, type ClueStrategy } from "../clue-strategy-catalog";
import { escapeHtml } from "../ui-escape";
import { renderBadge, renderPanel } from "../ui-feedback";
import { renderButton } from "../ui-buttons";
import { renderSegmentedControl } from "../ui-form-controls";

export type ClueFilter = "all" | "remaining" | "used";

interface ClueItem {
  id: string;
  text: string;
  strategy?: ClueStrategy;
}

interface CluePanelOptions {
  clues: ClueItem[];
  activeCategory: Category;
  cluesOpen: boolean;
  usedClueIds: ReadonlySet<string>;
  clueFilter?: ClueFilter;
}

function clueIsRelated(clue: string, category: Category): boolean {
  const normalised = clue.toLocaleLowerCase();
  return category.values.some(value => normalised.includes(value.toLocaleLowerCase()));
}

function renderFilterControls(clueFilter: ClueFilter): string {
  return renderSegmentedControl({
    label: "Filter clues",
    className: "clue-filters",
    items: (["all", "remaining", "used"] as const).map(filter => ({
      id: filter,
      label: filter === "all" ? "All" : filter === "remaining" ? "To review" : "Used",
      selected: clueFilter === filter,
      data: { clueFilter: filter },
    })),
  });
}

function renderClueItem(clue: ClueItem, index: number, category: Category, usedClueIds: ReadonlySet<string>): string {
  const used = usedClueIds.has(clue.id);
  const related = clueIsRelated(clue.text, category);
  const strategy = clue.strategy
    ? `<span class="clue-strategy" title="Reasoning strategy">${escapeHtml(clueStrategyLabel(clue.strategy))}</span>`
    : "";
  const button = renderButton({
    label: used ? "✓" : String(index + 1),
    className: `clue-used${used ? " is-used" : ""}`,
    data: { clueId: clue.id },
    pressed: used,
    ariaLabel: `Mark clue ${index + 1} as ${used ? "unused" : "used"}`,
  });
  return `<li class="clue-item${related ? " clue-item--related" : ""}">${button}<span class="clue-item__content"><span>${escapeHtml(clue.text)}</span>${strategy}</span></li>`;
}

function visibleClues(clues: ClueItem[], clueFilter: ClueFilter, usedClueIds: ReadonlySet<string>) {
  return clues
    .map((clue, index) => ({ clue, index }))
    .filter(({ clue }) => clueFilter === "all" || (clueFilter === "used" ? usedClueIds.has(clue.id) : !usedClueIds.has(clue.id)));
}

export function renderCluePanel({ clues, activeCategory, cluesOpen, usedClueIds, clueFilter = "all" }: CluePanelOptions): string {
  const items = visibleClues(clues, clueFilter, usedClueIds)
    .map(({ clue, index }) => renderClueItem(clue, index, activeCategory, usedClueIds))
    .join("");
  const filterControls = renderFilterControls(clueFilter);
  const content = `<details class="clue-drawer" ${cluesOpen ? "open" : ""}><summary><span><span class="eyebrow">Tako’s notes</span><strong>Clues</strong></span>${renderBadge(`${clues.length} clues`, "clue-count")}</summary><div class="clue-content"><p class="eyebrow">Tako’s notes</p><h2 id="clues-title">Clues</h2><p class="clue-hint"><span class="category-chip">${escapeHtml(activeCategory.label)}</span> clues that mention this grid are highlighted.</p>${filterControls}<ol>${items}</ol></div></details>`;
  return renderPanel({ tag: "aside", className: "clues", labelledBy: "clues-title", content });
}
