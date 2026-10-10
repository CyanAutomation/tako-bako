import { courses, TIERS, type CourseId } from "../curriculum";
import { renderLevelCard } from "../ui-feedback";
import { escapeHtml } from "../ui-escape";
import { renderInfoDisclosure } from "../ui-dialog";

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
