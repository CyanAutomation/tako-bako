import type { ClueStrategy } from "../src/clue-strategy-catalog.js";

export interface HintClue {
  id: string;
  text: string;
  strategy?: ClueStrategy;
}

export interface BoardMark {
  category: string;
  subject: string;
  value: string;
  mark: "yes" | "no";
}

export interface SelectionContext {
  clues?: HintClue[];
  usedClueIds: Set<string>;
  board: BoardMark[];
}
