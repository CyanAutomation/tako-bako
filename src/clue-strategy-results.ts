import { isClueStrategy } from "./clue-strategy-catalog.js";
import type { ClueStrategy } from "./clue-strategy-catalog.js";

const MIN_CLUE_STRATEGY_CONFIDENCE = 0.75;

/** Keeps only one confident label for each clue explicitly requested by the caller. */
export function parseClueStrategyResults(value: unknown, allowedClueIds: readonly string[]): Map<string, ClueStrategy> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return new Map();
  const strategies = (value as { strategies?: unknown }).strategies;
  if (!Array.isArray(strategies)) return new Map();
  const allowed = new Set(allowedClueIds);
  const parsed = new Map<string, ClueStrategy>();
  for (const entry of strategies) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const result = entry as { clueId?: unknown; strategy?: unknown; confidence?: unknown };
    if (typeof result.clueId !== "string" || !allowed.has(result.clueId) || parsed.has(result.clueId)) continue;
    if (!isClueStrategy(result.strategy) || typeof result.confidence !== "number" || !Number.isFinite(result.confidence) || result.confidence < MIN_CLUE_STRATEGY_CONFIDENCE || result.confidence > 1) continue;
    parsed.set(result.clueId, result.strategy);
  }
  return parsed;
}
