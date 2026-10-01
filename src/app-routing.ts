import { courseFor, firstAvailableCourse, type Course } from "./curriculum";
import { isValidSeed, parseDifficultyLevel } from "./puzzle-input";
import { DEFAULT_SCENARIO_ID, scenarioIdFromUrl, type ScenarioId } from "./scenarios";

export type PlayMode = "challenge" | "shared";
export type PuzzleUrlMode = "push" | "replace" | "none";

export interface PlayRoute {
  seed: string | undefined;
  playMode: PlayMode;
  activeCourse: Course;
  difficultyLevel: number | undefined;
  templateId: ScenarioId;
}

/** Resolves the persisted play mode and puzzle settings from one browser URL. */
export function routeFromUrl(url: URL, completedCourses: readonly string[]): PlayRoute {
  const parameters = url.searchParams;
  const requestedSeed = parameters.get("seed");
  const playMode: PlayMode = parameters.get("mode") === "challenge"
    ? "challenge"
    : parameters.has("seed") ? "shared" : "challenge";
  const activeCourse = courseFor(parameters.get("tier") ?? undefined, Number(parameters.get("level")) || undefined)
    ?? firstAvailableCourse(completedCourses);
  return {
    seed: requestedSeed !== null && isValidSeed(requestedSeed) ? requestedSeed : undefined,
    playMode,
    activeCourse,
    difficultyLevel: playMode === "challenge" ? activeCourse.difficultyLevel : parseDifficultyLevel(parameters.get("difficulty")),
    templateId: playMode === "challenge" ? activeCourse.templateId : scenarioIdFromUrl(parameters.get("template")) ?? DEFAULT_SCENARIO_ID,
  };
}

/** Builds the URL for a puzzle change; the caller applies the selected history operation. */
export function updatedPuzzleUrl(
  currentUrl: string | URL,
  historyMode: PuzzleUrlMode,
  playMode: PlayMode,
  templateId: ScenarioId,
  difficultyLevel: number | undefined,
  course: Course,
  seed: string,
): URL | undefined {
  if (historyMode === "none") return undefined;
  const url = new URL(currentUrl);
  url.searchParams.set("seed", seed);
  url.searchParams.set("mode", playMode);
  if (playMode === "challenge") {
    url.searchParams.set("tier", course.tier);
    url.searchParams.set("level", String(course.level));
    url.searchParams.delete("template");
    url.searchParams.delete("difficulty");
  } else {
    url.searchParams.delete("tier");
    url.searchParams.delete("level");
    if (templateId === DEFAULT_SCENARIO_ID) url.searchParams.delete("template"); else url.searchParams.set("template", templateId);
    if (difficultyLevel) url.searchParams.set("difficulty", String(difficultyLevel)); else url.searchParams.delete("difficulty");
  }
  return url;
}
