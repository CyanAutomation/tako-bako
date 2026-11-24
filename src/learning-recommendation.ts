import { CLUE_STRATEGIES, isClueStrategy, type ClueStrategy } from "./clue-strategy-catalog.js";
import type { Clue } from "./puzzle.js";

export type StrategyUsageCounts = Partial<Record<ClueStrategy, number>>;

export interface LearningRecommendation {
  strategy: ClueStrategy;
  title: string;
  focus: string;
  body: string;
}

export const LEARNING_RECOMMENDATION_CONFIDENCE = 0.75;

const STRATEGIES = Object.keys(CLUE_STRATEGIES) as ClueStrategy[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function strategyUsageCountsForGame(
  clues: readonly Clue[],
  clueStrategies: Readonly<Record<string, ClueStrategy>>,
  usedClueIds: ReadonlySet<string>,
): StrategyUsageCounts {
  const counts: StrategyUsageCounts = {};
  for (const clue of clues) {
    if (!usedClueIds.has(clue.id)) continue;
    const strategy = clue.strategy ?? clueStrategies[clue.id];
    if (strategy && isClueStrategy(strategy)) counts[strategy] = (counts[strategy] ?? 0) + 1;
  }
  return counts;
}

/** Selects the least-used catalog strategy, breaking ties by catalog order. */
export function fallbackLearningStrategy(counts: StrategyUsageCounts): ClueStrategy {
  return STRATEGIES.reduce((best, strategy) => {
    const rawCurrentCount = counts[strategy];
    const rawBestCount = counts[best];
    const currentCount = Number.isSafeInteger(rawCurrentCount) && rawCurrentCount! >= 0 ? rawCurrentCount! : 0;
    const bestCount = Number.isSafeInteger(rawBestCount) && rawBestCount! >= 0 ? rawBestCount! : 0;
    return currentCount < bestCount ? strategy : best;
  }, STRATEGIES[0]!);
}

export function buildLearningRecommendation(strategy: ClueStrategy): LearningRecommendation {
  const definition = CLUE_STRATEGIES[strategy];
  if (!definition) throw new TypeError("Learning strategy is unsupported.");
  return {
    strategy,
    title: "A strategy to carry forward",
    focus: definition.label,
    body: `${definition.description} Look for this kind of reasoning in your next puzzle.`,
  };
}

export function parseLearningRecommendationStrategy(value: unknown): ClueStrategy | undefined {
  if (!isRecord(value) || !isRecord(value.answers) || !isRecord(value.answers.practice_strategy)) return undefined;
  const answer = value.answers.practice_strategy;
  if (answer.type !== "choice" || !isClueStrategy(answer.choice)
    || typeof answer.confidence !== "number" || !Number.isFinite(answer.confidence)
    || answer.confidence < LEARNING_RECOMMENDATION_CONFIDENCE || answer.confidence > 1) return undefined;
  return answer.choice;
}

/** The public response carries a catalog ID only; the browser supplies trusted copy. */
export function parseLearningRecommendationResponse(value: unknown): LearningRecommendation | undefined {
  if (!isRecord(value) || !isClueStrategy(value.strategy)) return undefined;
  return buildLearningRecommendation(value.strategy);
}
