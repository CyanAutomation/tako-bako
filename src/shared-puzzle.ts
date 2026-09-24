export interface SharedPuzzleInput {
  seed: string;
  templateId?: string;
  difficultyLevel?: number;
  tier?: string;
  level?: number;
}

import { isValidSeed, parseDifficultyLevel } from "./puzzle-input";

/** Accept either the short puzzle code or the full link produced by Share. */
export function parseSharedPuzzleInput(value: string): SharedPuzzleInput | undefined {
  const input = value.trim();
  if (isValidSeed(input)) return { seed: input };

  try {
    const url = new URL(input);
    const seed = url.searchParams.get("seed");
    if (!seed || !isValidSeed(seed)) return undefined;
    const templateId = url.searchParams.get("template") || undefined;
    const tier = url.searchParams.get("tier") || undefined;
    const level = parseDifficultyLevel(url.searchParams.get("level"));
    const requestedDifficulty = parseDifficultyLevel(url.searchParams.get("difficulty"));
    return {
      seed,
      ...(templateId ? { templateId } : {}),
      ...(requestedDifficulty ? { difficultyLevel: requestedDifficulty } : {}),
      ...(tier ? { tier } : {}),
      ...(level ? { level } : {}),
    };
  } catch {
    return undefined;
  }
}
