const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const JEV_TIMEOUT_MS = 5_000;

export interface JevDecisionRequest {
  state: unknown;
  questions: Record<string, unknown>;
}

export function hasJevApiKey(): boolean {
  return typeof process.env.OPENROUTER_API_KEY === "string" && process.env.OPENROUTER_API_KEY.length > 0;
}

/** Returns undefined on all provider/configuration failures so callers can fall back safely. */
export async function requestJevDecision(request: JevDecisionRequest): Promise<Record<string, unknown> | undefined> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return undefined;
  try {
    const response = await fetch(OPENROUTER_DECISIONS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.JEV_MODEL || "~typesafe/jev-latest", ...request }),
      signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const payload: unknown = await response.json();
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}
