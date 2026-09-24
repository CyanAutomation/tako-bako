/** Seed format shared by the player app and the API: 1-128 chars of [a-zA-Z0-9-]. */
export const SEED_PATTERN = /^[a-zA-Z0-9-]{1,128}$/;

/** Difficulty level shared by the player app and the API: 1 through 12. */
export const DIFFICULTY_LEVEL_PATTERN = /^(?:[1-9]|1[0-2])$/;

export function isValidSeed(value: string): boolean {
  return SEED_PATTERN.test(value);
}

export function parseDifficultyLevel(value: string | null | undefined): number | undefined {
  return value && DIFFICULTY_LEVEL_PATTERN.test(value) ? Number(value) : undefined;
}