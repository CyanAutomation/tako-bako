export const YOKAIBA_ORIGIN = "https://yokaiba.scheimann.workers.dev";
export const YOKAIBA_GENERATE_URL = `${YOKAIBA_ORIGIN}/v1/puzzles/generate`;

/** Builds the query string for the puzzle generate endpoint; shared by the API proxy and the dev-server proxy. */
export function yokaibaGenerateParams(templateId: string, seed: string, difficultyLevel?: string): URLSearchParams {
  const parameters = new URLSearchParams({ templateId, seed });
  if (difficultyLevel) {
    parameters.set("difficultyLevel", difficultyLevel);
    parameters.set("allowSeedFallback", "true");
  }
  return parameters;
}