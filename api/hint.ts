import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clueStrategyLabel, isClueStrategy, type ClueStrategy } from "../src/clue-strategy.js";
import { derivePlayerStateFeatures, hintStrengthForProgress, hintStrengthRank, MIN_PLAYER_STATE_CONFIDENCE, parsePlayerStateAssessment, policyForPlayerState, serializePlayerStateFeatures, type HintStrength, type PlayerStateFeatures, type PlayerStatePolicy } from "../src/player-state.js";
import { hasJevApiKey, requestJevDecision } from "./jev.js";

const URL = "https://yokaiba.scheimann.workers.dev/v1/puzzles/hint";
const MAX_TOKEN_LENGTH = 16_384;
const MAX_CLUES = 64;
const MAX_CLUE_ID_LENGTH = 128;
const MAX_CLUE_TEXT_LENGTH = 512;
const MAX_BOARD_MARKS = 256;
const MAX_BOARD_VALUE_LENGTH = 256;
const MAX_HINT_COUNT = 100;
const MAX_ELAPSED_MS = 86_400_000;

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

interface ParsedHintRequest {
  body: Record<string, unknown>;
  puzzleToken: string;
  kind?: HintStrength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordJevMetric(metric: { operation: string; questionCount: number; candidateCount: number; durationMs: number; outcome: string }): void {
  try { console.info("tako_bako_jev_metric", metric); } catch { /* Observability must not affect hint delivery. */ }
}

function parseHintClue(value: unknown): HintClue | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > MAX_CLUE_ID_LENGTH) return undefined;
  if (typeof value.text !== "string" || value.text.length === 0 || value.text.length > MAX_CLUE_TEXT_LENGTH) return undefined;
  return { id: value.id, text: value.text, ...(isClueStrategy(value.strategy) ? { strategy: value.strategy } : {}) };
}

function parseHintClues(value: unknown): HintClue[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_CLUES) return undefined;
  const clues: HintClue[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const clue = parseHintClue(item);
    if (!clue || seen.has(clue.id)) return undefined;
    seen.add(clue.id);
    clues.push(clue);
  }
  return clues;
}

function parseUsedClueIds(value: unknown): Set<string> | undefined {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.length > MAX_CLUES || !value.every(id => typeof id === "string" && id.length > 0 && id.length <= MAX_CLUE_ID_LENGTH)) return undefined;
  return new Set(value as string[]);
}

function parseBoardMark(value: unknown): BoardMark | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.category !== "string" || value.category.length === 0 || value.category.length > MAX_BOARD_VALUE_LENGTH) return undefined;
  if (typeof value.subject !== "string" || value.subject.length === 0 || value.subject.length > MAX_BOARD_VALUE_LENGTH) return undefined;
  if (typeof value.value !== "string" || value.value.length === 0 || value.value.length > MAX_BOARD_VALUE_LENGTH) return undefined;
  if (value.mark !== "yes" && value.mark !== "no") return undefined;
  return { category: value.category, subject: value.subject, value: value.value, mark: value.mark };
}

function parseBoardMarks(value: unknown): BoardMark[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_BOARD_MARKS) return undefined;
  const board: BoardMark[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const mark = parseBoardMark(item);
    if (!mark) return undefined;
    const key = JSON.stringify([mark.category, mark.subject, mark.value]);
    if (seen.has(key)) return undefined;
    seen.add(key);
    board.push(mark);
  }
  return board;
}

function parseSelectionContext(value: Record<string, unknown>): SelectionContext | undefined {
  const clues = value.clues === undefined ? undefined : parseHintClues(value.clues);
  const usedClueIds = parseUsedClueIds(value.usedClueIds);
  const board = value.board === undefined ? [] : parseBoardMarks(value.board);
  if ((value.clues !== undefined && !clues) || !usedClueIds || !board) return undefined;
  return { clues, usedClueIds, board };
}

function parseHintRequest(value: Record<string, unknown>): ParsedHintRequest | undefined {
  if (typeof value.puzzleToken !== "string" || value.puzzleToken.length === 0 || value.puzzleToken.length > MAX_TOKEN_LENGTH) return undefined;
  if (value.kind !== undefined && value.kind !== "clue" && value.kind !== "elimination" && value.kind !== "placement") return undefined;
  return { body: value, puzzleToken: value.puzzleToken, kind: value.kind as HintStrength | undefined };
}

