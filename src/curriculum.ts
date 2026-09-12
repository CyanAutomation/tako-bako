export const TIERS = ["beginner", "intermediate", "advanced"] as const;

export type Tier = typeof TIERS[number];
export type CourseId = `${Tier}-${1 | 2 | 3 | 4}`;

export interface Course {
  id: CourseId;
  tier: Tier;
  level: 1 | 2 | 3 | 4;
  label: string;
  templateId: "tournament-order-v2" | "open-division-v2" | "championship-bridge-v1" | "championship-circuit-v2";
  difficultyLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  description: string;
}

const levels = [1, 2, 3, 4] as const;
const tierDetails: Record<Tier, readonly Pick<Course, "templateId" | "difficultyLevel" | "description">[]> = {
  beginner: levels.map(difficultyLevel => ({ templateId: "tournament-order-v2", difficultyLevel, description: "A compact 4×4 introduction with no-guess beginner puzzles." })),
  intermediate: [
    { templateId: "open-division-v2", difficultyLevel: 5, description: "A broader 5×5 challenge with more possibilities to track." },
    { templateId: "open-division-v2", difficultyLevel: 6, description: "A broader 5×5 challenge with more possibilities to track." },
    { templateId: "open-division-v2", difficultyLevel: 7, description: "A broader 5×5 challenge with more possibilities to track." },
    { templateId: "championship-bridge-v1", difficultyLevel: 8, description: "A five-row bridge into the expert three-grid board." },
  ],
  advanced: [
    { templateId: "championship-bridge-v1", difficultyLevel: 9, description: "Complete the bridge before the Championship Circuit." },
    { templateId: "championship-circuit-v2", difficultyLevel: 10, description: "A dense 5×5 challenge across three working grids." },
    { templateId: "championship-circuit-v2", difficultyLevel: 11, description: "A dense 5×5 challenge across three working grids." },
    { templateId: "championship-circuit-v2", difficultyLevel: 12, description: "A dense 5×5 challenge across three working grids." },
  ],
};

export const courses: readonly Course[] = TIERS.flatMap(tier => levels.map((level, index) => ({
  id: `${tier}-${level}` as CourseId,
  tier,
  level,
  label: `${tier[0]!.toUpperCase()}${tier.slice(1)} Level ${level}`,
  ...tierDetails[tier][index]!,
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
  return `${tierLabel} · ${completedInTier}/4 complete`;
}

export function puzzleParametersForCourse(course: Course): { templateId: Course["templateId"]; difficultyLevel: Course["difficultyLevel"] } {
  return { templateId: course.templateId, difficultyLevel: course.difficultyLevel };
}
