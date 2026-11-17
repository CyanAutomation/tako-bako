import { readFileSync } from "node:fs";
import type { Answer, Clue, Puzzle } from "../src/puzzle.js";

export interface GeneratedFixturePuzzle extends Omit<Puzzle, "clues" | "difficulty"> {
  clues: Array<Clue & {
    constraint: { kind: string; [key: string]: unknown };
    phraseVariant?: string;
    languageVersion?: string;
  }>;
  difficulty: Puzzle["difficulty"] & {
    evidence: { humanSolve: { solved: boolean }; [key: string]: unknown };
  };
  requestedDifficultyLevel?: number;
}

export interface SimulatorFixture {
  fixtureId: string;
  source: {
    repository: string;
    commit: string;
    generatorVersion: string;
    solverVersion: string;
    seed: string;
  };
  publicPuzzle: GeneratedFixturePuzzle & { puzzleToken: string; puzzleFingerprint: string; difficultyModel: "v4" | "v5" | "compare" };
  solution: Answer;
}

const fixtureFiles = [
  "tournament-order-beginner.json",
  "open-division-intermediate.json",
  "championship-bridge-transition.json",
  "championship-circuit-expert.json",
] as const;

/** Load the private, source-generated fixtures for the local simulator process. */
export function loadFixtures(): SimulatorFixture[] {
  return fixtureFiles.map(file => JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8")) as SimulatorFixture);
}
