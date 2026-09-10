export interface SharedPuzzleInput {
  seed: string;
  templateId?: string;
  difficultyLevel?: number;
  tier?: string;
  level?: number;
}

const seedPattern = /^[a-zA-Z0-9-]{1,128}$/;

function difficultyLevel(value: string | null): number | undefined {
  return value && /^(?:[1-9]|1[0-2])$/.test(value) ? Number(value) : undefined;
}

/** Accept either the short puzzle code or the full link produced by Share. */
export function parseSharedPuzzleInput(value: string): SharedPuzzleInput | undefined {
  const input = value.trim();
  if (seedPattern.test(input)) return { seed: input };

  try {
    const url = new URL(input);
    const seed = url.searchParams.get("seed");
    if (!seed || !seedPattern.test(seed)) return undefined;
    const templateId = url.searchParams.get("template") || undefined;
    const tier = url.searchParams.get("tier") || undefined;
    const level = difficultyLevel(url.searchParams.get("level"));
    const requestedDifficulty = difficultyLevel(url.searchParams.get("difficulty"));
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