function playerStateFeatures(value: Record<string, unknown>, context: SelectionContext): PlayerStateFeatures | undefined {
  if (!context.clues || !Number.isSafeInteger(value.totalMatches) || (value.totalMatches as number) < 1 || (value.totalMatches as number) > MAX_BOARD_MARKS
    || !Number.isSafeInteger(value.hintsUsed) || (value.hintsUsed as number) < 0 || (value.hintsUsed as number) > MAX_HINT_COUNT
    || !Number.isSafeInteger(value.mistakes) || (value.mistakes as number) < 0 || (value.mistakes as number) > MAX_HINT_COUNT
    || !Number.isSafeInteger(value.elapsedMs) || (value.elapsedMs as number) < 0 || (value.elapsedMs as number) > MAX_ELAPSED_MS
    || typeof value.smartMarking !== "boolean") return undefined;
  return derivePlayerStateFeatures({
    board: context.board,
    totalMatches: value.totalMatches as number,
    hintsUsed: value.hintsUsed as number,
    mistakes: value.mistakes as number,
    elapsedMs: value.elapsedMs as number,
    clues: context.clues,
    usedClueIds: context.usedClueIds,
    smartMarking: value.smartMarking,
  });
}

async function classifyPlayerState(features: PlayerStateFeatures) {
  const startedAt = Date.now();
  const result = await requestJevDecision({
    state: serializePlayerStateFeatures(features),
    questions: {
      player_state: {
        type: "choice",
        instructions: "Classify the player's current puzzle state from the bounded gameplay counts. Describe the assistance that would help now, not the puzzle solution. Use likely_wrong_turn only when failed checks suggest the current board may need review. Do not infer ability or personality.",
        criteria: {
          progressing: "The player has made some useful progress or has not shown signs of being stuck.",
          stalled: "Progress appears limited relative to time or prior hints; a stronger bounded nudge may help.",
          likely_wrong_turn: "A failed check or error count suggests some current marks may need review.",
          needs_strategy_nudge: "A clue or reminder about a reasoning approach would help more than a stronger reveal.",
          ready_for_stronger_hint: "The player has already used hints and a stronger bounded hint may now be appropriate.",
        },
      },
    },
  });
  const assessment = parsePlayerStateAssessment(result);
  recordJevMetric({ operation: "player_state", questionCount: 1, candidateCount: 0, durationMs: Date.now() - startedAt, outcome: assessment ? "success" : "fallback" });
  return assessment;
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

function candidateFromJevResult(result: unknown, candidates: HintCandidate[]): HintCandidate | undefined {
  if (!isRecord(result) || !isRecord(result.answers) || !isRecord(result.answers.next_hint)) return undefined;
  const answer = result.answers.next_hint;
  if (answer.type !== "choice" || typeof answer.choice !== "string" || typeof answer.confidence !== "number" || !Number.isFinite(answer.confidence) || answer.confidence < MIN_PLAYER_STATE_CONFIDENCE || answer.confidence > 1) return undefined;
  const match = /^candidate_(\d+)$/.exec(answer.choice);
  const selectedIndex = match ? Number(match[1]) : -1;
  return Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < candidates.length ? candidates[selectedIndex] : undefined;
}

function selectCandidateWithJev(context: SelectionContext, candidates: HintCandidate[], features?: PlayerStateFeatures, policy?: PlayerStatePolicy, assessment?: { state: string; confidence: number }): Promise<HintCandidate | undefined> {
  const startedAt = Date.now();
  const questionOptions = Object.fromEntries(candidates.map((_candidate, index) => [`candidate_${index}`, `Candidate: ${candidates[index]!.type}. ${candidates[index]!.text}`]));
  return requestJevDecision({
    state: {
      current_board: context.board,
      ...(features ? { player_features: serializePlayerStateFeatures(features) } : {}),
      ...(assessment ? { player_state: assessment.state, player_state_confidence: assessment.confidence } : {}),
      ...(policy ? { permitted_hint_strength: policy.hintKind } : {}),
      ...(policy ? { preferred_candidate_type: policy.preferredCandidateType ?? "least_revealing_useful" } : {}),
      candidates: candidates.map((candidate, index) => ({ option: `candidate_${index}`, id: candidate.id, type: candidate.type, text: candidate.text })),
    },
    questions: {
      next_hint: {
        type: "choice",
        instructions: "Which candidate is the most useful next nudge given the board and player features? Follow the preferred candidate type when it is useful, while choosing the least revealing candidate that adds progress. Select only one listed option; do not invent a hint.",
        criteria: questionOptions,
      },
    },
  }).then(result => {
    const selected = candidateFromJevResult(result, candidates);
    recordJevMetric({ operation: "hint_selection", questionCount: 1, candidateCount: candidates.length, durationMs: Date.now() - startedAt, outcome: selected ? "success" : "fallback" });
    return selected;
  });
}

function hintCandidates(payload: unknown, context: SelectionContext): HintCandidate[] {
  const candidates: HintCandidate[] = [];
  const primaryCandidate = solverCandidate("solver_primary", payload);
  if (primaryCandidate && !(primaryCandidate.type === "clue" && primaryCandidate.clueId && context.usedClueIds.has(primaryCandidate.clueId))) candidates.push(primaryCandidate);
  for (const clue of context.clues ?? []) {
    if (!context.usedClueIds.has(clue.id) && primaryCandidate?.clueId !== clue.id) candidates.push({
      id: `clue:${clue.id}`,
      payload: { kind: "clue", clue: { id: clue.id, text: clue.text } },
      type: "clue",
      text: `${clue.text}${clue.strategy ? ` (reasoning strategy: ${clueStrategyLabel(clue.strategy)})` : ""}`,
    });
  }
  return candidates;
}

async function chooseHintPayload(
  context: SelectionContext,
  payload: unknown,
  features: PlayerStateFeatures | undefined,
  policy: PlayerStatePolicy | undefined,
  assessment: Awaited<ReturnType<typeof classifyPlayerState>>,
): Promise<unknown> {
  const candidates = hintCandidates(payload, context);
  const boundedCandidates = policy
    ? candidates.filter(candidate => hintStrengthRank(candidate.type) <= hintStrengthRank(policy.hintKind))
    : candidates;
  if (boundedCandidates.length === 0) return policy ? { error: "A suitable hint is unavailable." } : payload;
  if (boundedCandidates.length === 1) return boundedCandidates[0]!.payload;
  const selected = await selectCandidateWithJev(context, boundedCandidates, features, policy, assessment);
  const safeFallback = policy
    ? boundedCandidates.find(candidate => candidate.id === "solver_primary") ?? boundedCandidates[0]
    : undefined;
  return selected?.payload ?? safeFallback?.payload ?? payload;
}

async function fetchPrimaryHint(puzzleToken: string, hintKind: HintStrength | undefined, response: VercelResponse): Promise<{ upstream: Response; payload: unknown } | undefined> {
  const upstream = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ puzzleToken, ...(hintKind === undefined ? {} : { kind: hintKind }) }),
    signal: AbortSignal.timeout(8_000),
  });
  const requestId = upstream.headers.get("x-request-id");
  if (requestId) response.setHeader("x-yokaiba-request-id", requestId);
  response.setHeader("cache-control", "no-store");
  let payload: unknown = { error: "Yokaiba assistance is unavailable. Please try again." };
  if (upstream.headers.get("content-type")?.includes("application/json")) payload = await upstream.json().catch(() => payload);
  if (!upstream.ok) {
    response.status(upstream.status).json(payload);
    return undefined;
  }
  return { upstream, payload };
}

