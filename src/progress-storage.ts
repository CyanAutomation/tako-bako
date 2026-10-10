import { courseForId, type CourseId } from "./curriculum";
import { emptyProgress, type ChallengeProgress } from "./progress";

export const PROGRESS_STORAGE_KEY = "tako-bako.challenge-progress.v1";

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
