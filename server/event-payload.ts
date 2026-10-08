import { GAME_EVENT_TYPES, MAX_DIFFICULTY_LEVEL, MAX_ELAPSED_MS, MAX_MISTAKES_COUNT, MIN_DIFFICULTY_LEVEL } from "../src/events.js";
import { scenarios } from "../src/scenarios.js";

const EVENTS = new Set<string>(GAME_EVENT_TYPES);
const TEMPLATE_IDS = new Set<string>(scenarios.map(scenario => scenario.id));
const NUMBER_FIELDS = ["requestedDifficultyLevel", "assessedDifficultyLevel", "clueCount", "elapsedMs", "hintsUsed", "mistakes"] as const;
const BOOLEAN_FIELDS = ["smartMarkingEnabled"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedNumber(field: typeof NUMBER_FIELDS[number], value: unknown): value is number {
  const isDifficulty = field === "requestedDifficultyLevel" || field === "assessedDifficultyLevel";
  const minimum = isDifficulty ? MIN_DIFFICULTY_LEVEL : 0;
  const maximum = isDifficulty ? MAX_DIFFICULTY_LEVEL : field === "elapsedMs" ? MAX_ELAPSED_MS : MAX_MISTAKES_COUNT;
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
  const schemaVersion = value.schemaVersion === undefined ? 0 : value.schemaVersion;
  if (schemaVersion !== 0 && schemaVersion !== 1) return undefined;
  const event: Record<string, unknown> = { schemaVersion, event: value.event, templateId: value.templateId };
  const numbersAreValid = copyAllowedFields(value, event, NUMBER_FIELDS, isAllowedNumber);
  const booleansAreValid = copyAllowedFields(value, event, BOOLEAN_FIELDS, isAllowedBoolean);
  if (schemaVersion === 1) {
    const requiredFields = value.event === "puzzle_completed" || value.event === "puzzle_abandoned"
      ? ["elapsedMs", "hintsUsed", "mistakes"]
      : ["hintsUsed", "mistakes"];
    if (requiredFields.some(field => !Object.hasOwn(event, field))) return undefined;
  }
  return numbersAreValid && booleansAreValid ? event : undefined;
}