async function deliverHint(request: ParsedHintRequest, context: SelectionContext | undefined, features: PlayerStateFeatures | undefined, response: VercelResponse): Promise<void> {
  let assessment: Awaited<ReturnType<typeof classifyPlayerState>>;
  if (features && context?.clues?.length && hasJevApiKey()) assessment = await classifyPlayerState(features);
  const policy = assessment && features ? policyForPlayerState(assessment.state, features) : undefined;
  const defaultKind = features ? hintStrengthForProgress(features.affirmativeCount, features.totalMatches) : request.kind;
  const hintKind = policy?.hintKind ?? defaultKind;
  try {
    const result = await fetchPrimaryHint(request.puzzleToken, hintKind, response);
    if (!result) return;
    if (!context || !hasJevApiKey() || !context.clues?.length) {
      response.status(result.upstream.status).json(result.payload);
      return;
    }
    const selected = await chooseHintPayload(context, result.payload, features, policy, assessment);
    response.status(result.upstream.status).json(selected);
  } catch {
    response.status(502).json({ error: "Yokaiba assistance is unavailable. Please try again." });
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "POST") { response.setHeader("allow", "POST"); response.status(405).json({ error: "Method not allowed" }); return; }
  if (!isRecord(request.body)) { response.status(400).json({ error: "A signed hint request is required" }); return; }
  const parsedRequest = parseHintRequest(request.body);
  if (!parsedRequest) { response.status(400).json({ error: "A valid signed hint request is required" }); return; }
  const context = parseSelectionContext(parsedRequest.body);
  const features = context ? playerStateFeatures(parsedRequest.body, context) : undefined;
  await deliverHint(parsedRequest, context, features, response);
}
