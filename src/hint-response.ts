export type ParsedHintResponse =
  | { kind: "placement"; placement: { subject: string; category: string; value: string } }
  | { kind: "clue"; clue: { id?: string; text: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseHintResponse(value: unknown): ParsedHintResponse | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "placement" && isRecord(value.placement)
    && typeof value.placement.subject === "string" && typeof value.placement.category === "string" && typeof value.placement.value === "string") {
    return { kind: "placement", placement: { subject: value.placement.subject, category: value.placement.category, value: value.placement.value } };
  }
  if (isRecord(value.clue) && typeof value.clue.text === "string") {
    return { kind: "clue", clue: { text: value.clue.text, ...(typeof value.clue.id === "string" ? { id: value.clue.id } : {}) } };
  }
  return undefined;
}
