import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  hintStrengthForProgress,
  parsePlayerStateAssessment,
  policyForPlayerState,
  serializePlayerStateFeatures,
  type HintStrength,
  type PlayerStateFeatures,
  type PlayerStateAssessment,
} from "../src/player-state.js";
import { hasJevApiKey, requestJevDecision } from "../server/jev.js";
import { chooseHintPayload, hintCandidates } from "./hint-selection.js";
import { parseHintRequest, type ParsedHintRequest } from "./hint-input.js";
import { parseSelectionContext, playerStateFeatures } from "./hint-context.js";
import type { SelectionContext } from "./hint-context-types.js";
import { isRecord } from "./hint-validation.js";
import { recordJevMetric } from "./jev-metrics.js";
import { yokaibaApiOrigin } from "../server/yokaiba-origin.js";

const HINT_API_URL = `${yokaibaApiOrigin()}/v1/puzzles/hint`;

async function classifyPlayerState(features: PlayerStateFeatures): Promise<PlayerStateAssessment | undefined> {
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

async function fetchPrimaryHint(
  puzzleToken: string,
  hintKind: HintStrength | undefined,
  response: VercelResponse,
  hintIndex?: number,
): Promise<{ upstream: Response; payload: unknown } | undefined> {
  const upstream = await fetch(HINT_API_URL, {
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
  response: VercelResponse,
): Promise<void> {
  // Yokaiba must accept the token before any caller-controlled state reaches Jev.
  const assessment = features ? await classifyPlayerState(features) : undefined;
  const policy = assessment && features ? policyForPlayerState(assessment.state, features) : undefined;
  const hintKind = policy?.hintKind ?? defaultKind;
  const result = hintKind === defaultKind
    ? initialResult
    : await fetchPrimaryHint(request.puzzleToken, hintKind, response, request.hintIndex);
  if (!result) return;
  const selected = await chooseHintPayload(context, result.payload, features, policy, assessment);
  respondWithPayload(response, result, selected);
}

async function deliverHint(
  request: ParsedHintRequest,
  context: SelectionContext | undefined,
  features: PlayerStateFeatures | undefined,
  response: VercelResponse,
): Promise<void> {
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
    await deliverWithJev(request, result, context, features, defaultKind, response);
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

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};
