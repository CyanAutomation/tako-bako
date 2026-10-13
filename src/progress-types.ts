import type { CourseId } from "./curriculum";

export interface ChallengeProgress {
  version: 1;
  completed: CourseId[];
}
