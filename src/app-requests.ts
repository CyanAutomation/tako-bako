import { parseAnswerVerification } from "./answer-verification";
import { parseClueStrategyResults } from "./clue-strategy-results";
import { parseHintResponse, type HintRequestBody, type ParsedHintResponse } from "./hint-request";
import type { Answer, Puzzle } from "./puzzle";
import type { ClueStrategy } from "./clue-strategy-catalog";

/** Fetches optional labels for clues that do not already have solver metadata. */
export async function fetchClueStrategies(puzzle: Puzzle, signal: AbortSignal): Promise<Record<string, ClueStrategy> | undefined> {
  const unresolved = puzzle.clues.filter(clue => !clue.strategy);
  if (unresolved.length === 0 || !puzzle.puzzleToken) return undefined;
  const response = await fetch("/api/clue-strategies", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ puzzleToken: puzzle.puzzleToken, clues: unresolved.map(({ id, text, constraintKind }) => ({ id, text, ...(constraintKind ? { constraintKind } : {}) })) }),
    signal,
  });
  if (!response.ok) return undefined;
  const strategies = parseClueStrategyResults(await response.json(), unresolved.map(clue => clue.id));
  return Object.fromEntries(strategies);
}

/** Validates the verification response and drops results for requests that are no longer active. */
export async function requestAnswerVerification(token: string, answer: Answer, signal: AbortSignal, isActive: () => boolean): Promise<boolean | undefined> {
  const response = await fetch("/api/puzzle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ puzzleToken: token, answer }),
    signal,
  });
  if (!isActive()) return undefined;
  if (!response.ok) throw new Error("Verification is unavailable");
  const correct = parseAnswerVerification(await response.json());
  if (!isActive()) return undefined;
  if (correct === undefined) throw new Error("Invalid verification response");
  return correct;
}

/** Parses a hint only for the still-current request and rejects non-success responses. */
export async function requestHintResponse(body: HintRequestBody, signal: AbortSignal, isActive: () => boolean): Promise<ParsedHintResponse | undefined> {
  const response = await fetch("/api/hint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!isActive()) return undefined;
  const hint = parseHintResponse(await response.json());
  if (!isActive()) return undefined;
  if (!response.ok || !hint) throw new Error("Hint unavailable");
  return hint;
}
