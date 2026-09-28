import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clueStrategyLabel, isClueStrategy, type ClueStrategy } from "../src/clue-strategy.js";
import { hasJevApiKey, requestJevDecision } from "./jev.js";

const URL = "https://yokaiba.scheimann.workers.dev/v1/puzzles/hint";
const MAX_TOKEN_LENGTH = 16_384;
const MAX_CLUES = 64;
const MAX_CLUE_ID_LENGTH = 128;
const MAX_CLUE_TEXT_LENGTH = 512;
const MAX_BOARD_MARKS = 256;
const MAX_BOARD_VALUE_LENGTH = 256;

interface HintClue {
  id: string;
  text: string;
  strategy?: ClueStrategy;
}

interface BoardMark {
  category: string;
  subject: string;
  value: string;
  mark: "yes" | "no";
}

interface SelectionContext {
  clues?: HintClue[];
  usedClueIds: Set<string>;
  board: BoardMark[];
}

interface HintCandidate {
  id: string;
  payload: unknown;
  type: "clue" | "elimination" | "placement";
  text: string;
  clueId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSelectionContext(value: Record<string, unknown>): SelectionContext | undefined {
  let clues: HintClue[] | undefined;
  if (value.clues !== undefined) {
    if (!Array.isArray(value.clues) || value.clues.length > MAX_CLUES) return undefined;
    const seen = new Set<string>();
    clues = [];
    for (const clue of value.clues) {
      if (!isRecord(clue) || typeof clue.id !== "string" || clue.id.length === 0 || clue.id.length > MAX_CLUE_ID_LENGTH || typeof clue.text !== "string" || clue.text.length === 0 || clue.text.length > MAX_CLUE_TEXT_LENGTH || seen.has(clue.id)) return undefined;
      seen.add(clue.id);
      clues.push({ id: clue.id, text: clue.text, ...(isClueStrategy(clue.strategy) ? { strategy: clue.strategy } : {}) });
    }
  }

  const usedClueIds = new Set<string>();
  if (value.usedClueIds !== undefined) {
    if (!Array.isArray(value.usedClueIds) || value.usedClueIds.length > MAX_CLUES || !value.usedClueIds.every(id => typeof id === "string" && id.length > 0 && id.length <= MAX_CLUE_ID_LENGTH)) return undefined;
    value.usedClueIds.forEach(id => usedClueIds.add(id as string));
  }

  const board: BoardMark[] = [];
  if (value.board !== undefined) {
    if (!Array.isArray(value.board) || value.board.length > MAX_BOARD_MARKS) return undefined;
    for (const mark of value.board) {
      if (!isRecord(mark) || typeof mark.category !== "string" || mark.category.length === 0 || mark.category.length > MAX_BOARD_VALUE_LENGTH || typeof mark.subject !== "string" || mark.subject.length === 0 || mark.subject.length > MAX_BOARD_VALUE_LENGTH || typeof mark.value !== "string" || mark.value.length === 0 || mark.value.length > MAX_BOARD_VALUE_LENGTH || (mark.mark !== "yes" && mark.mark !== "no")) return undefined;
      board.push({ category: mark.category, subject: mark.subject, value: mark.value, mark: mark.mark });
    }
  }

  return { clues, usedClueIds, board };
}

function solverCandidate(id: string, payload: unknown): HintCandidate | undefined {
  if (!isRecord(payload)) return undefined;
  if (payload.kind === "placement" && isRecord(payload.placement)) {
    const placement = payload.placement;
    if (typeof placement.subject === "string" && typeof placement.category === "string" && typeof placement.value === "string") {
      return { id, payload, type: "placement", text: `${placement.subject} matches ${placement.value} in ${placement.category}.` };
    }
  }
  if (isRecord(payload.clue) && typeof payload.clue.text === "string") {
    const type = payload.kind === "elimination" ? "elimination" : "clue";
    return { id, payload, type, text: payload.clue.text, ...(typeof payload.clue.id === "string" ? { clueId: payload.clue.id } : {}) };
  }
  return undefined;
}

function selectCandidateWithJev(context: SelectionContext, candidates: HintCandidate[]): Promise<HintCandidate | undefined> {
  const questionOptions = Object.fromEntries(candidates.map((_candidate, index) => [`candidate_${index}`, `Candidate: ${candidates[index]!.type}. ${candidates[index]!.text}`]));
  return requestJevDecision({
    state: {
      current_board: context.board,
      candidates: candidates.map((candidate, index) => ({ option: `candidate_${index}`, id: candidate.id, type: candidate.type, text: candidate.text })),
    },
    questions: {
      next_hint: {
        type: "choice",
        instructions: "Which candidate is the most useful next nudge given `current_board`? Prefer the least revealing candidate that adds useful information. Select only one listed option; do not invent a hint.",
        criteria: questionOptions,
      },
    },
  }).then(result => {
    if (!result || !isRecord(result.answers) || !isRecord(result.answers.next_hint)) return undefined;
    const answer = result.answers.next_hint;
    if (answer.type !== "choice" || typeof answer.choice !== "string") return undefined;
    const match = /^candidate_(\d+)$/.exec(answer.choice);
    const selectedIndex = match ? Number(match[1]) : -1;
    return Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < candidates.length ? candidates[selectedIndex] : undefined;
  });
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "POST") { response.setHeader("allow", "POST"); response.status(405).json({ error: "Method not allowed" }); return; }
  const body = request.body;
  if (!isRecord(body)) { response.status(400).json({ error: "A signed hint request is required" }); return; }
  const value = body;
  if (typeof value.puzzleToken !== "string" || value.puzzleToken.length === 0 || value.puzzleToken.length > MAX_TOKEN_LENGTH || (value.kind !== undefined && value.kind !== "clue" && value.kind !== "elimination" && value.kind !== "placement")) { response.status(400).json({ error: "A valid signed hint request is required" }); return; }
  const context = parseSelectionContext(value);
  try {
    const upstream = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ puzzleToken: value.puzzleToken, ...(value.kind === undefined ? {} : { kind: value.kind }) }), signal: AbortSignal.timeout(8_000) });
    const requestId = upstream.headers.get("x-request-id"); if (requestId) response.setHeader("x-yokaiba-request-id", requestId);
    response.setHeader("cache-control", "no-store");
    let payload: unknown = { error: "Yokaiba assistance is unavailable. Please try again." };
    if (upstream.headers.get("content-type")?.includes("application/json")) payload = await upstream.json().catch(() => payload);
    if (!upstream.ok) { response.status(upstream.status).json(payload); return; }
    if (!context || !hasJevApiKey() || !context.clues || context.clues.length === 0) { response.status(upstream.status).json(payload); return; }

    const candidates: HintCandidate[] = [];
    const primaryCandidate = solverCandidate("solver_primary", payload);
    if (primaryCandidate && !(primaryCandidate.type === "clue" && primaryCandidate.clueId && context.usedClueIds.has(primaryCandidate.clueId))) candidates.push(primaryCandidate);
    for (const clue of context.clues) {
      if (!context.usedClueIds.has(clue.id) && primaryCandidate?.clueId !== clue.id) candidates.push({
        id: `clue:${clue.id}`,
        payload: { kind: "clue", clue: { id: clue.id, text: clue.text } },
        type: "clue",
        text: `${clue.text}${clue.strategy ? ` (reasoning strategy: ${clueStrategyLabel(clue.strategy)})` : ""}`,
      });
    }
    if (candidates.length === 0) { response.status(upstream.status).json(payload); return; }
    if (candidates.length === 1) { response.status(upstream.status).json(candidates[0]!.payload); return; }

    const selected = await selectCandidateWithJev(context, candidates);
    response.status(upstream.status).json(selected?.payload ?? payload);
  } catch {
    response.status(502).json({ error: "Yokaiba assistance is unavailable. Please try again." });
  }
}
