import { renderTabs } from "../ui-tabs";

export function renderGridWorkspace({ categories, activeGridId, toolbar = "", grids }: { categories: { id: string; label: string }[]; activeGridId: string; toolbar?: string; grids: string }): string {
  return `<div class="board-workspace">${toolbar}${renderTabs(categories, activeGridId)}<p class="legend legend--quiet"><span class="legend-mark yes">✓</span> match <span class="legend-mark no">×</span> rule out <span class="legend-mark unknown"></span> unmarked <span class="legend-tip">Select a square to cycle its mark · use arrow keys to move.</span></p><section class="grids" aria-label="Logic grids">${grids}</section></div>`;
}
