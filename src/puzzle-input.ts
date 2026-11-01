/** Seed format shared by the player app and the API: 1-128 chars of [a-zA-Z0-9-]. */
const SEED_PATTERN = /^[a-zA-Z0-9-]{1,128}$/;

/** Difficulty level shared by the player app and the API: 1 through 12. */
export const DIFFICULTY_LEVEL_PATTERN = /^(?:[1-9]|1[0-2])$/;

/** Difficulty model allow-list shared by the player app and the API. */
export type DifficultyModel = "v4" | "v5" | "compare";

export function isValidSeed(value: string): boolean {
  return SEED_PATTERN.test(value);
}

export function parseDifficultyLevel(value: string | null | undefined): number | undefined {
  return value && DIFFICULTY_LEVEL_PATTERN.test(value) ? Number(value) : undefined;
}

export function parseDifficultyModel(value: string | null | undefined): DifficultyModel | undefined {
  return value === "v4" || value === "v5" || value === "compare" ? value : undefined;
}
