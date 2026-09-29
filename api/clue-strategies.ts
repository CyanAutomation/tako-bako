import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CLUE_STRATEGIES, parseClueStrategyResults, strategyForConstraintKind, type ClueStrategy } from "../src/clue-strategy.js";
import { hasJevApiKey, requestJevDecision } from "./jev.js";

const MAX_CLUES = 64;
const MAX_CLUE_ID_LENGTH = 128;
const MAX_CLUE_TEXT_LENGTH = 512;
const MAX_TOKEN_LENGTH = 16_384;
const YOKAIBA_HINT_URL = "https://yokaiba.scheimann.workers.dev/v1/puzzles/hint";

interface InputClue {
  id: string;
  text: string;
  constraintKind?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseClues(value: unknown): InputClue[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CLUES) return undefined;
  const clues: InputClue[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || item.id.length === 0 || item.id.length > MAX_CLUE_ID_LENGTH || typeof item.text !== "string" || item.text.length === 0 || item.text.length > MAX_CLUE_TEXT_LENGTH) return undefined;
    if (ids.has(item.id)) return undefined;
    ids.add(item.id);
    const constraintKind = typeof item.constraintKind === "string" && item.constraintKind.length <= MAX_CLUE_ID_LENGTH ? item.constraintKind : undefined;
    clues.push({ id: item.id, text: item.text, ...(constraintKind ? { constraintKind } : {}) });
  }
  return clues;
}

function strategyResults(clues: readonly InputClue[], results: ReadonlyMap<string, { strategy: ClueStrategy; confidence: number }>) {
  return clues.flatMap(clue => {
    const result = results.get(clue.id);
    return result ? [{ clueId: clue.id, ...result }] : [];
  });
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "POST") { response.setHeader("allow", "POST"); response.status(405).json({ error: "Method not allowed" }); return; }
  const body = request.body;
  if (!isRecord(body)) { response.status(400).json({ error: "A valid clue list is required" }); return; }
  const clues = parseClues(body.clues);
  if (!clues) { response.status(400).json({ error: "A valid bounded clue list is required" }); return; }
  response.setHeader("cache-control", "no-store");

  const results = new Map<string, { strategy: ClueStrategy; confidence: number }>();
  const unresolved: InputClue[] = [];
  for (const clue of clues) {
    const known = strategyForConstraintKind(clue.constraintKind);
    if (known) results.set(clue.id, { strategy: known, confidence: 1 });
    else unresolved.push(clue);
  }

  if (unresolved.length > 0 && hasJevApiKey()) {
    if (typeof body.puzzleToken !== "string" || body.puzzleToken.length === 0 || body.puzzleToken.length > MAX_TOKEN_LENGTH) {
      response.status(400).json({ error: "A signed puzzle token is required for model-assisted labels" });
      return;
    }
    try {
      const tokenCheck = await fetch(YOKAIBA_HINT_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ puzzleToken: body.puzzleToken, kind: "clue" }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!tokenCheck.ok) {
        response.status(200).json({ strategies: strategyResults(clues, results) });
        return;
      }
    } catch {
      response.status(200).json({ strategies: strategyResults(clues, results) });
      return;
    }
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
    const evaluated = await requestJevDecision({
      state: { clues: unresolved.map(clue => ({ id: clue.id, text: clue.text, constraint_kind: clue.constraintKind ?? "unspecified" })) },
      questions,
    });
    const answers = evaluated?.answers;
    if (isRecord(answers)) {
      const normalized = { strategies: [...questionToClueId.entries()].flatMap(([questionId, clueId]) => {
        const answer = answers[questionId];
        if (!isRecord(answer)) return [];
        return [{ clueId, strategy: answer.type === "choice" ? answer.choice : undefined, confidence: answer.confidence }];
      }) };
      for (const [clueId, strategy] of parseClueStrategyResults(normalized, unresolved.map(clue => clue.id))) {
        const confidence = (normalized.strategies.find(result => result.clueId === clueId)?.confidence ?? 0) as number;
        results.set(clueId, { strategy, confidence });
      }
    }
  }

  response.status(200).json({ strategies: strategyResults(clues, results) });
}
