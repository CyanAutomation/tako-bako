const EVENTS = new Set(["puzzle_started", "puzzle_completed", "hint_used", "mistake", "puzzle_abandoned"]);
const TEMPLATE_IDS = new Set(["tournament-order-v1", "tournament-order-v2", "open-division-v2", "championship-bridge-v1", "championship-circuit-v2"]);
const NUMBER_FIELDS = ["requestedDifficultyLevel", "assessedDifficultyLevel", "clueCount", "elapsedMs", "hintsUsed", "mistakes"] as const;
const BOOLEAN_FIELDS = ["smartMarkingEnabled"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedNumber(field: typeof NUMBER_FIELDS[number], value: unknown): value is number {
  const isDifficulty = field === "requestedDifficultyLevel" || field === "assessedDifficultyLevel";
  const minimum = isDifficulty ? 1 : 0;
  const maximum = isDifficulty ? 12 : field === "elapsedMs" ? 86_400_000 : 100;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function copyAllowedFields<T extends string>(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  fields: readonly T[],
  isAllowed: (field: T, value: unknown) => boolean,
): boolean {
  for (const field of fields) {
    const candidate = source[field];
    if (candidate === undefined) continue;
    if (!isAllowed(field, candidate)) return false;
    target[field] = candidate;
  }
  return true;
}

function isAllowedBoolean(_field: typeof BOOLEAN_FIELDS[number], value: unknown): boolean {
  return isBoolean(value);
}

/** Validates and strips all fields that are not part of the anonymous event contract. */
export function parseEventPayload(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || typeof value.event !== "string" || !EVENTS.has(value.event)
    || typeof value.templateId !== "string" || !TEMPLATE_IDS.has(value.templateId)) return undefined;
  const event: Record<string, unknown> = { event: value.event, templateId: value.templateId };
  const numbersAreValid = copyAllowedFields(value, event, NUMBER_FIELDS, isAllowedNumber);
  const booleansAreValid = copyAllowedFields(value, event, BOOLEAN_FIELDS, isAllowedBoolean);
  return numbersAreValid && booleansAreValid ? event : undefined;
}
