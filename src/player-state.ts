import { CLUE_STRATEGIES, isClueStrategy, type ClueStrategy } from "./clue-strategy.js";

export const PLAYER_PUZZLE_STATES = [
  "progressing",
  "stalled",
  "likely_wrong_turn",
  "needs_strategy_nudge",
  "ready_for_stronger_hint",
] as const;

export type PlayerPuzzleState = typeof PLAYER_PUZZLE_STATES[number];
export type HintStrength = "clue" | "elimination" | "placement";

export interface PlayerStateFeatures {
  affirmativeCount: number;
  negativeCount: number;
  totalMatches: number;
  readinessPercent: number;
  hintsUsed: number;
  mistakes: number;
  elapsedMs: number;
  usedClueCount: number;
  unusedClueCount: number;
  usedStrategyCounts: Partial<Record<ClueStrategy, number>>;
  smartMarking: boolean;
}

export interface PlayerStateAssessment {
  state: PlayerPuzzleState;
  confidence: number;
}

export interface PlayerStatePolicy {
  hintKind: HintStrength;
  maxHintStrength: HintStrength;
  preferredCandidateType?: HintStrength;
}

export const MIN_PLAYER_STATE_CONFIDENCE = 0.75;

const HINT_STRENGTHS: readonly HintStrength[] = ["clue", "elimination", "placement"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlayerPuzzleState(value: unknown): value is PlayerPuzzleState {
  return typeof value === "string" && (PLAYER_PUZZLE_STATES as readonly string[]).includes(value);
}

/** Accept only a typed, sufficiently confident classification from Jev. */
export function parsePlayerStateAssessment(value: unknown): PlayerStateAssessment | undefined {
  if (!isRecord(value) || !isRecord(value.answers) || !isRecord(value.answers.player_state)) return undefined;
  const answer = value.answers.player_state;
  if (answer.type !== "choice" || !isPlayerPuzzleState(answer.choice)
    || typeof answer.confidence !== "number" || !Number.isFinite(answer.confidence)
    || answer.confidence < MIN_PLAYER_STATE_CONFIDENCE || answer.confidence > 1) return undefined;
  return { state: answer.choice, confidence: answer.confidence };
}

export function derivePlayerStateFeatures(input: {
  board: readonly { mark: "yes" | "no" }[];
  totalMatches: number;
  hintsUsed: number;
  mistakes: number;
  elapsedMs: number;
  clues: readonly { id: string; strategy?: ClueStrategy }[];
  usedClueIds: ReadonlySet<string>;
  smartMarking: boolean;
}): PlayerStateFeatures {
  const affirmativeCount = input.board.filter(mark => mark.mark === "yes").length;
  const negativeCount = input.board.filter(mark => mark.mark === "no").length;
  const usedClues = input.clues.filter(clue => input.usedClueIds.has(clue.id));
  const usedStrategyCounts: Partial<Record<ClueStrategy, number>> = {};
  for (const clue of usedClues) {
    if (clue.strategy && isClueStrategy(clue.strategy)) {
      usedStrategyCounts[clue.strategy] = (usedStrategyCounts[clue.strategy] ?? 0) + 1;
    }
  }
  return {
    affirmativeCount,
    negativeCount,
    totalMatches: input.totalMatches,
    readinessPercent: Math.min(100, Math.round((affirmativeCount / input.totalMatches) * 100)),
    hintsUsed: input.hintsUsed,
    mistakes: input.mistakes,
    elapsedMs: input.elapsedMs,
    usedClueCount: usedClues.length,
    unusedClueCount: input.clues.length - usedClues.length,
    usedStrategyCounts,
    smartMarking: input.smartMarking,
  };
}

export function hintStrengthForProgress(affirmativeCount: number, totalMatches: number): HintStrength {
  if (affirmativeCount === 0) return "clue";
  return affirmativeCount < Math.ceil(totalMatches / 2) ? "elimination" : "placement";
}

function nextHintStrength(strength: HintStrength): HintStrength {
  return HINT_STRENGTHS[Math.min(HINT_STRENGTHS.length - 1, HINT_STRENGTHS.indexOf(strength) + 1)]!;
}

/**
 * JEV supplies only a bounded state label. Tako Bako keeps strength policy
 * deterministic: no first-request escalation, and later requests can advance
 * at most one step above the existing progress-based strength.
 */
export function policyForPlayerState(state: PlayerPuzzleState, features: PlayerStateFeatures): PlayerStatePolicy {
  const baseStrength = hintStrengthForProgress(features.affirmativeCount, features.totalMatches);
  const maxHintStrength = features.hintsUsed === 0 ? baseStrength : nextHintStrength(baseStrength);

  switch (state) {
    case "progressing":
      return { hintKind: baseStrength, maxHintStrength };
    case "needs_strategy_nudge":
      return { hintKind: "clue", maxHintStrength, preferredCandidateType: "clue" };
    case "likely_wrong_turn": {
      const hintKind = HINT_STRENGTHS.indexOf(maxHintStrength) >= HINT_STRENGTHS.indexOf("elimination") ? "elimination" : baseStrength;
      return { hintKind, maxHintStrength, ...(hintKind === "elimination" ? { preferredCandidateType: "elimination" as const } : {}) };
    }
    case "stalled":
    case "ready_for_stronger_hint":
      return { hintKind: maxHintStrength, maxHintStrength, preferredCandidateType: maxHintStrength };
  }
}

export function serializePlayerStateFeatures(features: PlayerStateFeatures): Record<string, unknown> {
  const strategyCounts = Object.fromEntries(Object.entries(CLUE_STRATEGIES)
    .flatMap(([strategy]) => {
      const count = features.usedStrategyCounts[strategy as ClueStrategy];
      return count ? [[strategy, count]] : [];
    }));
  return {
    affirmative_count: features.affirmativeCount,
    negative_count: features.negativeCount,
    total_matches: features.totalMatches,
    readiness_percent: features.readinessPercent,
    hints_used: features.hintsUsed,
    mistakes: features.mistakes,
    elapsed_ms: features.elapsedMs,
    used_clue_count: features.usedClueCount,
    unused_clue_count: features.unusedClueCount,
    used_strategy_counts: strategyCounts,
    smart_marking: features.smartMarking,
  };
}

export function hintStrengthRank(strength: HintStrength): number {
  return HINT_STRENGTHS.indexOf(strength);
}
