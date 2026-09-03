import { courseForId, courses, type CourseId } from "./curriculum";

export const PROGRESS_STORAGE_KEY = "tako-bako.challenge-progress.v1";

export interface ChallengeProgress {
  version: 1;
  completed: CourseId[];
}

export function emptyProgress(): ChallengeProgress {
  return { version: 1, completed: [] };
}

export function parseProgress(value: string | null): ChallengeProgress {
  try {
    const parsed: unknown = value ? JSON.parse(value) : undefined;
    if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== 1 || !Array.isArray((parsed as { completed?: unknown }).completed)) return emptyProgress();
    const completed = [...new Set((parsed as { completed: unknown[] }).completed.filter((id): id is CourseId => typeof id === "string" && Boolean(courseForId(id))))];
    return { version: 1, completed };
  } catch {
    return emptyProgress();
  }
}

export function loadProgress(storage: Storage): ChallengeProgress {
  return parseProgress(storage.getItem(PROGRESS_STORAGE_KEY));
}

export function saveProgress(storage: Storage, progress: ChallengeProgress): void {
  storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function completeCourse(progress: ChallengeProgress, courseId: CourseId): ChallengeProgress {
  if (!courseForId(courseId) || progress.completed.includes(courseId)) return progress;
  return { version: 1, completed: [...progress.completed, courseId] };
}

/** Starts Puzzle Challenge again without touching saved boards or shared puzzles. */
export function resetProgress(): ChallengeProgress {
  return emptyProgress();
}

export function isCourseUnlocked(progress: ChallengeProgress, courseId: CourseId): boolean {
  const index = courses.findIndex(course => course.id === courseId);
  return index === 0 || (index > 0 && progress.completed.includes(courses[index - 1]!.id));
}

/** Shared links are replayable; only the explicit Puzzle Challenge route awards course progress. */
export function shouldAdvanceProgress(mode: unknown): boolean {
  return mode === "challenge";
}
