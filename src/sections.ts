import type { Category } from "./puzzle";
import { courses, TIERS, type CourseId } from "./curriculum";
import { escapeHtml, renderBadge, renderButton, renderControlGroup, renderPanel, renderStatus, renderTabs } from "./ui";

export type ClueFilter = "all" | "remaining" | "used";

export function renderCurriculum({ completed, currentCourseId, showHeading = true }: { completed: ReadonlySet<string>; currentCourseId: CourseId; showHeading?: boolean }): string {
  return `<section class="curriculum"${showHeading ? ' aria-labelledby="curriculum-title"' : ""}>${showHeading ? '<div class="curriculum-heading"><div><p class="eyebrow">Your route through the dojo</p><h2 id="curriculum-title">Puzzle Challenge</h2></div><p>Complete each level to unlock the next.</p></div>' : ""}<div class="curriculum-tiers">${TIERS.map(tier => {
    const tierCourses = courses.filter(course => course.tier === tier);
    const title = `${tier[0]!.toUpperCase()}${tier.slice(1)}`;
    return `<section class="curriculum-tier curriculum-tier--${tier}" aria-label="${title} levels"><h3>${title}</h3><p>${escapeHtml(tierCourses[0]!.description)}</p><ol>${tierCourses.map((course, index) => {
      const unlocked = index === 0 ? tier === "beginner" || completed.has(courses[courses.findIndex(candidate => candidate.id === course.id) - 1]!.id) : completed.has(tierCourses[index - 1]!.id);
      const state = completed.has(course.id) ? "complete" : course.id === currentCourseId ? "current" : unlocked ? "available" : "locked";
      const stamp = state === "complete" ? "✓" : state === "current" ? "✦" : state === "available" ? "•" : "";
      return `<li class="course course--${state}">${renderButton({ label: `Level ${course.level}`, ariaLabel: course.label, variant: course.id === currentCourseId ? "primary" : "secondary", disabled: !unlocked, data: { course: course.id } })}<span class="course-stamp course-stamp--${state}" aria-label="${state}">${stamp}</span><span class="course-state">${state === "complete" ? "Complete" : state === "current" ? "Current" : state === "locked" ? "Locked" : "Ready"}</span></li>`;
    }).join("")}</ol></section>`;
  }).join("")}</div></section>`;
}

export function renderPuzzleHeader({ title, difficulty, message }: { title: string; difficulty: string; message: string }): string {
  return `<section class="puzzle-heading"><div><p class="eyebrow">Yokaiba logic dojo</p><h1>${escapeHtml(title)}</h1>${renderStatus({ message, tone: message.includes("could not") || message.includes("busy") ? "error" : "neutral" })}</div>${renderBadge(difficulty, "difficulty")}</section>`;
}

export function renderBoardToolbar({ marked, total, undoDisabled, checkDisabled, assist }: { marked: number; total: number; undoDisabled: boolean; checkDisabled: boolean; assist: boolean }): string {
  const checkHint = checkDisabled ? "Finish one ✓ in every row and column to check." : "Your board is ready to check.";
  const assistLabel = `Auto-eliminate: ${assist ? "on" : "off"}`;
  const stateControls = `${renderButton({ id: "undo", label: "Undo last mark", icon: "undo", disabled: undoDisabled })}${renderButton({ id: "assist-toggle", label: assistLabel, icon: "sparkle", iconPlacement: "start", variant: "assist", pressed: assist })}`;
  const progress = Math.round((marked / total) * 100);
  return `<div class="workspace-bar"><div class="readiness-meter" aria-label="${marked} of ${total} possibilities noted"><div class="readiness-meter__copy"><p class="progress">${marked} / ${total} possibilities noted</p><p class="check-hint">${checkHint}</p></div><span class="readiness-meter__bar" aria-hidden="true"><span style="width:${progress}%"></span></span></div><div class="workspace-actions">${renderControlGroup("Board tools", stateControls, "board-state-controls")}${renderButton({ id: "check-solution", label: "Check solution", variant: "primary", disabled: checkDisabled })}</div></div>`;
}

export function renderGridWorkspace({ categories, activeGridId, toolbar = "", grids }: { categories: { id: string; label: string }[]; activeGridId: string; toolbar?: string; grids: string }): string {
  return `<div class="board-workspace">${toolbar}${renderTabs(categories, activeGridId)}<p class="legend"><span class="legend-mark yes">✓</span> match <span class="legend-mark no">×</span> rule out <span class="legend-mark unknown"></span> undecided <span class="legend-tip">Use arrow keys within a grid.</span></p><section class="grids" aria-label="Logic grids">${grids}</section></div>`;
}

function clueIsRelated(clue: string, category: Category): boolean {
  const normalised = clue.toLocaleLowerCase();
  return category.values.some(value => normalised.includes(value.toLocaleLowerCase()));
}

export function renderCluePanel({ clues, activeCategory, cluesOpen, usedClueIds, clueFilter = "all" }: { clues: { id: string; text: string }[]; activeCategory: Category; cluesOpen: boolean; usedClueIds: ReadonlySet<string>; clueFilter?: ClueFilter }): string {
  const visibleClues = clues.filter(clue => clueFilter === "all" || (clueFilter === "used" ? usedClueIds.has(clue.id) : !usedClueIds.has(clue.id)));
  const filterControls = (["all", "remaining", "used"] as const).map(filter => renderButton({ label: filter === "all" ? "All" : filter === "remaining" ? "To use" : "Used", pressed: clueFilter === filter, data: { clueFilter: filter } })).join("");
  return renderPanel({
    tag: "aside", className: "clues", labelledBy: "clues-title",
    content: `<details class="clue-drawer" ${cluesOpen ? "open" : ""}><summary><span><span class="eyebrow">Sensei’s notes</span><strong>Clues</strong></span>${renderBadge(`${clues.length} clues`, "clue-count")}</summary><div class="clue-content"><p class="eyebrow">Sensei’s notes</p><h2 id="clues-title">Clues</h2><p class="clue-hint"><span class="category-chip">${escapeHtml(activeCategory.label)}</span> clues are highlighted for this grid.</p><div class="clue-filters" role="group" aria-label="Filter clues">${filterControls}</div><ol>${visibleClues.map(clue => { const index = clues.indexOf(clue); return `<li class="${clueIsRelated(clue.text, activeCategory) ? "is-related" : ""}"><button class="clue-used ${usedClueIds.has(clue.id) ? "is-used" : ""}" data-clue-id="${escapeHtml(clue.id)}" aria-pressed="${usedClueIds.has(clue.id)}" aria-label="Mark clue ${index + 1} as ${usedClueIds.has(clue.id) ? "unused" : "used"}">${usedClueIds.has(clue.id) ? "✓" : index + 1}</button><span>${escapeHtml(clue.text)}</span></li>`; }).join("")}</ol></div></details>`,
  });
}
