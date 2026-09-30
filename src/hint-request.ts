import { boardSolveProgress, squareKey } from "./puzzle-board";
import type { Board, Puzzle } from "./puzzle";
import type { ClueStrategy } from "./clue-strategy-catalog";

const MAX_ELAPSED_MS = 86_400_000;

export interface HintRequestOptions {
  puzzle: Puzzle & { puzzleToken: string };
  board: Board;
  usedClueIds: ReadonlySet<string>;
  clueStrategies: Readonly<Record<string, ClueStrategy>>;
  hintsUsed: number;
  mistakes: number;
  difficultyLevel: number | undefined;
  puzzleStartedAt: number;
  now: number;
  smartMarking: boolean;
}

export interface HintRequestBody {
  puzzleToken: string;
  kind: "clue" | "elimination" | "placement";
  clues: { id: string; text: string; strategy?: ClueStrategy }[];
  usedClueIds: string[];
  board: { category: string; subject: string; value: string; mark: "yes" | "no" }[];
  totalMatches: number;
  hintsUsed: number;
  mistakes: number;
  elapsedMs: number;
  smartMarking: boolean;
}

export type ParsedHintResponse =
  | { kind: "placement"; placement: { subject: string; category: string; value: string } }
  | { kind: "clue"; clue: { id?: string; text: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hintKind(matches: number, total: number): HintRequestBody["kind"] {
  if (matches === 0) return "clue";
  return matches < Math.ceil(total / 2) ? "elimination" : "placement";
}

function boardContext(puzzle: Puzzle, board: Board): HintRequestBody["board"] {
  const base = puzzle.spec.categories.find(category => category.id === puzzle.spec.baseCategory);
  if (!base) return [];
  return puzzle.spec.categories
    .filter(category => category.id !== base.id)
    .flatMap(category => base.values.flatMap(subject => category.values.flatMap(value => {
      const mark = board[squareKey(category.id, subject, value)];
      return mark === "yes" || mark === "no" ? [{ category: category.label, subject, value, mark }] : [];
    })));
}

/** Builds the bounded client-to-server hint context from the current puzzle state. */
export function createHintRequestBody(options: HintRequestOptions): HintRequestBody {
  const progress = boardSolveProgress(options.board, options.puzzle.spec);
  return {
    puzzleToken: options.puzzle.puzzleToken,
    kind: hintKind(progress.matches, progress.total),
    clues: options.puzzle.clues.map(clue => ({
      id: clue.id,
      text: clue.text,
      strategy: clue.strategy ?? options.clueStrategies[clue.id],
    })),
    usedClueIds: [...options.usedClueIds],
    board: boardContext(options.puzzle, options.board),
    totalMatches: progress.total,
    hintsUsed: options.hintsUsed,
    mistakes: options.mistakes,
    elapsedMs: options.puzzleStartedAt ? Math.min(MAX_ELAPSED_MS, options.now - options.puzzleStartedAt) : 0,
    smartMarking: options.smartMarking,
  };
}

export function parseHintResponse(value: unknown): ParsedHintResponse | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "placement" && isRecord(value.placement)
    && typeof value.placement.subject === "string" && typeof value.placement.category === "string" && typeof value.placement.value === "string") {
    return { kind: "placement", placement: { subject: value.placement.subject, category: value.placement.category, value: value.placement.value } };
  }
  if (isRecord(value.clue) && typeof value.clue.text === "string") {
    return { kind: "clue", clue: { text: value.clue.text, ...(typeof value.clue.id === "string" ? { id: value.clue.id } : {}) } };
  }
  return undefined;
}
