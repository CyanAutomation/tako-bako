export const CLUE_STRATEGIES = {
  direct_match: { label: "Direct match", description: "Connects one person or item directly to another." },
  elimination: { label: "Rule out", description: "Rules out a possible pairing or case." },
  adjacency: { label: "Neighbours", description: "Uses next-to or adjacent positions." },
  order: { label: "Order", description: "Uses sequence, rank, or an earlier/later position." },
  distance: { label: "Spacing", description: "Uses a fixed number of positions between items." },
  relation: { label: "Relationship", description: "Connects items through a relationship across categories." },
  compound: { label: "Combine clues", description: "Requires combining multiple relationships." },
  other: { label: "Mixed reasoning", description: "A clue that does not fit the other strategy labels." },
} as const;

export type ClueStrategy = keyof typeof CLUE_STRATEGIES;
export const MIN_CLUE_STRATEGY_CONFIDENCE = 0.75;

const knownConstraintStrategies: Record<string, ClueStrategy> = {
  matches: "direct_match",
  match: "direct_match",
  distance: "distance",
  adjacent: "adjacency",
  adjacency: "adjacency",
  next_to: "adjacency",
  before: "order",
  after: "order",
  position: "order",
  order: "order",
  excludes: "elimination",
  exclusion: "elimination",
  not_matches: "elimination",
};

export function strategyForConstraintKind(kind: unknown): ClueStrategy | undefined {
  if (typeof kind !== "string") return undefined;
  const normalized = kind.trim().toLocaleLowerCase().replace(/[\s-]+/g, "_");
  return knownConstraintStrategies[normalized];
}

export function clueStrategyLabel(strategy: ClueStrategy): string {
  return CLUE_STRATEGIES[strategy].label;
}

export function isClueStrategy(value: unknown): value is ClueStrategy {
  return typeof value === "string" && Object.hasOwn(CLUE_STRATEGIES, value);
}

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
