import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CLUE_STRATEGIES } from "../src/clue-strategy-catalog.js";
import type { ClueStrategy } from "../src/clue-strategy-catalog.js";
import { strategyForConstraintKind } from "../src/clue-strategy-constraints.js";
import { parseClueStrategyResults } from "../src/clue-strategy-results.js";
import { hasJevApiKey, requestJevDecision } from "../server/jev.js";
import { parseClues, type InputClue } from "../server/clue-strategy-input.js";

const MAX_TOKEN_LENGTH = 16_384;
const YOKAIBA_HINT_URL = "https://yokaiba.scheimann.workers.dev/v1/puzzles/hint";

type StrategyResult = { strategy: ClueStrategy; confidence: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strategyResults(clues: readonly InputClue[], results: ReadonlyMap<string, StrategyResult>) {
  return clues.flatMap(clue => {
    const result = results.get(clue.id);
    return result ? [{ clueId: clue.id, ...result }] : [];
  });
}

function partitionKnownStrategies(clues: readonly InputClue[]): { results: Map<string, StrategyResult>; unresolved: InputClue[] } {
  const results = new Map<string, StrategyResult>();
  const unresolved: InputClue[] = [];
  for (const clue of clues) {
    const strategy = strategyForConstraintKind(clue.constraintKind);
    if (strategy) results.set(clue.id, { strategy, confidence: 1 });
    else unresolved.push(clue);
  }
  return { results, unresolved };
}

function isValidPuzzleToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TOKEN_LENGTH;
}

async function puzzleTokenIsUsable(token: string): Promise<boolean> {
  try {
    const response = await fetch(YOKAIBA_HINT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ puzzleToken: token, kind: "clue" }),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function makeJevQuestions(unresolved: readonly InputClue[]): { questions: Record<string, unknown>; questionToClueId: Map<string, string> } {
  const questionToClueId = new Map<string, string>();
  const questions: Record<string, unknown> = {};
  unresolved.forEach((clue, index) => {
    const questionId = `clue_${index}`;
    questionToClueId.set(questionId, clue.id);
    questions[questionId] = {
      type: "choice",
      instructions: `Which primary reasoning strategy does the clue at \`clues[${index}].text\` use? Classify the logical relationship, not the names or themes in the sentence. The constraint kind at \`clues[${index}].constraint_kind\` is optional supporting context.`,
      criteria: Object.fromEntries(Object.entries(CLUE_STRATEGIES).map(([id, value]) => [id, value.description])),
    };
  });
  return { questions, questionToClueId };
}

function normalizedJevAnswers(value: unknown, questionToClueId: ReadonlyMap<string, string>): { strategies: Record<string, unknown>[] } {
  if (!isRecord(value)) return { strategies: [] };
  const strategies = [...questionToClueId.entries()].flatMap(([questionId, clueId]) => {
    const answer = value[questionId];
    if (!isRecord(answer)) return [];
    return [{ clueId, strategy: answer.type === "choice" ? answer.choice : undefined, confidence: answer.confidence }];
  });
  return { strategies };
}

async function classifyUnresolvedClues(
  puzzleToken: unknown,
  unresolved: readonly InputClue[],
  results: Map<string, StrategyResult>,
  response: VercelResponse,
): Promise<boolean> {
  if (unresolved.length === 0 || !hasJevApiKey()) return true;
  if (!isValidPuzzleToken(puzzleToken)) {
    response.status(400).json({ error: "A signed puzzle token is required for model-assisted labels" });
    return false;
  }
  if (!await puzzleTokenIsUsable(puzzleToken)) return true;

  const { questions, questionToClueId } = makeJevQuestions(unresolved);
  const evaluated = await requestJevDecision({
    state: { clues: unresolved.map(clue => ({ id: clue.id, text: clue.text, constraint_kind: clue.constraintKind ?? "unspecified" })) },
    questions,
  });
  const normalized = normalizedJevAnswers(evaluated?.answers, questionToClueId);
  const labels = parseClueStrategyResults(normalized, unresolved.map(clue => clue.id));
  for (const [clueId, strategy] of labels) {
    const confidence = (normalized.strategies.find(result => result.clueId === clueId)?.confidence ?? 0) as number;
    results.set(clueId, { strategy, confidence });
  }
  return true;
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "POST") { response.setHeader("allow", "POST"); response.status(405).json({ error: "Method not allowed" }); return; }
  if (!isRecord(request.body)) { response.status(400).json({ error: "A valid clue list is required" }); return; }
  const clues = parseClues(request.body.clues);
  if (!clues) { response.status(400).json({ error: "A valid bounded clue list is required" }); return; }
  response.setHeader("cache-control", "no-store");

  const { results, unresolved } = partitionKnownStrategies(clues);
  const mayRespond = await classifyUnresolvedClues(request.body.puzzleToken, unresolved, results, response);
  if (!mayRespond) return;
  response.status(200).json({ strategies: strategyResults(clues, results) });
}
