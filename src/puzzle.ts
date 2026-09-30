import type { ClueStrategy } from "./clue-strategy-catalog";

export type Mark = "unknown" | "yes" | "no";

export interface Clue {
  id: string;
  text: string;
  constraintKind?: string;
  strategy?: ClueStrategy;
}

export interface Category {
  id: string;
  label: string;
  values: string[];
}

export interface Puzzle {
  id: string;
  seed: string;
  requestedSeed: string;
  templateId: string;
  puzzleToken?: string;
  clues: Clue[];
  difficulty: { level: number; label: string; modelVersion: string };
  spec: { id: string; title: string; baseCategory: string; categories: Category[] };
}

export type Board = Record<string, Mark>;

export interface Answer {
  assignments: Record<string, string[]>;
}
