import { clueStrategyLabel } from "../src/clue-strategy-catalog.js";
import {
  hintStrengthRank,
  MIN_PLAYER_STATE_CONFIDENCE,
  serializePlayerStateFeatures,
  type PlayerStateAssessment,
  type PlayerStateFeatures,
  type PlayerStatePolicy,
} from "../src/player-state.js";
import { requestJevDecision } from "../server/jev.js";
import type { SelectionContext } from "./hint-context-types.js";
import { isRecord } from "./hint-validation.js";
import { recordJevMetric } from "./jev-metrics.js";

export interface HintCandidate {
  id: string;
  payload: unknown;
  type: "clue" | "elimination" | "placement";
  text: string;
  clueId?: string;
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

export function hintCandidates(payload: unknown, context: SelectionContext): HintCandidate[] {
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

function candidateIndex(choice: string): number | undefined {
  const match = /^candidate_(\d+)$/.exec(choice);
  if (!match) return undefined;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function candidateIndexFromJevAnswer(answer: unknown): number | undefined {
  if (!isRecord(answer) || answer.type !== "choice" || typeof answer.choice !== "string") return undefined;
  if (typeof answer.confidence !== "number" || !Number.isFinite(answer.confidence)
    || answer.confidence < MIN_PLAYER_STATE_CONFIDENCE || answer.confidence > 1) return undefined;
  return candidateIndex(answer.choice);
}

function candidateFromJevResult(result: unknown, candidates: HintCandidate[]): HintCandidate | undefined {
  if (!isRecord(result) || !isRecord(result.answers)) return undefined;
  const selectedIndex = candidateIndexFromJevAnswer(result.answers.next_hint);
  return selectedIndex !== undefined && selectedIndex < candidates.length ? candidates[selectedIndex] : undefined;
}

async function selectCandidateWithJev(
  context: SelectionContext,
  candidates: HintCandidate[],
  features: PlayerStateFeatures | undefined,
  policy: PlayerStatePolicy | undefined,
  assessment: PlayerStateAssessment | undefined,
  clientAddress?: string,
): Promise<HintCandidate | undefined> {
  const startedAt = Date.now();
  const questionOptions = Object.fromEntries(candidates.map((candidate, index) => [`candidate_${index}`, `Candidate: ${candidate.type}. ${candidate.text}`]));
  const result = await requestJevDecision({
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
  }, clientAddress);
  const selected = candidateFromJevResult(result, candidates);
  recordJevMetric({ operation: "hint_selection", questionCount: 1, candidateCount: candidates.length, durationMs: Date.now() - startedAt, outcome: selected ? "success" : "fallback" });
  return selected;
}

function fallbackHintPayload(candidates: HintCandidate[], payload: unknown): unknown {
  const primary = candidates.find(candidate => candidate.id === "solver_primary");
  return primary?.payload ?? candidates[0]?.payload ?? payload;
}

export async function chooseHintPayload(
  context: SelectionContext,
  payload: unknown,
  features: PlayerStateFeatures | undefined,
  policy: PlayerStatePolicy | undefined,
  assessment: PlayerStateAssessment | undefined,
  clientAddress?: string,
): Promise<unknown> {
  const candidates = hintCandidates(payload, context);
  const boundedCandidates = candidatesForPolicy(candidates, policy);
  if (boundedCandidates.length === 0) return policy ? { error: "A suitable hint is unavailable." } : payload;
  if (boundedCandidates.length === 1) return boundedCandidates[0]!.payload;
  const selected = await selectCandidateWithJev(context, boundedCandidates, features, policy, assessment, clientAddress);
  return selected?.payload ?? fallbackHintPayload(boundedCandidates, payload);
}
