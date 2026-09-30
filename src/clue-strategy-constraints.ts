import type { ClueStrategy } from "./clue-strategy-catalog.js";

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
