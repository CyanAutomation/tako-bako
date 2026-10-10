import { nextCourse, type Course } from "./curriculum";
import { completeCourse, shouldAdvanceProgress, type ChallengeProgress } from "./progress";
import type { PlayMode } from "./app-routing";
import type { StatusTone } from "./ui-types";

export interface AnswerOutcomeInput {
  correct: boolean;
  playMode: PlayMode;
  course: Course;
  progress: ChallengeProgress;
}

export interface AnswerOutcome {
  progress: ChallengeProgress;
  event: "mistake" | "puzzle_completed";
  mistakeCountDelta: number;
  message: string;
  tone: StatusTone;
  celebrate: boolean;
  persistProgress: boolean;
}

export function resolveAnswerOutcome({ correct, playMode, course, progress }: AnswerOutcomeInput): AnswerOutcome {
  if (!correct) {
    return {
      progress,
      event: "mistake",
      mistakeCountDelta: 1,
      message: "Not quite yet. Your notes are saved, so keep refining the grid.",
      tone: "warning",
      celebrate: false,
      persistProgress: false,
    };
  }

  if (!shouldAdvanceProgress(playMode)) {
    return {
      progress,
      event: "puzzle_completed",
      mistakeCountDelta: 0,
      message: "Beautifully solved — this shared puzzle is complete. Start Puzzle Challenge to advance your course.",
      tone: "success",
      celebrate: true,
      persistProgress: false,
    };
  }

  const nextProgress = completeCourse(progress, course.id);
  const next = nextCourse(course);
  return {
    progress: nextProgress,
    event: "puzzle_completed",
    mistakeCountDelta: 0,
    message: next
      ? `Beautifully solved — ${course.label} is complete. ${next.label} is now ready!`
      : "Beautifully solved — you have completed every Puzzle Challenge level!",
    tone: "success",
    celebrate: true,
    persistProgress: true,
  };
}
