import type { Category } from "./puzzle";
import { courses, TIERS, type CourseId } from "./curriculum";
import { escapeHtml, renderBadge, renderButton, renderControlGroup, renderInfoDisclosure, renderLevelCard, renderPanel, renderStatus, renderTabs } from "./ui";

export type ClueFilter = "all" | "remaining" | "used";

export function renderCurriculum({ completed, currentCourseId, showHeading = true }: { completed: ReadonlySet<string>; currentCourseId: CourseId; showHeading?: boolean }): string {
  return `<section class="curriculum"${showHeading ? ' aria-labelledby="curriculum-title"' : ""}>${showHeading ? '<div class="curriculum-heading"><div><p class="eyebrow">Your Puzzle Challenge</p><h2 id="curriculum-title">Choose your next level</h2></div><p>Complete each level to unlock the next.</p></div>' : ""}<div class="curriculum-tiers">${TIERS.map(tier => {
    const tierCourses = courses.filter(course => course.tier === tier);
    const title = `${tier[0]!.toUpperCase()}${tier.slice(1)}`;
    const description = escapeHtml(tierCourses[0]!.description);
    return `<section class="curriculum-tier curriculum-tier--${tier}" aria-label="${title} levels"><div class="curriculum-tier-heading"><h3>${title}</h3>${renderInfoDisclosure({ id: `${tier}-info`, label: `More information about ${title}`, content: `<p>${description}</p>` })}</div><ol>${tierCourses.map((course, index) => {
      const unlocked = index === 0 ? tier === "beginner" || completed.has(courses[courses.findIndex(candidate => candidate.id === course.id) - 1]!.id) : completed.has(tierCourses[index - 1]!.id);
      const state = completed.has(course.id) ? "complete" : course.id === currentCourseId ? "current" : unlocked ? "available" : "locked";
      return renderLevelCard({ courseId: course.id, label: course.label, level: course.level, state });
    }).join("")}</ol></section>`;
  }).join("")}</div></section>`;
}

export function renderPuzzleHeader({ title, difficulty, message }: { title: string; difficulty: string; message: string }): string {
  return `<section class="puzzle-heading"><div><p class="eyebrow">Yokaiba Logic Dojo</p><h1>${escapeHtml(title)}</h1>${renderStatus({ message, tone: message.includes("could not") || message.includes("busy") ? "error" : "neutral" })}</div>${renderBadge(difficulty, "difficulty")}</section>`;
}

export function renderBoardToolbar({ matches, total, undoDisabled, checkDisabled, assist }: { matches: number; total: number; undoDisabled: boolean; checkDisabled: boolean; assist: boolean }): string {
  const checkHint = checkDisabled ? "Find one match in every row and column, then check your solution." : "You’re ready to check your solution.";
  const assistLabel = `Auto elimination: ${assist ? "on" : "off"}`;
  // Fixed board-action hierarchy: reversible utilities → optional toggles → the primary solve action.
  const actions = `${renderButton({ id: "undo", label: "Undo last mark", icon: "undo", disabled: undoDisabled, data: { actionRole: "utility" } })}${renderButton({ id: "assist-toggle", label: assistLabel, icon: "sparkle", variant: "assist", pressed: assist, data: { actionRole: "toggle" } })}${renderButton({ id: "check-solution", label: "Check solution", icon: "check", variant: "primary", disabled: checkDisabled, data: { actionRole: "primary" } })}`;
  const progress = total === 0 ? 0 : Math.round((matches / total) * 100);
  return `<div class="workspace-bar"><div class="readiness-meter" aria-label="${matches} of ${total} matches found"><div class="readiness-meter__copy"><p class="progress">${matches} of ${total} matches found</p><p class="check-hint">${checkHint}</p></div><span class="readiness-meter__bar" aria-hidden="true"><span style="width:${progress}%"></span></span></div>${renderControlGroup("Board actions", actions, "board-actions")}</div>`;
}

export function renderGridWorkspace({ categories, activeGridId, toolbar = "", grids }: { categories: { id: string; label: string }[]; activeGridId: string; toolbar?: string; grids: string }): string {
  return `<div class="board-workspace">${toolbar}${renderTabs(categories, activeGridId)}<p class="legend legend--quiet"><span class="legend-mark yes">✓</span> match <span class="legend-mark no">×</span> rule out <span class="legend-mark unknown"></span> unmarked <span class="legend-tip">Select a square to cycle its mark · use arrow keys to move.</span></p><section class="grids" aria-label="Logic grids">${grids}</section></div>`;
}

function clueIsRelated(clue: string, category: Category): boolean {
  const normalised = clue.toLocaleLowerCase();
  return category.values.some(value => normalised.includes(value.toLocaleLowerCase()));
}

export function renderCluePanel({ clues, activeCategory, cluesOpen, usedClueIds, clueFilter = "all" }: { clues: { id: string; text: string }[]; activeCategory: Category; cluesOpen: boolean; usedClueIds: ReadonlySet<string>; clueFilter?: ClueFilter }): string {
  const visibleClues = clues.filter(clue => clueFilter === "all" || (clueFilter === "used" ? usedClueIds.has(clue.id) : !usedClueIds.has(clue.id)));
  const filterControls = (["all", "remaining", "used"] as const).map(filter => renderButton({ label: filter === "all" ? "All" : filter === "remaining" ? "Unmarked" : "Used", pressed: clueFilter === filter, data: { clueFilter: filter } })).join("");
  return renderPanel({
    tag: "aside", className: "clues", labelledBy: "clues-title",
    content: `<details class="clue-drawer" ${cluesOpen ? "open" : ""}><summary><span><span class="eyebrow">Tako’s notes</span><strong>Clues</strong></span>${renderBadge(`${clues.length} clues`, "clue-count")}</summary><div class="clue-content"><p class="eyebrow">Tako’s notes</p><h2 id="clues-title">Clues</h2><p class="clue-hint"><span class="category-chip">${escapeHtml(activeCategory.label)}</span> clues that mention this grid are highlighted.</p><div class="clue-filters" role="group" aria-label="Filter clues">${filterControls}</div><ol>${visibleClues.map(clue => { const index = clues.indexOf(clue); const related = clueIsRelated(clue.text, activeCategory); return `<li class="clue-item${related ? " clue-item--related" : ""}"><button class="clue-used ${usedClueIds.has(clue.id) ? "is-used" : ""}" data-clue-id="${escapeHtml(clue.id)}" aria-pressed="${usedClueIds.has(clue.id)}" aria-label="Mark clue ${index + 1} as ${usedClueIds.has(clue.id) ? "unused" : "used"}">${usedClueIds.has(clue.id) ? "✓" : index + 1}</button><span>${escapeHtml(clue.text)}</span></li>`; }).join("")}</ol></div></details>`,
  });
}
