import { courseForId, courses, type CourseId } from "./curriculum";

export interface ChallengeProgress {
  version: 1;
  completed: CourseId[];
}

export function emptyProgress(): ChallengeProgress {
  return { version: 1, completed: [] };
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
