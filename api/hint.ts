import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clueStrategyLabel, isClueStrategy } from "../src/clue-strategy-catalog.js";
import type { ClueStrategy } from "../src/clue-strategy-catalog.js";
import { derivePlayerStateFeatures, hintStrengthForProgress, hintStrengthRank, MIN_PLAYER_STATE_CONFIDENCE, parsePlayerStateAssessment, policyForPlayerState, serializePlayerStateFeatures, type HintStrength, type PlayerStateFeatures, type PlayerStatePolicy } from "../src/player-state.js";
import { hasJevApiKey, requestJevDecision } from "../server/jev.js";
import { clientAddressFromForwardedFor } from "../server/client-address.js";

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
  hintIndex?: number;
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

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength;
}

function parseBoardMark(value: unknown): BoardMark | undefined {
  if (!isRecord(value)) return undefined;
  if (!isBoundedText(value.category, MAX_BOARD_VALUE_LENGTH)
    || !isBoundedText(value.subject, MAX_BOARD_VALUE_LENGTH)
    || !isBoundedText(value.value, MAX_BOARD_VALUE_LENGTH)) return undefined;
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
  if (value.hintsUsed !== undefined && !isBoundedInteger(value.hintsUsed, 0, MAX_HINT_COUNT)) return undefined;
  return {
    body: value,
    puzzleToken: value.puzzleToken,
    kind: value.kind as HintStrength | undefined,
    ...(typeof value.hintsUsed === "number" && value.hintsUsed > 0 ? { hintIndex: value.hintsUsed } : {}),
  };
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function hasValidPlayerCounts(value: Record<string, unknown>): boolean {
  return isBoundedInteger(value.totalMatches, 1, MAX_BOARD_MARKS)
    && isBoundedInteger(value.hintsUsed, 0, MAX_HINT_COUNT)
    && isBoundedInteger(value.mistakes, 0, MAX_HINT_COUNT)
    && isBoundedInteger(value.elapsedMs, 0, MAX_ELAPSED_MS);
}

function playerStateFeatures(value: Record<string, unknown>, context: SelectionContext): PlayerStateFeatures | undefined {
  if (!context.clues || !hasValidPlayerCounts(value) || typeof value.smartMarking !== "boolean") return undefined;
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

async function classifyPlayerState(features: PlayerStateFeatures, clientAddress?: string) {
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
  }, clientAddress);
  const assessment = parsePlayerStateAssessment(result);
  recordJevMetric({ operation: "player_state", questionCount: 1, candidateCount: 0, durationMs: Date.now() - startedAt, outcome: assessment ? "success" : "fallback" });
  return assessment;
}

function placementCandidate(id: string, payload: Record<string, unknown>): HintCandidate | undefined {
  if (payload.kind !== "placement" || !isRecord(payload.placement)) return undefined;
  const { subject, category, value } = payload.placement;
  if (typeof subject !== "string" || typeof category !== "string" || typeof value !== "string") return undefined;
  return { id, payload, type: "placement", text: `${subject} matches ${value} in ${category}.` };
}

function clueCandidate(id: string, payload: Record<string, unknown>): HintCandidate | undefined {
  if (!isRecord(payload.clue) || typeof payload.clue.text !== "string") return undefined;
  const type = payload.kind === "elimination" ? "elimination" : "clue";
  return {
    id,
    payload,
    type,
    text: payload.clue.text,
    ...(typeof payload.clue.id === "string" ? { clueId: payload.clue.id } : {}),
  };
}

function solverCandidate(id: string, payload: unknown): HintCandidate | undefined {
  if (!isRecord(payload)) return undefined;
  return placementCandidate(id, payload) ?? clueCandidate(id, payload);
}

function hasSupportedConfidence(answer: Record<string, unknown>): boolean {
  return typeof answer.confidence === "number"
    && Number.isFinite(answer.confidence)
    && answer.confidence >= MIN_PLAYER_STATE_CONFIDENCE
    && answer.confidence <= 1;
}

function candidateIndex(choice: string): number | undefined {
  const match = /^candidate_(\d+)$/.exec(choice);
  if (!match) return undefined;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function candidateIndexFromJevAnswer(answer: unknown): number | undefined {
  if (!isRecord(answer) || answer.type !== "choice" || typeof answer.choice !== "string" || !hasSupportedConfidence(answer)) return undefined;
  return candidateIndex(answer.choice);
}

function candidateFromJevResult(result: unknown, candidates: HintCandidate[]): HintCandidate | undefined {
  if (!isRecord(result) || !isRecord(result.answers)) return undefined;
  const selectedIndex = candidateIndexFromJevAnswer(result.answers.next_hint);
  return selectedIndex !== undefined && selectedIndex < candidates.length ? candidates[selectedIndex] : undefined;
}

function selectCandidateWithJev(context: SelectionContext, candidates: HintCandidate[], features?: PlayerStateFeatures, policy?: PlayerStatePolicy, assessment?: { state: string; confidence: number }, clientAddress?: string): Promise<HintCandidate | undefined> {
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
  }, clientAddress).then(result => {
    const selected = candidateFromJevResult(result, candidates);
    recordJevMetric({ operation: "hint_selection", questionCount: 1, candidateCount: candidates.length, durationMs: Date.now() - startedAt, outcome: selected ? "success" : "fallback" });
    return selected;
  });
}

