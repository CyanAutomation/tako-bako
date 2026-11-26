import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CLUE_STRATEGIES, isClueStrategy, type ClueStrategy } from "../src/clue-strategy-catalog.js";
import { fallbackLearningStrategy, LEARNING_RECOMMENDATION_CONFIDENCE, parseLearningRecommendationStrategy, type StrategyUsageCounts } from "../src/learning-recommendation.js";
import { MAX_ELAPSED_MS, MAX_MISTAKES_COUNT } from "../src/events.js";
import { hasJevApiKey, requestJevDecision } from "../server/jev.js";
import { isBoundedInteger, isBoundedText, isRecord, MAX_PUZZLE_TOKEN_LENGTH } from "../server/hints/validation.js";
import { recordJevMetric } from "../server/jev-metrics.js";
import { yokaibaApiOrigin } from "../server/yokaiba-origin.js";

const YOKAIBA_HINT_URL = `${yokaibaApiOrigin()}/v1/puzzles/hint`;
const MAX_HINTS_USED = 100;
const MAX_STRATEGY_USES = 64;
const STRATEGIES = Object.keys(CLUE_STRATEGIES) as ClueStrategy[];

interface LearningRecommendationInput {
  puzzleToken: string;
  hintsUsed: number;
  mistakes: number;
  elapsedMs: number;
  strategyUsageCounts: StrategyUsageCounts;
}

function parseInput(value: unknown): LearningRecommendationInput | undefined {
  if (!isRecord(value)) return undefined;
  const allowedKeys = new Set(["puzzleToken", "hintsUsed", "mistakes", "elapsedMs", "strategyUsageCounts"]);
  if (Object.keys(value).some(key => !allowedKeys.has(key))) return undefined;
  if (!isBoundedText(value.puzzleToken, MAX_PUZZLE_TOKEN_LENGTH)
    || !isBoundedInteger(value.hintsUsed, 0, MAX_HINTS_USED)
    || !isBoundedInteger(value.mistakes, 0, MAX_MISTAKES_COUNT)
    || !isBoundedInteger(value.elapsedMs, 0, MAX_ELAPSED_MS)
    || !isRecord(value.strategyUsageCounts)) return undefined;

  const strategyUsageCounts: StrategyUsageCounts = {};
  for (const [key, count] of Object.entries(value.strategyUsageCounts)) {
    if (!isClueStrategy(key) || !isBoundedInteger(count, 0, MAX_STRATEGY_USES)) return undefined;
    strategyUsageCounts[key] = count;
  }
  return {
    puzzleToken: value.puzzleToken,
    hintsUsed: value.hintsUsed,
    mistakes: value.mistakes,
    elapsedMs: value.elapsedMs,
    strategyUsageCounts,
  };
}

async function puzzleTokenIsUsable(token: string): Promise<"valid" | "rejected" | "unavailable"> {
  try {
    const response = await fetch(YOKAIBA_HINT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ puzzleToken: token, kind: "clue" }),
      signal: AbortSignal.timeout(8_000),
    });
    if (response.ok) return "valid";
    return response.status >= 400 && response.status < 500 ? "rejected" : "unavailable";
  } catch {
    return "unavailable";
  }
}

function recordRecommendationMetric(startedAt: number, outcome: "success" | "fallback" | "disabled"): void {
  recordJevMetric({
    operation: "learning_recommendation",
    questionCount: 1,
    candidateCount: STRATEGIES.length,
    durationMs: Math.max(0, Date.now() - startedAt),
    outcome,
  });
}

async function chooseWithJev(input: LearningRecommendationInput): Promise<ClueStrategy | undefined> {
  const strategyUsageCounts = Object.fromEntries(Object.entries(input.strategyUsageCounts).filter(([, count]) => count !== undefined && count > 0));
  const criteria = Object.fromEntries(STRATEGIES.map(strategy => [strategy, CLUE_STRATEGIES[strategy].description]));
  const result = await requestJevDecision({
    state: {
      hints_used: input.hintsUsed,
      mistakes: input.mistakes,
      elapsed_ms: input.elapsedMs,
      strategy_usage_counts: strategyUsageCounts,
    },
    questions: {
      practice_strategy: {
        type: "choice",
        instructions: `Choose one listed reasoning strategy as a useful focus to carry into the next puzzle. Prefer a strategy used less often in this puzzle. The counts are only session context; do not infer ability or personality. Return a choice from the listed strategies with confidence at least ${LEARNING_RECOMMENDATION_CONFIDENCE}.`,
        criteria,
      },
    },
  });
  return parseLearningRecommendationStrategy(result);
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "POST") { response.setHeader("allow", "POST"); response.status(405).json({ error: "Method not allowed" }); return; }
  const input = parseInput(request.body);
  if (!input) { response.status(400).json({ error: "A bounded learning summary is required" }); return; }
  response.setHeader("cache-control", "no-store");

  const fallback = fallbackLearningStrategy(input.strategyUsageCounts);
  if (!hasJevApiKey()) {
    recordRecommendationMetric(Date.now(), "disabled");
    response.status(200).json({ strategy: fallback });
    return;
  }

  const startedAt = Date.now();
  const tokenStatus = await puzzleTokenIsUsable(input.puzzleToken);
  if (tokenStatus === "rejected") {
    response.status(401).json({ error: "A valid signed puzzle token is required" });
    return;
  }
  if (tokenStatus === "unavailable") {
    recordRecommendationMetric(startedAt, "fallback");
    response.status(200).json({ strategy: fallback });
    return;
  }

  const selected = await chooseWithJev(input);
  const outcome = selected ? "success" : "fallback";
  recordRecommendationMetric(startedAt, outcome);
  response.status(200).json({ strategy: selected ?? fallback });
}

export const config = {
  api: { bodyParser: { sizeLimit: "32kb" } },
};
