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

export function clueStrategyLabel(strategy: ClueStrategy): string {
  return CLUE_STRATEGIES[strategy].label;
}

export function isClueStrategy(value: unknown): value is ClueStrategy {
  return typeof value === "string" && Object.hasOwn(CLUE_STRATEGIES, value);
}
