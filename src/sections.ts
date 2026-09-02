import type { Category } from "./puzzle";
import { courses, TIERS, type CourseId } from "./curriculum";
import { escapeHtml, renderBadge, renderButton, renderControlGroup, renderDisclosure, renderPanel, renderStatus, renderTabs } from "./ui";

export function renderCurriculum({ completed, currentCourseId }: { completed: ReadonlySet<string>; currentCourseId: CourseId }): string {
  return `<section class="curriculum" aria-labelledby="curriculum-title"><div class="curriculum-heading"><div><p class="eyebrow">Your route through the dojo</p><h2 id="curriculum-title">Puzzle Challenge</h2></div><p>Complete each level to unlock the next.</p></div><div class="curriculum-tiers">${TIERS.map(tier => {
    const tierCourses = courses.filter(course => course.tier === tier);
    const title = `${tier[0]!.toUpperCase()}${tier.slice(1)}`;
    return `<section class="curriculum-tier curriculum-tier--${tier}" aria-label="${title} levels"><h3>${title}</h3><p>${escapeHtml(tierCourses[0]!.description)}</p><ol>${tierCourses.map((course, index) => {
      const unlocked = index === 0 ? tier === "beginner" || completed.has(courses[courses.findIndex(candidate => candidate.id === course.id) - 1]!.id) : completed.has(tierCourses[index - 1]!.id);
      const state = completed.has(course.id) ? "complete" : course.id === currentCourseId ? "current" : unlocked ? "available" : "locked";
      return `<li class="course course--${state}">${renderButton({ label: `Level ${course.level}`, ariaLabel: course.label, variant: course.id === currentCourseId ? "primary" : "secondary", disabled: !unlocked, data: { course: course.id } })}<span>${state === "complete" ? "Complete" : state === "current" ? "Current" : state === "locked" ? "Locked" : "Available"}</span></li>`;
    }).join("")}</ol></section>`;
  }).join("")}</div></section>`;
}

export function renderPuzzleHeader({ title, difficulty, message }: { title: string; difficulty: string; message: string }): string {
  return `<section class="puzzle-heading"><div><p class="eyebrow">Yokaiba logic dojo</p><h1>${escapeHtml(title)}</h1>${renderStatus({ message, tone: message.includes("could not") || message.includes("busy") ? "error" : "neutral" })}</div>${renderBadge(difficulty, "difficulty")}</section>`;
}

export function renderBoardToolbar({ marked, total, undoDisabled, checkDisabled }: { marked: number; total: number; undoDisabled: boolean; checkDisabled: boolean }): string {
  const checkHint = checkDisabled ? "Finish one ✓ in every row and column to check." : "Your board is ready to check.";
  return `<div class="workspace-bar"><div><p class="progress" aria-label="Board progress">${marked} / ${total} possibilities noted</p><p class="check-hint">${checkHint}</p></div><div class="workspace-actions">${renderControlGroup("Board tools", renderButton({ id: "undo", label: "Undo last mark", icon: "undo", disabled: undoDisabled }), "history-controls")}${renderButton({ id: "check-solution", label: "Check solution", variant: "primary", disabled: checkDisabled })}</div></div>`;
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
  return renderDisclosure({ className: "puzzle-settings", summary: "Board settings", open: settingsOpen, content: `<p class="setting-copy">Assist automatically rules out the other choices after a confirmed match.</p>${renderButton({ id: "assist-toggle", label: assistLabel, icon: "sparkle", variant: "assist", pressed: assist })}<label class="seed-entry">Shared puzzle <input id="seed-input" value="${escapeHtml(seed)}" maxlength="128" pattern="[a-zA-Z0-9-]+">${renderButton({ id: "open-seed", label: "Open" })}</label>` });
}
