/** Returns the verified result, or undefined for a malformed server response. */
export function parseAnswerVerification(value: unknown): boolean | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const correct = (value as { correct?: unknown }).correct;
  return typeof correct === "boolean" ? correct : undefined;
}
