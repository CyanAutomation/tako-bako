export const TIERS = ["beginner", "intermediate", "advanced"] as const;

export type Tier = typeof TIERS[number];
export type CourseId = `${Tier}-${1 | 2 | 3 | 4 | 5}`;

export interface Course {
  id: CourseId;
  tier: Tier;
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  templateId: "tournament-order-v1" | "open-division-v2" | "championship-circuit-v2";
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  description: string;
}

const tierDetails: Record<Tier, Pick<Course, "templateId" | "description">> = {
  beginner: { templateId: "tournament-order-v1", description: "A compact 4×4 introduction to logic-grid deduction." },
  intermediate: { templateId: "open-division-v2", description: "A broader 5×5 challenge with more possibilities to track." },
  advanced: { templateId: "championship-circuit-v2", description: "A dense 5×5 challenge across three working grids." },
};

const levels = [1, 2, 3, 4, 5] as const;

export const courses: readonly Course[] = TIERS.flatMap(tier => levels.map(level => ({
  id: `${tier}-${level}` as CourseId,
  tier,
  level,
  label: `${tier[0]!.toUpperCase()}${tier.slice(1)} Level ${level}`,
  difficultyLevel: level,
  ...tierDetails[tier],
})));

export function courseFor(tier: string | undefined, level: number | undefined): Course | undefined {
  return courses.find(course => course.tier === tier && course.level === level);
}

export function courseForId(id: string): Course | undefined {
  return courses.find(course => course.id === id);
}

export function nextCourse(course: Course): Course | undefined {
  return courses[courses.findIndex(candidate => candidate.id === course.id) + 1];
}

export function firstAvailableCourse(completed: readonly string[]): Course {
  const completedIds = new Set(completed);
  return courses.find(course => !completedIds.has(course.id)) ?? courses.at(-1)!;
}

/** Compact, player-facing progress copy used wherever the active course is surfaced. */
export function courseProgressLabel(course: Course, completed: ReadonlySet<string>): string {
  const completedInTier = courses.filter(candidate => candidate.tier === course.tier && completed.has(candidate.id)).length;
  const tierLabel = `${course.tier[0]!.toUpperCase()}${course.tier.slice(1)}`;
  return `${tierLabel} · ${completedInTier}/5 complete`;
}

export function puzzleParametersForCourse(course: Course): { templateId: Course["templateId"]; difficultyLevel: Course["difficultyLevel"] } {
  return { templateId: course.templateId, difficultyLevel: course.difficultyLevel };
}
