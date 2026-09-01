import type { Category } from "./puzzle";
import { escapeHtml, renderBadge, renderButton, renderControlGroup, renderPanel, renderStatus, renderTabs } from "./ui";

export function renderPuzzleHeader({ title, difficulty, message }: { title: string; difficulty: string; message: string }): string {
  return `<section class="puzzle-heading"><div><p class="eyebrow">Yokaiba logic dojo</p><h1>${escapeHtml(title)}</h1>${renderStatus({ message, tone: message.includes("could not") || message.includes("busy") ? "error" : "neutral" })}</div>${renderBadge(difficulty, "difficulty")}</section>`;
}

export function renderBoardToolbar({ marked, total, undoDisabled, checkDisabled }: { marked: number; total: number; undoDisabled: boolean; checkDisabled: boolean }): string {
  return `<div class="workspace-bar"><p class="progress" aria-label="Board progress">${marked} / ${total} possibilities noted</p><div class="workspace-actions">${renderControlGroup("Board tools", renderButton({ id: "undo", label: "Undo last mark", icon: "undo", disabled: undoDisabled }), "history-controls")}${renderButton({ id: "check-solution", label: "Check solution", variant: "primary", disabled: checkDisabled })}</div></div>`;
}

export function renderGridWorkspace({ categories, activeGridId, toolbar = "", grids }: { categories: { id: string; label: string }[]; activeGridId: string; toolbar?: string; grids: string }): string {
  return `<div class="board-workspace">${toolbar}${renderTabs(categories, activeGridId)}<p class="legend"><span class="legend-mark yes">✓</span> match <span class="legend-mark no">×</span> rule out <span class="legend-mark unknown"></span> undecided <span class="legend-tip">Use arrow keys within a grid.</span></p><section class="grids" aria-label="Logic grids">${grids}</section></div>`;
}

function clueIsRelated(clue: string, category: Category): boolean {
  const normalised = clue.toLocaleLowerCase();
  return category.values.some(value => normalised.includes(value.toLocaleLowerCase()));
}

export function renderCluePanel({ clues, activeCategory, cluesOpen, usedClueIds }: { clues: { id: string; text: string }[]; activeCategory: Category; cluesOpen: boolean; usedClueIds: ReadonlySet<string> }): string {
  return renderPanel({
    tag: "aside", className: "clues", labelledBy: "clues-title",
    content: `<details class="clue-drawer" ${cluesOpen ? "open" : ""}><summary><span><span class="eyebrow">Sensei’s notes</span><strong>Clues</strong></span>${renderBadge(`${clues.length} clues`, "clue-count")}</summary><div class="clue-content"><p class="eyebrow">Sensei’s notes</p><h2 id="clues-title">Clues</h2><p class="clue-hint">Clues mentioning ${escapeHtml(activeCategory.label)} are highlighted.</p><ol>${clues.map((clue, index) => `<li class="${clueIsRelated(clue.text, activeCategory) ? "is-related" : ""}"><button class="clue-used ${usedClueIds.has(clue.id) ? "is-used" : ""}" data-clue-id="${escapeHtml(clue.id)}" aria-pressed="${usedClueIds.has(clue.id)}" aria-label="Mark clue ${index + 1} as ${usedClueIds.has(clue.id) ? "unused" : "used"}">${usedClueIds.has(clue.id) ? "✓" : index + 1}</button><span>${escapeHtml(clue.text)}</span></li>`).join("")}</ol></div></details>`,
  });
}

export function renderPuzzleSettings({ seed, settingsOpen, assist }: { seed: string; settingsOpen: boolean; assist: boolean }): string {
  const assistLabel = `Auto-eliminate is ${assist ? "on" : "off"}`;
  return `<details class="puzzle-settings" ${settingsOpen ? "open" : ""}><summary>Board settings</summary><div><p class="setting-copy">Assist automatically rules out the other choices after a confirmed match.</p>${renderButton({ id: "assist-toggle", label: assistLabel, icon: "sparkle", variant: "assist", pressed: assist })}<label class="seed-entry">Shared puzzle <input id="seed-input" value="${escapeHtml(seed)}" maxlength="128" pattern="[a-zA-Z0-9-]+">${renderButton({ id: "open-seed", label: "Open" })}</label></div></details>`;
}
