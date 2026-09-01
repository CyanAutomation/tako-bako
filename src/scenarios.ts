export const scenarios = [
  { id: "tournament-order-v1", label: "Tournament Order", description: "A compact 4×4 warm-up." },
  { id: "open-division-v1", label: "Open Division", description: "A broader 5×5 challenge." },
  { id: "championship-circuit-v1", label: "Championship Circuit", description: "An expert 5×5 puzzle with three grids." },
] as const;

export type ScenarioId = typeof scenarios[number]["id"];
export const DEFAULT_SCENARIO_ID: ScenarioId = "tournament-order-v1";

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === "string" && scenarios.some(scenario => scenario.id === value);
}
