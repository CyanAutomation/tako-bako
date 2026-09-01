export const scenarios = [
  { id: "tournament-order-v1", label: "Tournament Order", description: "A compact 4×4 warm-up." },
  { id: "open-division-v2", label: "Open Division", description: "A broader 5×5 challenge." },
  { id: "championship-circuit-v2", label: "Championship Circuit", description: "An expert 5×5 puzzle with three grids." },
] as const;

export type ScenarioId = typeof scenarios[number]["id"];
export const DEFAULT_SCENARIO_ID: ScenarioId = "tournament-order-v1";

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === "string" && scenarios.some(scenario => scenario.id === value);
}

const legacyScenarioIds: Record<string, ScenarioId> = {
  "open-division-v1": "open-division-v2",
  "championship-circuit-v1": "championship-circuit-v2",
};

/** Resolves current and previously shared scenario identifiers to the live catalog. */
export function scenarioIdFromUrl(value: unknown): ScenarioId | undefined {
  if (isScenarioId(value)) return value;
  return typeof value === "string" ? legacyScenarioIds[value] : undefined;
}