function isUsedPrimaryClue(candidate: HintCandidate | undefined, context: SelectionContext): boolean {
  if (!candidate || candidate.type !== "clue") return false;
  const usedById = candidate.clueId !== undefined && context.usedClueIds.has(candidate.clueId);
  const usedByText = context.clues?.some(clue => context.usedClueIds.has(clue.id) && clue.text === candidate.text) ?? false;
  return usedById || usedByText;
}

function appendUnusedClues(candidates: HintCandidate[], primary: HintCandidate | undefined, context: SelectionContext): void {
  for (const clue of context.clues ?? []) {
    if (context.usedClueIds.has(clue.id) || primary?.clueId === clue.id) continue;
    candidates.push({
      id: `clue:${clue.id}`,
      payload: { kind: "clue", clue: { id: clue.id, text: clue.text } },
      type: "clue",
      text: `${clue.text}${clue.strategy ? ` (reasoning strategy: ${clueStrategyLabel(clue.strategy)})` : ""}`,
    });
  }
}

function hintCandidates(payload: unknown, context: SelectionContext): HintCandidate[] {
  const candidates: HintCandidate[] = [];
  const primary = solverCandidate("solver_primary", payload);
  if (primary && !isUsedPrimaryClue(primary, context)) candidates.push(primary);
  appendUnusedClues(candidates, primary, context);
  return candidates;
}

function candidatesForPolicy(candidates: HintCandidate[], policy: PlayerStatePolicy | undefined): HintCandidate[] {
  if (!policy) return candidates;
  const maximumStrength = hintStrengthRank(policy.hintKind);
  return candidates.filter(candidate => hintStrengthRank(candidate.type) <= maximumStrength);
}

function fallbackHintPayload(candidates: HintCandidate[], payload: unknown): unknown {
  const primary = candidates.find(candidate => candidate.id === "solver_primary");
  return primary?.payload ?? candidates[0]?.payload ?? payload;
}

async function chooseHintPayload(
  context: SelectionContext,
  payload: unknown,
  features: PlayerStateFeatures | undefined,
  policy: PlayerStatePolicy | undefined,
  assessment: Awaited<ReturnType<typeof classifyPlayerState>>,
  clientAddress?: string,
): Promise<unknown> {
  const candidates = hintCandidates(payload, context);
  const boundedCandidates = candidatesForPolicy(candidates, policy);
  if (boundedCandidates.length === 0) return policy ? { error: "A suitable hint is unavailable." } : payload;
  if (boundedCandidates.length === 1) return boundedCandidates[0]!.payload;
  const selected = await selectCandidateWithJev(context, boundedCandidates, features, policy, assessment, clientAddress);
  return selected?.payload ?? fallbackHintPayload(boundedCandidates, payload);
}

async function fetchPrimaryHint(puzzleToken: string, hintKind: HintStrength | undefined, response: VercelResponse, hintIndex?: number): Promise<{ upstream: Response; payload: unknown } | undefined> {
  const upstream = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ puzzleToken, ...(hintKind === undefined ? {} : { kind: hintKind }), ...(hintIndex === undefined ? {} : { hintIndex }) }),
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

function respondWithPayload(response: VercelResponse, result: { upstream: Response; payload: unknown }, payload: unknown): void {
  response.status(result.upstream.status).json(payload);
}

function respondWithHint(response: VercelResponse, result: { upstream: Response; payload: unknown }): void {
  respondWithPayload(response, result, result.payload);
}

function deliverWithoutJev(response: VercelResponse, result: { upstream: Response; payload: unknown }, context: SelectionContext): void {
  const candidates = hintCandidates(result.payload, context);
  respondWithPayload(response, result, candidates[0]?.payload ?? result.payload);
}

async function deliverWithJev(
  request: ParsedHintRequest,
  initialResult: { upstream: Response; payload: unknown },
  context: SelectionContext,
  features: PlayerStateFeatures | undefined,
  defaultKind: HintStrength | undefined,
  clientAddress: string | undefined,
  response: VercelResponse,
): Promise<void> {
  // Yokaiba must accept the token before any caller-controlled state reaches Jev.
  const assessment = features ? await classifyPlayerState(features, clientAddress) : undefined;
  const policy = assessment && features ? policyForPlayerState(assessment.state, features) : undefined;
  const hintKind = policy?.hintKind ?? defaultKind;
  const result = hintKind === defaultKind
    ? initialResult
    : await fetchPrimaryHint(request.puzzleToken, hintKind, response, request.hintIndex);
  if (!result) return;
  const selected = await chooseHintPayload(context, result.payload, features, policy, assessment, clientAddress);
  respondWithPayload(response, result, selected);
}

async function deliverHint(request: ParsedHintRequest, context: SelectionContext | undefined, features: PlayerStateFeatures | undefined, clientAddress: string | undefined, response: VercelResponse): Promise<void> {
  const defaultKind = features ? hintStrengthForProgress(features.affirmativeCount, features.totalMatches) : request.kind;
  try {
    const result = await fetchPrimaryHint(request.puzzleToken, defaultKind, response, request.hintIndex);
    if (!result) return;
    if (!context || !context.clues?.length) {
      respondWithHint(response, result);
      return;
    }
    if (!hasJevApiKey()) {
      deliverWithoutJev(response, result, context);
      return;
    }
    await deliverWithJev(request, result, context, features, defaultKind, clientAddress, response);
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
  const clientAddress = clientAddressFromForwardedFor(request.headers?.["x-forwarded-for"]);
  await deliverHint(parsedRequest, context, features, clientAddress, response);
}
